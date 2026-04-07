import json
import time
from prompts import VISUALIZATION_PROMPT_RULES
from .client import (
    OPENROUTER_MODEL, EXTRA_HEADERS, client,
    count_tokens, extract_token_usage, generate_chat, message_text,
)
from .parser import parse_vis_config


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

    response = client.chat.completions.create(
        model=OPENROUTER_MODEL,
        temperature=0,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": reply_data["contents"]},
        ],
        stream=True,
        extra_headers=EXTRA_HEADERS,
    )

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
