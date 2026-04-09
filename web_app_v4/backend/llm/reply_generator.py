import json
import time
from prompts import VISUALIZATION_PROMPT_RULES
from .client import (
    OPENROUTER_MODEL, EXTRA_HEADERS, build_chat_messages, client,
    count_tokens, extract_token_usage, generate_chat, message_text, log_llm_request_stats,
)
from .parser import parse_vis_config


def _try_parse_float(x: str) -> float | None:
    if x is None:
        return None
    s = str(x).strip()
    if not s:
        return None

    # Handle common display formats coming back from SQL-as-strings.
    s = s.replace(",", "")
    if s.endswith("%"):
        s = s[:-1].strip()
    try:
        return float(s)
    except Exception:
        return None


def _infer_numeric_columns(columns: list[str], rows: list[list[str]], sample_n: int = 60) -> list[str]:
    if not columns or not rows:
        return []

    sample = rows[:sample_n]
    numeric_cols: list[str] = []
    for col_i, col_name in enumerate(columns):
        non_empty = 0
        ok = 0
        for r in sample:
            if col_i >= len(r):
                continue
            raw = r[col_i]
            v = (raw or "").strip() if isinstance(raw, str) else str(raw or "").strip()
            if not v or v.lower() in {"null", "none", "nan"}:
                continue
            non_empty += 1
            if _try_parse_float(v) is not None:
                ok += 1
        if non_empty >= 3 and ok / max(1, non_empty) >= 0.7:
            numeric_cols.append(col_name)
    return numeric_cols


def _first_chart_config(blocks: list[dict] | None) -> dict | None:
    if not blocks:
        return None
    for b in blocks:
        if isinstance(b, dict) and b.get("type") == "chart":
            cfg = {
                "type": b.get("chartType", "bar"),
                "xKey": b.get("xKey", ""),
                "yKeys": b.get("yKeys", []) or [],
                "options": b.get("options"),
            }
            if cfg["yKeys"]:
                cfg["yKey"] = cfg["yKeys"][0]
            return cfg
    return None


def _normalize_scatter_blocks(blocks: list[dict] | None, columns: list[str], rows: list[list[str]]) -> bool:
    """
    LLMs sometimes output scatter charts with yKeys == xKey, which is almost always useless.
    Fix it deterministically using the observed dataset.
    """
    if not blocks or not columns:
        return False

    numeric = _infer_numeric_columns(columns, rows)
    changed = False

    for b in blocks:
        if not isinstance(b, dict) or b.get("type") != "chart":
            continue
        chart_type = str(b.get("chartType") or "").lower().strip()
        if "scatter" not in chart_type:
            continue

        x_key = str(b.get("xKey") or "").strip()
        y_keys = b.get("yKeys") or []
        if isinstance(y_keys, str):
            y_keys = [y_keys]
        if not isinstance(y_keys, list):
            y_keys = []
        y_keys = [str(y).strip() for y in y_keys if str(y).strip()]

        if not x_key and numeric:
            x_key = numeric[0]
            b["xKey"] = x_key
            changed = True

        if x_key:
            new_y = [y for y in y_keys if y != x_key]
            if new_y != y_keys:
                y_keys = new_y
                changed = True

        if not y_keys:
            candidate = None
            for col in numeric:
                if col and col != x_key:
                    candidate = col
                    break
            if candidate is None:
                for col in columns:
                    if col and col != x_key:
                        candidate = col
                        break
            if candidate is not None:
                y_keys = [candidate]
                changed = True

        if len(y_keys) > 1:
            y_keys = [y_keys[0]]
            changed = True

        b["yKeys"] = y_keys

    return changed


def build_reply_contents(question: str, columns: list, rows: list,
                         memory_context: str = "", additional_data: list[dict] | None = None) -> dict:
    """Truyền thẳng toàn bộ kết quả SQL cho LLM. SQL đã tính toán hết."""
    data_text = json.dumps({"columns": columns, "rows": rows}, ensure_ascii=False)
    memory = (memory_context or "").strip()

    contents = ""
    if memory:
        contents += f"Memory Context:\n{memory}\n\n"
    contents += f"Câu hỏi: {question}\n\n"
    contents += f"Kết quả SQL ({len(rows)} rows):\n{data_text}"

    if additional_data:
        for i, extra in enumerate(additional_data, 1):
            contents += f"\n\n--- Dữ liệu bổ sung #{i} (Lý do: {extra.get('reason', 'drill-down')}) ---\n"
            contents += f"SQL: {extra.get('sql', '')}\n"
            contents += f"Kết quả ({len(extra['rows'])} rows): "
            contents += json.dumps({"columns": extra["columns"], "rows": extra["rows"]}, ensure_ascii=False)

    return {
        "contents": contents,
        "data_text": data_text,
        "counts": {
            "question": count_tokens(question),
            "data": count_tokens(data_text),
            "summary": 0,
            "memory": count_tokens(memory) if memory else 0,
        }
    }


