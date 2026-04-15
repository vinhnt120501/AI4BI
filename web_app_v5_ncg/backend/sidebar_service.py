from __future__ import annotations

import json
import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

from db.connection import get_connection
from db.sidebar_store import (
    count_heartbeat,
    count_signals,
    count_landing_suggestions,
    delete_heartbeat,
    delete_landing_suggestions,
    delete_signals,
    get_heartbeat_page,
    get_landing_suggestions,
    get_signals_page,
    insert_heartbeat,
    insert_landing_suggestions,
    insert_signals,
)
from llm import generate_chat, message_text
from prompts import DAILY_HEARTBEAT_PROMPT, DAILY_SIGNALS_PROMPT, LANDING_SUGGESTIONS_PROMPT


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_float(v: Any) -> float:
    try:
        if v is None:
            return 0.0
        return float(v)
    except Exception:
        return 0.0


def _format_money_vnd(value: float) -> str:
    v = abs(value)
    sign = "-" if value < 0 else ""
    if v >= 1e9:
        return f"{sign}{v/1e9:.1f}B₫"
    if v >= 1e6:
        return f"{sign}{v/1e6:.1f}M₫"
    if v >= 1e3:
        return f"{sign}{v/1e3:.1f}K₫"
    return f"{sign}{int(v):,}₫"


def _parse_llm_json_object_array(text: str) -> list[dict]:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    match = re.search(r"\[[\s\S]*\]", raw)
    candidate = match.group(0) if match else raw
    try:
        parsed = json.loads(candidate)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return [x for x in parsed if isinstance(x, dict)]


def _dedupe_rows(rows: list[dict], key_fields: list[str]) -> list[dict]:
    seen = set()
    out: list[dict] = []
    for r in rows:
        parts = []
        for f in key_fields:
            parts.append(str(r.get(f) or "").strip().lower())
        key = re.sub(r"\s+", " ", "|".join(parts)).strip("|")
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def _get_table_max_dates() -> dict[str, date | None]:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT MAX(sale_date) AS max_sales FROM sales_transactions")
    row_sales = cursor.fetchone() or {}
    cursor.close()
    conn.close()

    def _to_date(v: Any) -> date | None:
        if isinstance(v, date):
            return v
        try:
            if v:
                return date.fromisoformat(str(v)[:10])
        except Exception:
            return None
        return None

    dt = _to_date(row_sales.get("max_sales"))
    return {"sales": dt, "returns": dt}


def _next_day(d: date) -> date:
    return d + timedelta(days=1)


def _fetch_revenue_wow_by_region(as_of: date) -> list[dict]:
    end_exclusive = _next_day(as_of)
    sql = """
    SELECT
      IFNULL(parent.region_name, r.region_name) AS region,
      SUM(CASE
        WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 7 DAY)
         AND st.sale_date < %s
        THEN st.total_revenue ELSE 0 END
      ) AS curr_rev,
      SUM(CASE
        WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 14 DAY)
         AND st.sale_date < DATE_SUB(%s, INTERVAL 7 DAY)
        THEN st.total_revenue ELSE 0 END
      ) AS prev_rev
    FROM sales_transactions st
    JOIN regions r ON st.region_id = r.region_id
    LEFT JOIN regions parent ON r.parent_region_id = parent.region_id
    GROUP BY IFNULL(parent.region_name, r.region_name)
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(sql, (end_exclusive, end_exclusive, end_exclusive, end_exclusive))
    rows = cursor.fetchall() or []
    cursor.close()
    conn.close()

    out: list[dict] = []
    for r in rows:
        prev = _safe_float(r.get("prev_rev"))
        curr = _safe_float(r.get("curr_rev"))
        if prev <= 0:
            continue
        delta = curr - prev
        pct = delta / prev
        out.append({**r, "delta": delta, "delta_pct": pct, "score": abs(delta) * abs(pct)})
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


def _fetch_revenue_wow_by_province(as_of: date) -> list[dict]:
    end_exclusive = _next_day(as_of)
    sql = """
    SELECT
      r.region_name AS province,
      SUM(CASE
        WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 7 DAY)
         AND st.sale_date < %s
        THEN st.total_revenue ELSE 0 END
      ) AS curr_rev,
      SUM(CASE
        WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 14 DAY)
         AND st.sale_date < DATE_SUB(%s, INTERVAL 7 DAY)
        THEN st.total_revenue ELSE 0 END
      ) AS prev_rev
    FROM sales_transactions st
    JOIN regions r ON st.region_id = r.region_id
    WHERE st.sale_date >= DATE_SUB(%s, INTERVAL 14 DAY)
      AND st.sale_date < %s
      AND r.parent_region_id IS NOT NULL
    GROUP BY r.region_name
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(sql, (end_exclusive, end_exclusive, end_exclusive, end_exclusive, end_exclusive, end_exclusive))
    rows = cursor.fetchall() or []
    cursor.close()
    conn.close()

    out: list[dict] = []
    for r in rows:
        prev = _safe_float(r.get("prev_rev"))
        curr = _safe_float(r.get("curr_rev"))
        if prev <= 0:
            continue
        delta = curr - prev
        pct = delta / prev
        out.append({**r, "delta": delta, "delta_pct": pct, "score": abs(delta) * abs(pct)})
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


