import os
import json
import re
from collections import OrderedDict
import hashlib
from pathlib import Path
from datetime import date, datetime, timedelta, timezone
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv(Path(__file__).parent / ".env")

from db import (
    init_chat_history_table,
    init_memory_facts_table,
    init_memory_vectors_table,
    init_sidebar_tables,
    get_connection,
    get_chat_history_page,
    get_chat_history_session,
    count_chat_history,
)


from llm import (
    build_reply_contents,
    build_sql_system_prompt,
    VISUALIZATION_PROMPT_RULES,
    generate_chat,
    message_text,
)
from memory import MemoryService
from chat_service import process_chat
from sidebar_service import get_heartbeat_page_cached, get_signals_page_cached, get_landing_suggestions_cached, refresh_landing_suggestions
from prompts import DAILY_SIGNALS_PROMPT, DAILY_HEARTBEAT_PROMPT

app = FastAPI()

# Table initializations are deferred to `/mcp/setup` to support dynamic connection sizing without crashing on startup.
memory_service = MemoryService()

ADMIN_TOKEN = os.getenv("MEMORY_ADMIN_TOKEN", "").strip()

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    sessionId: str = ""
    userId: str = "default_user"
    instruction: str = ""


class MemorySearchRequest(BaseModel):
    userId: str = "default_user"
    query: str
    topK: int = 10


class MemoryContextPreviewRequest(BaseModel):
    message: str
    sessionId: str = ""
    userId: str = "default_user"
    columns: list[str] = []
    rows: list[list[str]] = []

class FileIngestItem(BaseModel):
    name: str
    content: str


class FileIngestRequest(BaseModel):
    userId: str = "default_user"
    sessionId: str = ""
    files: list[FileIngestItem] = []

class TokenCountRequest(BaseModel):
    text: str = ""
    model: str | None = None

class McpSetupRequest(BaseModel):
    url: str

def _guard_admin(x_admin_token: str | None):
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=500, detail="MEMORY_ADMIN_TOKEN is not configured")
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid admin token")

@app.get("/mcp/status")
def mcp_status():
    from db.connection import is_configured, get_metadata
    return {
        "configured": is_configured(),
        "metadata": get_metadata()
    }

@app.post("/mcp/setup")
def mcp_setup(req: McpSetupRequest):
    from db.connection import configure_pool
    try:
        configure_pool(req.url)
        # Initialize tables after connection is configured
        init_chat_history_table()
        init_memory_facts_table()
        init_memory_vectors_table()
        init_sidebar_tables()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/mcp/disconnect")
def mcp_disconnect():
    from db.connection import disconnect_pool
    disconnect_pool()
    return {"success": True}


@app.get("/mcp/tables")
def mcp_tables():
    from db.schema import get_tables_schema
    import traceback
    try:
        tables = get_tables_schema()
        return {
            "success": True,
            "tables": tables,
            "total": len(tables)
        }
    except Exception as e:
        print("Error in /mcp/tables:")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


_TOKEN_COUNT_CACHE: "OrderedDict[str, dict]" = OrderedDict()
_TOKEN_COUNT_CACHE_MAX = 128


def _token_cache_get(key: str) -> dict | None:
    v = _TOKEN_COUNT_CACHE.get(key)
    if v is None:
        return None
    _TOKEN_COUNT_CACHE.move_to_end(key)
    return v


def _token_cache_set(key: str, value: dict) -> None:
    _TOKEN_COUNT_CACHE[key] = value
    _TOKEN_COUNT_CACHE.move_to_end(key)
    while len(_TOKEN_COUNT_CACHE) > _TOKEN_COUNT_CACHE_MAX:
        _TOKEN_COUNT_CACHE.popitem(last=False)

def _maybe_json(value):
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, (bytes, bytearray)):
        try:
            value = value.decode("utf-8")
        except Exception:
            return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        try:
            return json.loads(value)
        except Exception:
            return None
    return None

def _preview_text(text: str, max_len: int = 140) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "")).strip()
    if not cleaned:
        return ""
    return cleaned if len(cleaned) <= max_len else (cleaned[: max_len - 1] + "…")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_float(v) -> float:
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

    def _to_date(v) -> date | None:
        if isinstance(v, date):
            return v
        try:
            if v:
                return date.fromisoformat(str(v)[:10])
        except Exception:
            return None
        return None

    return {"sales": _to_date(row_sales.get("max_sales")), "returns": _to_date(row_sales.get("max_sales"))}


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