def stream_reply(question: str, columns: list, rows: list, memory_context: str = "",
                 custom_instruction: str = "", additional_data: list[dict] | None = None):
    reply_data = build_reply_contents(question, columns, rows, memory_context, additional_data=additional_data)
    system_prompt = (custom_instruction or "") + "\n\n" + VISUALIZATION_PROMPT_RULES

    try:
        response = client.chat.completions.create(
            model=OPENROUTER_MODEL,
            temperature=0,
            messages=build_chat_messages(system_prompt, reply_data["contents"]),
            stream=True,
            extra_headers=EXTRA_HEADERS,
        )
    except Exception as e:
        # Streaming path bypasses generate_chat(), so log here.
        log_llm_request_stats(
            stage="reply_stream_error",
            system_prompt=system_prompt,
            user_prompt=reply_data["contents"],
            extra_counts={
                "question": reply_data["counts"].get("question", 0),
                "data": reply_data["counts"].get("data", 0),
                "memory": reply_data["counts"].get("memory", 0),
                "rules": count_tokens(VISUALIZATION_PROMPT_RULES),
                "rows": len(rows or []),
                "cols": len(columns or []),
            },
        )
        print(f"[LLM_TRACE] error={type(e).__name__}: {e}")
        raise

    full_text = ""
    vis_config_started = False

    for chunk in response:
        choices = getattr(chunk, "choices", None) or []
        if not choices:
            continue

        delta_obj = getattr(choices[0], "delta", None)
        if delta_obj is None:
            continue

        delta = getattr(delta_obj, "content", None)
        if isinstance(delta, list):
            parts = []
            for item in delta:
                if isinstance(item, dict):
                    if item.get("type") == "text":
                        parts.append(item.get("text", ""))
                else:
                    if getattr(item, "type", None) == "text":
                        parts.append(getattr(item, "text", ""))
            delta = "".join(parts)
        elif delta is None:
            delta = ""

        if not delta:
            continue
        full_text += delta

        if "VIS_CONFIG" in full_text and not vis_config_started:
            parts = full_text.split("VIS_CONFIG", 1)
            yield {"type": "text", "content": parts[0].strip()}
            vis_config_started = True
        elif not vis_config_started:
            yield {"type": "text", "content": delta}

    clean_text, chart_config, blocks = parse_vis_config(full_text)
    if _normalize_scatter_blocks(blocks, columns, rows):
        chart_config = _first_chart_config(blocks)
    usage = {
        "input": reply_data["counts"]["question"] + reply_data["counts"]["data"] + reply_data["counts"]["memory"],
        "thinking": 0,
        "output": count_tokens(full_text),
        "total": 0,
    }
    usage["total"] = usage["input"] + usage["output"]

    yield {
        "type": "final",
        "reply": clean_text,
        "chart_config": chart_config,
        "blocks": blocks,
        "usage": usage,
    }


def generate_reply(question: str, columns: list, rows: list,
                   memory_context: str = "", custom_instruction: str = "") -> dict:
    reply_data = build_reply_contents(question=question, columns=columns, rows=rows, memory_context=memory_context)
    final_system_prompt = (custom_instruction or "") + "\n\n" + VISUALIZATION_PROMPT_RULES
    response = generate_chat(final_system_prompt, reply_data["contents"], temperature=0)
    reply_text, chart_config, blocks = parse_vis_config(message_text(response.choices[0].message).strip())
    if _normalize_scatter_blocks(blocks, columns, rows):
        chart_config = _first_chart_config(blocks)
    reply_usage = extract_token_usage(response.usage)
    reply_usage.update(reply_data["counts"])
    reply_usage["rules"] = count_tokens(VISUALIZATION_PROMPT_RULES)
    reply_usage["instruction"] = count_tokens(custom_instruction) if custom_instruction else 0
    return {
        "reply": reply_text,
        "chart_config": chart_config,
        "blocks": blocks,
        "reply_token_usage": reply_usage,
    }


def generate_reply_detailed(question: str, columns: list, rows: list,
                            memory_context: str = "", custom_instruction: str = "") -> dict:
    timing = {}
    t_total = time.perf_counter()

    t = time.perf_counter()
    reply_data = build_reply_contents(question=question, columns=columns, rows=rows, memory_context=memory_context)
    timing["build_contents"] = round((time.perf_counter() - t) * 1000, 1)

    instruction = (custom_instruction or "").strip()
    final_system_prompt = (f"{instruction}\n\n" if instruction else "") + VISUALIZATION_PROMPT_RULES

    t = time.perf_counter()
    response = generate_chat(final_system_prompt, reply_data["contents"], temperature=0)
    timing["llm_reply"] = round((time.perf_counter() - t) * 1000, 1)

    t = time.perf_counter()
    reply_text, chart_config, blocks = parse_vis_config(message_text(response.choices[0].message).strip())
    if _normalize_scatter_blocks(blocks, columns, rows):
        chart_config = _first_chart_config(blocks)
    timing["parse_reply"] = round((time.perf_counter() - t) * 1000, 1)

    reply_usage = extract_token_usage(response.usage)
    reply_usage.update(reply_data["counts"])
    reply_usage["rules"] = count_tokens(VISUALIZATION_PROMPT_RULES)
    reply_usage["instruction"] = count_tokens(instruction) if instruction else 0
    timing["total"] = round((time.perf_counter() - t_total) * 1000, 1)

    return {
        "reply": reply_text,
        "chart_config": chart_config,
        "blocks": blocks,
        "reply_token_usage": reply_usage,
        "timing_ms": timing,
    }