def _fetch_revenue_wow_by_customer(as_of: date) -> list[dict]:
    end_exclusive = _next_day(as_of)
    sql = """
    SELECT
      c.customer_name AS customer_name,
      SUM(CASE
        WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 7 DAY)
         AND st.sale_date < %s
        THEN st.total_revenue ELSE 0 END
      ) AS curr_rev,
      SUM(CASE
        WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 14 DAY)
         AND st.sale_date < DATE_SUB(%s, INTERVAL 7 DAY)
        THEN st.total_revenue ELSE 0 END
      ) AS prev_rev
    FROM sales_transactions st
    JOIN customers c ON st.customer_id = c.customer_id
    GROUP BY c.customer_name
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(sql, (end_exclusive, end_exclusive, end_exclusive, end_exclusive))
    rows = cursor.fetchall() or []
    cursor.close()
    conn.close()

    out: list[dict] = []
    for r in rows:
        prev = _safe_float(r.get("prev_rev"))
        curr = _safe_float(r.get("curr_rev"))
        if prev <= 0:
            continue
        delta = curr - prev
        pct = delta / prev
        out.append({**r, "delta": delta, "delta_pct": pct, "score": abs(delta) * abs(pct)})
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


def _fetch_margin_wow_by_segment(as_of: date) -> list[dict]:
    end_exclusive = _next_day(as_of)
    sql = """
    SELECT
      b.segment_name AS segment,
      SUM(CASE
        WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 7 DAY)
         AND st.sale_date < %s
        THEN st.total_revenue ELSE 0 END
      ) AS curr_rev,
      SUM(CASE
        WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 7 DAY)
         AND st.sale_date < %s
        THEN st.total_cogs ELSE 0 END
      ) AS curr_cogs,
      SUM(CASE
        WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 14 DAY)
         AND st.sale_date < DATE_SUB(%s, INTERVAL 7 DAY)
        THEN st.total_revenue ELSE 0 END
      ) AS prev_rev,
      SUM(CASE
        WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 14 DAY)
         AND st.sale_date < DATE_SUB(%s, INTERVAL 7 DAY)
        THEN st.total_cogs ELSE 0 END
      ) AS prev_cogs
    FROM sales_transactions st
    JOIN business_segments b ON st.segment_id = b.segment_id
    GROUP BY b.segment_name
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(sql, (end_exclusive, end_exclusive, end_exclusive, end_exclusive, end_exclusive, end_exclusive, end_exclusive, end_exclusive))
    rows = cursor.fetchall() or []
    cursor.close()
    conn.close()

    out: list[dict] = []
    for r in rows:
        curr_rev = _safe_float(r.get("curr_rev"))
        prev_rev = _safe_float(r.get("prev_rev"))
        if curr_rev <= 0 or prev_rev <= 0:
            continue
            
        curr_margin = (curr_rev - _safe_float(r.get("curr_cogs"))) / curr_rev
        prev_margin = (prev_rev - _safe_float(r.get("prev_cogs"))) / prev_rev
        delta = curr_margin - prev_margin
        pct = delta / max(abs(prev_margin), 1e-9)
        out.append({**r, "curr_rate": curr_margin, "prev_rate": prev_margin, "delta": delta, "delta_pct": pct, "score": abs(delta) * curr_rev})
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