def _build_signal_candidates(sales_as_of: date, joint_as_of: date) -> dict:
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
        if not title or not desc:
            continue
        out.append({"type": t, "title": title, "desc": desc, "createdAt": created_at})

    out = _dedupe_rows(out, ["title"])
    for i, r in enumerate(out[:limit]):
        r["id"] = i + 1
    return out[:limit]


def _generate_signals_fallback(sales_as_of: date, joint_as_of: date, limit: int) -> list[dict]:
    created_at = _now_iso()
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
        out.append({"id": len(out) + 1, "type": "positive" if pct > 0 else "watch", "title": title, "desc": desc, "createdAt": created_at})

    for row in _fetch_margin_wow_by_segment(joint_as_of)[:4]:
        if len(out) >= limit:
            break
        segment = row.get("segment") or "Mảng kinh doanh"
        delta_pp = _safe_float(row.get("delta")) * 100
        direction = "tăng" if delta_pp >= 0 else "giảm"
        title = f"Biên LN {segment} {direction} {abs(delta_pp):.1f} điểm % WoW"
        desc = "Biến động tỷ lệ lãi gộp so với tuần trước."
        out.append({"id": len(out) + 1, "type": "positive" if delta_pp > 0 else "watch", "title": title, "desc": desc, "createdAt": created_at})

    out = _dedupe_rows(out, ["title"])
    for i, r in enumerate(out[:limit]):
        r["id"] = i + 1
    return out[:limit]


def _build_heartbeat_candidates(sales_as_of: date, joint_as_of: date) -> dict:
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
    margin_data = cursor.fetchone() or {}
    cursor.close()
    conn.close()

    curr_rev = _safe_float(rev.get("curr_rev"))
    prev_rev = _safe_float(rev.get("prev_rev"))
    rev_delta = curr_rev - prev_rev
    rev_wow = (rev_delta / prev_rev) if prev_rev > 0 else 0.0

    curr_sales = _safe_float(margin_data.get("curr_sales"))
    prev_sales = _safe_float(margin_data.get("prev_sales"))
    curr_cogs = _safe_float(margin_data.get("curr_cogs"))
    prev_cogs = _safe_float(margin_data.get("prev_cogs"))
    
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
        out.append({"id": len(out) + 1, "label": label, "value": value, "delta": delta, "trend": trend})
    return out


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

    cards = cards[:8]
    out: list[dict] = []
    for i, c in enumerate(cards):
        out.append({"id": i + 1, **c})
    return out


