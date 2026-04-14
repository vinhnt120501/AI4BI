import json
import os
import re
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
    max_rows = max(50, min(int(os.getenv("LLM_MAX_ROWS", "250") or 250), 2000))
    total_rows = len(rows or [])
    trimmed_rows = (rows or [])[:max_rows]
    data_text = json.dumps({"columns": columns, "rows": trimmed_rows}, ensure_ascii=False)
    memory = (memory_context or "").strip()

    contents = ""
    if memory:
        contents += f"Memory Context:\n{memory}\n\n"
    contents += f"Câu hỏi: {question}\n\n"
    if total_rows > len(trimmed_rows):
        contents += f"Kết quả SQL (tổng {total_rows} rows, gửi {len(trimmed_rows)} rows để phân tích):\n{data_text}"
        contents += "\n\nLưu ý: Không được in/dump lại dữ liệu thô (rows/columns) vào output."
    else:
        contents += f"Kết quả SQL ({total_rows} rows):\n{data_text}"

    if additional_data:
        for i, extra in enumerate(additional_data, 1):
            contents += f"\n\n--- Dữ liệu bổ sung #{i} (Lý do: {extra.get('reason', 'drill-down')}) ---\n"
            contents += f"SQL: {extra.get('sql', '')}\n"
            extra_rows = extra.get("rows") or []
            extra_total = len(extra_rows)
            extra_trimmed = extra_rows[:max_rows]
            contents += f"Kết quả (tổng {extra_total} rows, gửi {len(extra_trimmed)} rows): "
            contents += json.dumps({"columns": extra.get("columns") or [], "rows": extra_trimmed}, ensure_ascii=False)

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
    full_thinking = ""
    vis_config_ended = False

    last_blocks_count = 0
    last_stream_blocks: list[dict] = []
    for chunk in response:
        delta = chunk.choices[0].delta.content if chunk.choices[0].delta.content else ""
        reasoning = ""
        if hasattr(chunk.choices[0].delta, "reasoning_content"):
            reasoning = chunk.choices[0].delta.reasoning_content or ""
        elif hasattr(chunk.choices[0].delta, "reasoning"):
            reasoning = chunk.choices[0].delta.reasoning or ""
            
        if reasoning:
            full_thinking += reasoning
            yield {"type": "thinking", "content": reasoning}

        if not delta:
            continue
            
        full_text += delta

        if not vis_config_ended:
            from .parser import stream_parse_blocks
            current_blocks = stream_parse_blocks(full_text)
            
            if len(current_blocks) > last_blocks_count:
                last_blocks_count = len(current_blocks)
                last_stream_blocks = current_blocks
                chart_config = None
                for b in current_blocks:
                    if b.get("type") == "chart":
                        chart_config = {
                            "type": b.get("chartType", "bar"),
                            "xKey": b.get("xKey", ""),
                            "yKeys": b.get("yKeys", []),
                            "options": b.get("options"),
                        }
                        if chart_config["yKeys"]:
                            chart_config["yKey"] = chart_config["yKeys"][0]
                        break
                
                yield {"type": "early_chart", "blocks": current_blocks, "chart_config": chart_config}

            # Detection logic: if VIS_CONFIG exists, suppress it from streaming text.
            # We only start streaming narrative after the VIS_CONFIG JSON array is closed.
            if re.search(r"VIS_CONFIG\s*[:=]\s*\[", full_text, re.I):
                vis_match = re.search(r"VIS_CONFIG\s*[:=]\s*\[", full_text, re.I)
                if vis_match:
                    start_json = vis_match.end() - 1  # include '['
                    json_part = full_text[start_json:]
                    bracket_count = 0
                    in_string = False
                    escape_next = False
                    end_of_vis = -1

                    for i, char in enumerate(json_part):
                        if escape_next:
                            escape_next = False
                            continue
                        if char == "\\":
                            escape_next = True
                            continue
                        if char == '"':
                            in_string = not in_string
                            continue
                        if in_string:
                            continue
                        if char == "[":
                            bracket_count += 1
                        elif char == "]":
                            bracket_count -= 1
                            if bracket_count == 0:
                                end_of_vis = i + 1
                                break

                    if end_of_vis != -1:
                        vis_config_ended = True
                        after_vis = json_part[end_of_vis:].lstrip()
                        if after_vis:
                            yield {"type": "text", "content": after_vis}
        else:
            yield {"type": "text", "content": delta}

    clean_text, chart_config, blocks = parse_vis_config(full_text)

    # Debug logging
    print(f"[REPLY_GENERATOR] Parsed {len(blocks)} blocks from LLM response")
    if blocks:
        for i, block in enumerate(blocks[:3]):  # Log first 3 blocks
            print(f"[REPLY_GENERATOR]   Block {i+1}: type={block.get('type')}, chartType={block.get('chartType', 'N/A')}")

    # Fallback: if no VIS_CONFIG blocks but has data, create a complete dashboard
    if not blocks and not chart_config and full_text.strip():
        print(f"[REPLY_GENERATOR] WARNING: No VIS_CONFIG found! Creating complete dashboard from data...")

        # Get data from reply_data structure
        data_json = json.loads(reply_data.get("contents", "{}").split("DATA:", 1)[-1].strip())
        cols = data_json.get("columns", [])
        rows_data = data_json.get("rows", [])

        print(f"[REPLY_GENERATOR] Creating dashboard from {len(cols)} columns, {len(rows_data)} rows")

        if cols and rows_data:
            # 1. Create heading
            blocks = [{"type": "heading", "text": "Phân tích dữ liệu", "level": "h1"}]

            # 2. Create stat cards from first 4 numeric/text columns
            stat_cards = []
            for i, col in enumerate(cols[:4]):
                if rows_data and len(rows_data) > 0 and i < len(rows_data[0]):
                    val = rows_data[0][i]
                    stat_cards.append({
                        "label": col,
                        "value": str(val),
                        "color": ["blue", "green", "teal", "indigo"][i % 4]
                    })

            if stat_cards:
                blocks.append({"type": "stat_cards", "cards": stat_cards})

            # 3. Create chart if at least 2 columns
            if len(cols) >= 2:
                # Auto-detect chart type based on data
                chart_type = "bar"
                if len(rows_data) > 10:
                    chart_type = "line"  # Time series-like
                elif len(cols) == 2 and all(isinstance(rows_data[j][1], (int, float)) for j in range(min(5, len(rows_data)))):
                    chart_type = "bar"
                else:
                    chart_type = "bar"

                blocks.append({
                    "type": "chart",
                    "chartType": chart_type,
                    "xKey": cols[0],
                    "yKeys": cols[1:2],
                    "title": f"{cols[1]} theo {cols[0]}",
                    "size": "full"
                })

            # 4. Create text block with analysis
            blocks.append({"type": "text", "content": clean_text.strip() or "Đã lấy dữ liệu từ database. Số lượng bản ghi: " + str(len(rows_data))})

            print(f"[REPLY_GENERATOR] Created {len(blocks)} blocks (heading + {len(stat_cards)} stat cards + chart + text)")
        else:
            # Minimal fallback if no data
            blocks = [
                {"type": "heading", "text": "Kết quả", "level": "h2"},
                {"type": "text", "content": clean_text.strip() or "Không có dữ liệu để hiển thị."}
            ]
            print(f"[REPLY_GENERATOR] Created minimal fallback blocks")

    # Fallback: if final parse failed but we streamed blocks, keep them to avoid wiping the dashboard.
    if (not blocks) and last_stream_blocks:
        blocks = last_stream_blocks
        if not chart_config:
            for b in last_stream_blocks:
                if isinstance(b, dict) and b.get("type") == "chart":
                    chart_config = {
                        "type": b.get("chartType", "bar"),
                        "xKey": b.get("xKey", ""),
                        "yKeys": b.get("yKeys", []),
                        "options": b.get("options"),
                    }
                    if chart_config["yKeys"]:
                        chart_config["yKey"] = chart_config["yKeys"][0]
                    break

    usage = {
        "input": reply_data["counts"]["question"] + reply_data["counts"]["data"] + reply_data["counts"]["memory"],
        "thinking": count_tokens(full_thinking),
        "output": count_tokens(full_text),
        "total": 0,
    }
    usage["total"] = usage["input"] + usage["thinking"] + usage["output"]
    
    yield {
        "type": "final",
        "reply": clean_text,
        "thinking": full_thinking,
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