def _fetch_target_mtd_by_customer_tier(as_of: date) -> list[dict]:
    end_exclusive = _next_day(as_of)
    start_of_month = as_of.replace(day=1)
    sql = """
    SELECT
      IFNULL(c.revenue_tier, 'Uncategorized') AS customer_tier,
      SUM(st.total_revenue) AS mtd_sales
    FROM sales_transactions st
    JOIN customers c ON st.customer_id = c.customer_id
    WHERE st.sale_date >= %s
      AND st.sale_date < %s
    GROUP BY IFNULL(c.revenue_tier, 'Uncategorized')
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(sql, (start_of_month, end_exclusive))
    rows = cursor.fetchall() or []
    cursor.close()
    conn.close()

    day = as_of.day
    next_month = (as_of.replace(day=28) + timedelta(days=4)).replace(day=1)
    this_month = as_of.replace(day=1)
    days_in_month = (next_month - this_month).days or 30
    expected = day / days_in_month

    out: list[dict] = []
    for r in rows:
        mtd_sales = _safe_float(r.get("mtd_sales"))
        if mtd_sales <= 0:
            continue
        # Mocking target to be 120% of MTD sales projected to end of month
        target = (mtd_sales / expected) * 1.2 if expected > 0 else mtd_sales * 1.5
        attainment = mtd_sales / target
        gap = attainment - expected
        out.append({**r, "shop_code": r.get("customer_tier"), "attainment": attainment, "expected": expected, "gap": gap, "score": abs(gap) * target, "target_sales": target})
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


def _build_signal_payload(sales_as_of: date, joint_as_of: date) -> dict:
    return {
        "asOfSales": sales_as_of.isoformat(),
        "asOfJoint": joint_as_of.isoformat(),
        "candidates": {
            "revenue_wow_region": _fetch_revenue_wow_by_region(sales_as_of)[:12],
            "revenue_wow_province": _fetch_revenue_wow_by_province(sales_as_of)[:18],
            "revenue_wow_customer": _fetch_revenue_wow_by_customer(sales_as_of)[:20],
            "margin_wow_segment": _fetch_margin_wow_by_segment(joint_as_of)[:12],
            "target_mtd_customer_tier": _fetch_target_mtd_by_customer_tier(sales_as_of)[:18],
        },
    }


def _generate_signals_llm(payload: dict, limit: int) -> list[dict]:
    temperature = float(os.getenv("SIGNALS_LLM_TEMPERATURE", "0.4") or 0.4)
    resp = generate_chat(
        system_prompt=DAILY_SIGNALS_PROMPT,
        user_prompt=json.dumps({**payload, "n": int(limit)}, ensure_ascii=False),
        temperature=temperature,
    )
    text = message_text(resp.choices[0].message)
    rows = _parse_llm_json_object_array(text)
    rows = _dedupe_rows(rows, ["fingerprint", "title"])

    out: list[dict] = []
    created_at = _now_iso()
    for r in rows:
        if len(out) >= limit:
            break
        t = str(r.get("type") or "").strip().lower()
        if t not in {"critical", "watch", "positive"}:
            continue
        title = str(r.get("title") or "").strip()
        desc = str(r.get("desc") or "").strip()
        fingerprint = str(r.get("fingerprint") or "").strip()
        if not title or not desc:
            continue
        out.append(
            {
                "type": t,
                "title": title,
                "description": desc,
                "fingerprint": fingerprint,
                "source": "llm",
                "created_at": datetime.utcnow(),
            }
        )

    out = _dedupe_rows(out, ["fingerprint", "title"])
    return out[:limit]


def _generate_signals_fallback(sales_as_of: date, joint_as_of: date, limit: int) -> list[dict]:
    created_at = datetime.utcnow()
    out: list[dict] = []
    for row in _fetch_revenue_wow_by_region(sales_as_of)[:6]:
        if len(out) >= limit:
            break
        region = row.get("region") or "Khu vực"
        pct = _safe_float(row.get("delta_pct"))
        delta = _safe_float(row.get("delta"))
        direction = "tăng" if pct >= 0 else "giảm"
        title = f"Doanh thu {region} {direction} {abs(pct)*100:.0f}% WoW"
        desc = f"Chênh lệch {_format_money_vnd(delta)} so với 7 ngày trước."
        out.append(
            {
                "type": "positive" if pct > 0 else "watch",
                "title": title,
                "description": desc,
                "fingerprint": f"rev_region:{region}",
                "source": "fallback",
                "created_at": created_at,
            }
        )

    for row in _fetch_margin_wow_by_segment(joint_as_of)[:4]:
        if len(out) >= limit:
            break
        segment = row.get("segment") or "Mảng kinh doanh"
        delta_pp = _safe_float(row.get("delta")) * 100
        direction = "tăng" if delta_pp >= 0 else "giảm"
        title = f"Biên LN {segment} {direction} {abs(delta_pp):.1f} điểm % WoW"
        desc = "Biến động tỷ lệ lãi gộp so với tuần trước."
        out.append(
            {
                "type": "positive" if delta_pp > 0 else "watch",
                "title": title,
                "description": desc,
                "fingerprint": f"margin_segment:{segment}",
                "source": "fallback",
                "created_at": created_at,
            }
        )
    out = _dedupe_rows(out, ["fingerprint", "title"])
    return out[:limit]


def _ensure_signals(as_of_sales: str, as_of_joint: str) -> None:
    # Generate once per as-of, store, then serve paginated from DB.
    if count_signals(as_of_sales, as_of_joint) >= 10:
        return

    sales_d = date.fromisoformat(as_of_sales)
    joint_d = date.fromisoformat(as_of_joint)
    payload = _build_signal_payload(sales_d, joint_d)

    items: list[dict] = []
    use_llm = os.getenv("SIGNALS_USE_LLM", "true").lower() in {"1", "true", "yes", "on"}
    if use_llm:
        try:
            items = _generate_signals_llm(payload, limit=10)
        except Exception:
            items = []
    if not items:
        items = _generate_signals_fallback(sales_d, joint_d, limit=10)

    delete_signals(as_of_sales, as_of_joint)
    rows = []
    for idx, item in enumerate(items[:10]):
        rows.append(
            {
                "rank": idx + 1,
                "type": item["type"],
                "title": item["title"],
                "description": item["description"],
                "fingerprint": item.get("fingerprint") or "",
                "source": item.get("source") or "llm",
                "created_at": item.get("created_at"),
            }
        )
    insert_signals(as_of_sales, as_of_joint, rows)


def get_signals_page_cached(limit: int = 5, offset: int = 0) -> dict[str, Any]:
    limit = max(1, int(limit or 5))
    offset = max(0, int(offset or 0))

    dates = _get_table_max_dates()
    sales_as_of = dates.get("sales") or datetime.now(timezone.utc).date()
    joint_as_of = min([d for d in [dates.get("sales"), dates.get("returns")] if d] or [sales_as_of])
    as_of_sales = sales_as_of.isoformat()
    as_of_joint = joint_as_of.isoformat()

    _ensure_signals(as_of_sales, as_of_joint)
    total = count_signals(as_of_sales, as_of_joint)
    rows = get_signals_page(as_of_sales, as_of_joint, limit=limit, offset=offset)

    items: list[dict] = []
    for r in rows:
        items.append(
            {
                "id": int(r.get("rank") or 0),
                "type": r.get("type") or "watch",
                "title": r.get("title") or "",
                "desc": r.get("description") or "",
                "createdAt": r.get("created_at").isoformat() if r.get("created_at") else _now_iso(),
            }
        )

    next_offset = offset + len(items)
    has_more = next_offset < total
    return {
        "asOfSales": as_of_sales,
        "asOfJoint": as_of_joint,
        "items": items,
        "hasMore": has_more,
        "nextOffset": next_offset,
        "total": total,
    }


def _build_heartbeat_payload(sales_as_of: date, joint_as_of: date) -> dict:
    end_sales = _next_day(sales_as_of)
    end_joint = _next_day(joint_as_of)

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT
          SUM(CASE
            WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 7 DAY)
             AND st.sale_date < %s
            THEN st.total_revenue ELSE 0 END
          ) AS curr_rev,
          SUM(CASE
            WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 14 DAY)
             AND st.sale_date < DATE_SUB(%s, INTERVAL 7 DAY)
            THEN st.total_revenue ELSE 0 END
          ) AS prev_rev
        FROM sales_transactions st
        """,
        (end_sales, end_sales, end_sales, end_sales),
    )
    rev = cursor.fetchone() or {}

    cursor.execute(
        """
        SELECT
          SUM(CASE
            WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 7 DAY)
             AND st.sale_date < %s
            THEN st.total_revenue ELSE 0 END
          ) AS curr_sales,
          SUM(CASE
            WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 7 DAY)
             AND st.sale_date < %s
            THEN st.total_cogs ELSE 0 END
          ) AS curr_cogs,
          SUM(CASE
            WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 14 DAY)
             AND st.sale_date < DATE_SUB(%s, INTERVAL 7 DAY)
            THEN st.total_revenue ELSE 0 END
          ) AS prev_sales,
          SUM(CASE
            WHEN st.sale_date >= DATE_SUB(%s, INTERVAL 14 DAY)
             AND st.sale_date < DATE_SUB(%s, INTERVAL 7 DAY)
            THEN st.total_cogs ELSE 0 END
          ) AS prev_cogs
        FROM sales_transactions st
        """,
        (end_joint, end_joint, end_joint, end_joint, end_joint, end_joint, end_joint, end_joint),
    )
    m_data = cursor.fetchone() or {}
    cursor.close()
    conn.close()

    curr_rev = _safe_float(rev.get("curr_rev"))
    prev_rev = _safe_float(rev.get("prev_rev"))
    rev_delta = curr_rev - prev_rev
    rev_wow = (rev_delta / prev_rev) if prev_rev > 0 else 0.0

    curr_sales = _safe_float(m_data.get("curr_sales"))
    prev_sales = _safe_float(m_data.get("prev_sales"))
    curr_cogs = _safe_float(m_data.get("curr_cogs"))
    prev_cogs = _safe_float(m_data.get("prev_cogs"))
    
    curr_margin = ((curr_sales - curr_cogs) / curr_sales) if curr_sales > 0 else 0.0
    prev_margin = ((prev_sales - prev_cogs) / prev_sales) if prev_sales > 0 else 0.0
    margin_delta = curr_margin - prev_margin

    mtd = _fetch_target_mtd_by_customer_tier(sales_as_of)
    total_target = sum(_safe_float(x.get("target_sales")) for x in mtd)
    total_mtd = sum(_safe_float(x.get("mtd_sales")) for x in mtd)
    attainment = (total_mtd / total_target) if total_target > 0 else 0.0

    return {
        "asOfSales": sales_as_of.isoformat(),
        "asOfJoint": joint_as_of.isoformat(),
        "metrics": {
            "revenue_7d": {"value": curr_rev, "prev": prev_rev, "delta": rev_delta, "wow": rev_wow},
            "margin_7d": {"value": curr_margin, "prev": prev_margin, "delta": margin_delta},
            "target_mtd": {"mtd": total_mtd, "target": total_target, "attainment": attainment},
            "top_region_moves": _fetch_revenue_wow_by_region(sales_as_of)[:5],
            "top_customer_moves": _fetch_revenue_wow_by_customer(sales_as_of)[:6],
        },
    }