@app.post("/chat")
async def chat(req: ChatRequest):
    sse_stream = await process_chat(
        message=req.message,
        session_id=req.sessionId,
        user_id=req.userId,
        instruction=req.instruction,
        memory_service=memory_service,
    )
    return StreamingResponse(
        sse_stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/tokens/count")
def tokens_count(req: TokenCountRequest):
    text = req.text or ""
    model_override = (req.model or "").strip()
    env_model = (os.getenv("OPENROUTER_MODEL") or "").strip()
    model = model_override or env_model

    # Cache by (model + text)
    key_src = f"{model}\n{text}"
    cache_key = hashlib.sha256(key_src.encode("utf-8")).hexdigest()
    cached = _token_cache_get(cache_key)
    if cached is not None:
        return cached

    # Count via provider usage to match the actual model tokenizer.
    # NOTE: This triggers a tiny completion request (max_tokens=1) and may incur latency/cost.
    tokens: int | None = None
    exact = False
    error: str | None = None
    resolved_model: str | None = model or None

    try:
        from llm.client import client as llm_client, EXTRA_HEADERS, OPENROUTER_MODEL

        resolved_model = model or OPENROUTER_MODEL
        res = llm_client.chat.completions.create(
            model=resolved_model,
            temperature=0,
            max_tokens=1,
            messages=[
                {"role": "system", "content": "Reply with OK."},
                {"role": "user", "content": text},
            ],
            extra_headers=EXTRA_HEADERS,
        )
        usage = getattr(res, "usage", None)
        prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
        if isinstance(prompt_tokens, int):
            tokens = int(prompt_tokens)
            exact = True
        else:
            error = "Provider did not return prompt token usage."
    except Exception as e:
        error = str(e)

    payload = {
        "tokens": tokens,
        "exact": exact,
        "model": resolved_model,
        "error": error,
    }
    _token_cache_set(cache_key, payload)
    return payload


@app.get("/chat/history")
def chat_history(userId: str = "default_user", limit: int = 10, offset: int = 0):
    try:
        items = get_chat_history_page(user_id=userId, limit=limit, offset=offset, cross_session=True)
        total = count_chat_history(user_id=userId)
        safe_limit = max(1, min(int(limit or 10), 100))
        safe_offset = max(0, int(offset or 0))
        next_offset = safe_offset + len(items)
        has_more = next_offset < total

        return {
            "items": [
                {
                    "id": row.get("id"),
                    "sessionId": row.get("session_id") or "",
                    "createdAt": row.get("created_at").isoformat() if row.get("created_at") else None,
                    "question": row.get("question") or "",
                    "replyPreview": _preview_text(row.get("reply") or ""),
                }
                for row in items
            ],
            "limit": safe_limit,
            "offset": safe_offset,
            "nextOffset": next_offset,
            "total": total,
            "hasMore": has_more,
            "isConfigured": True
        }
    except Exception as e:
        if "DATABASE_NOT_CONFIGURED" in str(e):
            return {"items": [], "total": 0, "hasMore": False, "isConfigured": False}
        raise e


@app.get("/chat/history/session")
def chat_history_session(sessionId: str, userId: str = "default_user"):
    if not sessionId:
        raise HTTPException(status_code=400, detail="sessionId is required")

    rows = get_chat_history_session(user_id=userId, session_id=sessionId)
    items = []
    for row in rows:
        sql_breakdown = _maybe_json(row.get("token_sql_breakdown")) or {}
        reply_breakdown = _maybe_json(row.get("token_reply_breakdown")) or {}
        if not isinstance(sql_breakdown, dict):
            sql_breakdown = {}
        if not isinstance(reply_breakdown, dict):
            reply_breakdown = {}

        items.append(
            {
                "id": row.get("id"),
                "sessionId": row.get("session_id") or "",
                "createdAt": row.get("created_at").isoformat() if row.get("created_at") else None,
                "question": row.get("question") or "",
                "sql": row.get("sql_generated") or "",
                "thinking": row.get("thinking") or "",
                "reply": row.get("reply") or "",
                "columns": _maybe_json(row.get("columns_data")) or [],
                "rows": _maybe_json(row.get("rows_data")) or [],
                "chartConfig": _maybe_json(row.get("chart_config")) or None,
                "blocks": _maybe_json(row.get("blocks")) or [],
                "tokenUsage": {
                    **sql_breakdown,
                    "input": int(row.get("token_sql_input") or 0),
                    "thinking": int(row.get("token_sql_thinking") or 0),
                    "output": int(row.get("token_sql_output") or 0),
                    "total": int(row.get("token_sql_total") or 0),
                },
                "replyTokenUsage": {
                    **reply_breakdown,
                    "input": int(row.get("token_reply_input") or 0),
                    "thinking": int(row.get("token_reply_thinking") or 0),
                    "output": int(row.get("token_reply_output") or 0),
                    "total": int(row.get("token_reply_total") or 0),
                },
                "followUpSuggestions": _maybe_json(row.get("follow_up_suggestions")) or [],
            }
        )

    return {"sessionId": sessionId, "items": items}


class FollowUpRequest(BaseModel):
    question: str
    reply: str


@app.post("/chat/generate-followup")
def generate_followup(req: FollowUpRequest):
    try:
        from llm import generate_followup_questions_detailed
        result = generate_followup_questions_detailed(
            req.question, req.reply, [], [], "",
        )
        return {"questions": result.get("questions", [])}
    except Exception as e:
        return {"questions": [], "error": str(e)}


@app.get("/signals")
def signals(limit: int = 5, offset: int = 0):
    try:
        data = get_signals_page_cached(limit=limit, offset=offset)
        return {**data, "isConfigured": True}
    except Exception as e:
        if "DATABASE_NOT_CONFIGURED" in str(e):
            return {"items": [], "total": 0, "hasMore": False, "isConfigured": False}
        raise e


@app.get("/heartbeat")
def heartbeat(limit: int = 4, offset: int = 0):
    try:
        data = get_heartbeat_page_cached(limit=limit, offset=offset)
        return {**data, "isConfigured": True}
    except Exception as e:
        if "DATABASE_NOT_CONFIGURED" in str(e):
            return {"items": [], "total": 0, "hasMore": False, "isConfigured": False}
        raise e


@app.get("/landing-suggestions")
def landing_suggestions(userId: str = "default_user"):
    try:
        data = get_landing_suggestions_cached(user_id=userId)
        return {**data, "isConfigured": True}
    except Exception as e:
        if "DATABASE_NOT_CONFIGURED" in str(e):
            return {"items": [], "total": 0, "isConfigured": False}
        raise e


@app.post("/landing-suggestions/refresh")
def landing_suggestions_refresh(userId: str = "default_user"):
    return refresh_landing_suggestions(user_id=userId)


@app.post("/files/ingest")
def ingest_files(req: FileIngestRequest):
    if not req.files:
        return {"status": "ok", "ingested": 0, "results": []}
    results = []
    for f in req.files:
        results.append(
            memory_service.ingest_reference_file(
                user_id=req.userId,
                session_id=req.sessionId,
                filename=f.name,
                content=f.content,
            )
        )
    ingested = sum(1 for r in results if r.get("status") == "ok")
    return {"status": "ok", "ingested": ingested, "results": results}


@app.get("/memory/admin/overview")
def memory_admin_overview(userId: str = "default_user", x_admin_token: str | None = Header(default=None)):
    _guard_admin(x_admin_token)
    return memory_service.admin_overview(user_id=userId)


@app.post("/memory/admin/search")
def memory_admin_search(req: MemorySearchRequest, x_admin_token: str | None = Header(default=None)):
    _guard_admin(x_admin_token)
    return memory_service.admin_search(user_id=req.userId, query=req.query, top_k=req.topK)


@app.delete("/memory/admin/items/{memory_id}")
def memory_admin_delete(memory_id: int, userId: str = "default_user", x_admin_token: str | None = Header(default=None)):
    _guard_admin(x_admin_token)
    return memory_service.admin_delete_item(user_id=userId, memory_id=memory_id)


@app.post("/memory/admin/reset")
def memory_admin_reset(userId: str = "default_user", x_admin_token: str | None = Header(default=None)):
    _guard_admin(x_admin_token)
    return memory_service.admin_reset(user_id=userId)


@app.post("/memory/admin/rebuild")
def memory_admin_rebuild(userId: str = "default_user", x_admin_token: str | None = Header(default=None)):
    _guard_admin(x_admin_token)
    return memory_service.admin_rebuild(user_id=userId)


@app.post("/memory/admin/context-preview")
def memory_admin_context_preview(req: MemoryContextPreviewRequest, x_admin_token: str | None = Header(default=None)):
    _guard_admin(x_admin_token)
    sql_ctx = memory_service.build_stage_memory_context(req.userId, req.sessionId, req.message, stage="sql")
    reply_ctx = memory_service.build_stage_memory_context(req.userId, req.sessionId, req.message, stage="reply")
    sql_prompt = build_sql_system_prompt(memory_context=sql_ctx.render())
    reply_data = build_reply_contents(
        question=req.message, columns=req.columns or [], rows=req.rows or [],
        memory_context=reply_ctx.render(),
    )
    return {
        "user_id": req.userId,
        "session_id": req.sessionId,
        "message": req.message,
        "memory_context": {"sql": sql_ctx.render(), "reply": reply_ctx.render()},
        "stage1_sql_prompt": {"system_prompt": sql_prompt["prompt"], "user_content": req.message},
        "stage2_reply_prompt": {"system_prompt": VISUALIZATION_PROMPT_RULES, "user_content": reply_data["contents"]},
    }


if __name__ == "__main__":
    import sys, uvicorn
    if "--serve" in sys.argv:
        uvicorn.run(app, host="0.0.0.0", port=8333)