def _generate_heartbeat_llm(payload: dict) -> list[dict]:
    temperature = float(os.getenv("HEARTBEAT_LLM_TEMPERATURE", "0.35") or 0.35)
    resp = generate_chat(
        system_prompt=DAILY_HEARTBEAT_PROMPT,
        user_prompt=json.dumps(payload, ensure_ascii=False),
        temperature=temperature,
    )
    text = message_text(resp.choices[0].message)
    rows = _parse_llm_json_object_array(text)
    rows = _dedupe_rows(rows, ["label"])
    out: list[dict] = []
    created_at = datetime.utcnow()
    for r in rows:
        if len(out) >= 8:
            break
        label = str(r.get("label") or "").strip()
        value = str(r.get("value") or "").strip()
        delta = str(r.get("delta") or "").strip()
        trend = str(r.get("trend") or "").strip().lower()
        if trend not in {"up", "down", "neutral"}:
            trend = "neutral"
        if not label or not value:
            continue
        out.append(
            {
                "label": label,
                "value": value,
                "delta": delta,
                "trend": trend,
                "source": "llm",
                "created_at": created_at,
            }
        )
    return out[:8]


def _generate_heartbeat_fallback(payload: dict) -> list[dict]:
    m = payload.get("metrics") or {}
    rev = m.get("revenue_7d") or {}
    mg = m.get("margin_7d") or {}
    tgt = m.get("target_mtd") or {}
    top_regions = m.get("top_region_moves") or []
    top_customers = m.get("top_customer_moves") or []

    rev_wow = _safe_float(rev.get("wow"))
    margin_delta = _safe_float(mg.get("delta"))
    attainment = _safe_float(tgt.get("attainment"))

    cards = [
        {
            "label": "Doanh thu 7 ngày",
            "value": _format_money_vnd(_safe_float(rev.get("value"))),
            "delta": f"{rev_wow*100:+.1f}% WoW",
            "trend": "up" if rev_wow > 0 else "down" if rev_wow < 0 else "neutral",
        },
        {
            "label": "Biên lợi nhuận",
            "value": f"{_safe_float(mg.get('value'))*100:.1f}%",
            "delta": f"{margin_delta*100:+.1f} điểm WoW",
            "trend": "up" if margin_delta > 0 else "down" if margin_delta < 0 else "neutral",
        },
        {
            "label": "Tiến độ MTD dự tính",
            "value": f"{attainment*100:.0f}%",
            "delta": f"MTD {_format_money_vnd(_safe_float(tgt.get('mtd')))}",
            "trend": "up" if attainment >= 0.5 else "neutral",
        },
    ]
    for r in top_regions[:3]:
        pct = _safe_float(r.get("delta_pct"))
        cards.append(
            {
                "label": f"Khu vực {r.get('region')}",
                "value": f"{pct*100:+.0f}% WoW",
                "delta": _format_money_vnd(_safe_float(r.get("delta"))),
                "trend": "up" if pct > 0 else "down" if pct < 0 else "neutral",
            }
        )
    for s in top_customers[:2]:
        pct = _safe_float(s.get("delta_pct"))
        cards.append(
            {
                "label": f"Khách / {s.get('customer_name')}",
                "value": f"{pct*100:+.0f}% WoW",
                "delta": _format_money_vnd(_safe_float(s.get("delta"))),
                "trend": "up" if pct > 0 else "down" if pct < 0 else "neutral",
            }
        )
    out: list[dict] = []
    created_at = datetime.utcnow()
    for c in cards[:8]:
        out.append({**c, "source": "fallback", "created_at": created_at})
    return out[:8]


def _ensure_heartbeat(as_of_sales: str, as_of_joint: str) -> None:
    if count_heartbeat(as_of_sales, as_of_joint) >= 8:
        return

    sales_d = date.fromisoformat(as_of_sales)
    joint_d = date.fromisoformat(as_of_joint)
    payload = _build_heartbeat_payload(sales_d, joint_d)

    items: list[dict] = []
    use_llm = os.getenv("HEARTBEAT_USE_LLM", "true").lower() in {"1", "true", "yes", "on"}
    if use_llm:
        try:
            items = _generate_heartbeat_llm(payload)
        except Exception:
            items = []
    if not items:
        items = _generate_heartbeat_fallback(payload)

    delete_heartbeat(as_of_sales, as_of_joint)
    rows = []
    for idx, item in enumerate(items[:8]):
        rows.append(
            {
                "rank": idx + 1,
                "label": item["label"],
                "value": item["value"],
                "delta": item.get("delta") or "",
                "trend": item.get("trend") or "neutral",
                "source": item.get("source") or "llm",
                "created_at": item.get("created_at"),
            }
        )
    insert_heartbeat(as_of_sales, as_of_joint, rows)


def get_heartbeat_page_cached(limit: int = 4, offset: int = 0) -> dict[str, Any]:
    limit = max(1, int(limit or 4))
    offset = max(0, int(offset or 0))

    dates = _get_table_max_dates()
    sales_as_of = dates.get("sales") or datetime.now(timezone.utc).date()
    joint_as_of = min([d for d in [dates.get("sales"), dates.get("returns")] if d] or [sales_as_of])
    as_of_sales = sales_as_of.isoformat()
    as_of_joint = joint_as_of.isoformat()

    _ensure_heartbeat(as_of_sales, as_of_joint)
    total = count_heartbeat(as_of_sales, as_of_joint)
    rows = get_heartbeat_page(as_of_sales, as_of_joint, limit=limit, offset=offset)

    items: list[dict] = []
    for r in rows:
        items.append(
            {
                "id": int(r.get("rank") or 0),
                "label": r.get("label") or "",
                "value": r.get("value") or "",
                "delta": r.get("delta") or "",
                "trend": r.get("trend") or "neutral",
                "createdAt": r.get("created_at").isoformat() if r.get("created_at") else _now_iso(),
            }
        )

    next_offset = offset + len(items)
    has_more = next_offset < total
    return {
        "asOfSales": as_of_sales,
        "asOfJoint": as_of_joint,
        "items": items,
        "hasMore": has_more,
        "nextOffset": next_offset,
        "total": total,
    }



def _build_landing_user_prompt(user_id: str) -> str:
    from db import get_chat_history, get_schema_context
    from memory import MemoryService

    memory_svc = MemoryService()

    history_rows = get_chat_history(session_id="", user_id=user_id, limit=10, cross_session=True)
    history_lines = []
    for row in reversed(history_rows):
        q = (row.get("question") or "").strip()
        if q:
            history_lines.append(f"- {q}")
    history_block = "\n".join(history_lines) if history_lines else "(Chưa có lịch sử hội thoại)"

    fact_block = memory_svc._build_fact_block(user_id, top_k=5)
    if not fact_block:
        fact_block = "(Chưa có thông tin sở thích)"

    try:
        schema = get_schema_context()
        if len(schema) > 2000:
            schema = schema[:2000] + "\n..."
    except Exception:
        schema = "(Không lấy được schema)"

    return (
        f"[Conversation History]\n{history_block}\n\n"
        f"[Fact Memory]\n{fact_block}\n\n"
        f"[Schema Overview]\n{schema}"
    )


def _generate_landing_suggestions_llm(user_id: str) -> list[dict]:
    user_prompt = _build_landing_user_prompt(user_id)
    temperature = float(os.getenv("LANDING_LLM_TEMPERATURE", "0.5") or 0.5)
    resp = generate_chat(
        system_prompt=LANDING_SUGGESTIONS_PROMPT,
        user_prompt=user_prompt,
        temperature=temperature,
    )
    text = message_text(resp.choices[0].message)
    parsed = _parse_llm_json_string_array(text)

    out: list[dict] = []
    created_at = datetime.utcnow()
    for idx, item in enumerate(parsed[:4]):
        t = item.strip()
        if not t:
            continue
        out.append({"rank": idx + 1, "text": t, "source": "llm", "created_at": created_at})
    return out


def _parse_llm_json_string_array(text: str) -> list[str]:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    match = re.search(r"\[[\s\S]*\]", raw)
    candidate = match.group(0) if match else raw
    try:
        parsed = json.loads(candidate)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(x).strip() for x in parsed if isinstance(x, str) and x.strip()]


def _ensure_landing_suggestions(user_id: str) -> None:
    if count_landing_suggestions(user_id) >= 4:
        return

    items: list[dict] = []
    use_llm = os.getenv("LANDING_USE_LLM", "true").lower() in {"1", "true", "yes", "on"}
    if use_llm:
        try:
            items = _generate_landing_suggestions_llm(user_id)
        except Exception as e:
            print(f"[LANDING] LLM generation failed: {e}")
            items = []

    if not items:
        return

    delete_landing_suggestions(user_id)
    insert_landing_suggestions(user_id, items[:4])


def get_landing_suggestions_cached(user_id: str) -> dict[str, Any]:
    _ensure_landing_suggestions(user_id)
    rows = get_landing_suggestions(user_id, limit=4)
    items = [str(r.get("text") or "") for r in rows if r.get("text")]
    return {"items": items}


def refresh_landing_suggestions(user_id: str) -> dict[str, Any]:
    delete_landing_suggestions(user_id)
    _ensure_landing_suggestions(user_id)
    rows = get_landing_suggestions(user_id, limit=4)
    items = [str(r.get("text") or "") for r in rows if r.get("text")]
    return {"items": items}
