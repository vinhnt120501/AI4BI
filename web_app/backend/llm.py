import os
import json
from google import genai
from db import get_schema_context, execute_sql
from prompts import SQL_SYSTEM_PROMPT, REPLY_SYSTEM_PROMPT

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


def count_tokens(text: str) -> int:
    result = client.models.count_tokens(model="gemini-2.5-flash", contents=text)
    return result.total_tokens


def extract_thinking(response) -> str:
    for part in response.candidates[0].content.parts:
        if hasattr(part, 'thought') and part.thought:
            return part.text
    return ""


def extract_token_usage(usage) -> dict:
    return {
        "input": usage.prompt_token_count,
        "thinking": getattr(usage, 'thoughts_token_count', 0) or 0,
        "output": usage.candidates_token_count,
        "total": usage.total_token_count,
    }


def profile_data(columns: list, rows: list) -> dict:
    """Phân tích cấu trúc data: kiểu, unique, thống kê — gửi cho AI thay vì raw data."""
    total_rows = len(rows)
    col_profiles = {}

    for i, col in enumerate(columns):
        values = [row[i] for row in rows]
        non_null = [v for v in values if v is not None and str(v).strip() != ""]
        nulls = total_rows - len(non_null)

        # Detect type
        numeric_vals = []
        for v in non_null:
            try:
                numeric_vals.append(float(v))
            except (ValueError, TypeError):
                pass

        is_numeric = len(numeric_vals) > len(non_null) * 0.8 and len(numeric_vals) > 0

        if is_numeric:
            col_profiles[col] = {
                "type": "number",
                "unique": len(set(non_null)),
                "nulls": nulls,
                "min": round(min(numeric_vals), 2),
                "max": round(max(numeric_vals), 2),
                "mean": round(sum(numeric_vals) / len(numeric_vals), 2),
                "sum": round(sum(numeric_vals), 2),
            }
        else:
            unique_vals = list(dict.fromkeys(non_null))  # preserve order, deduplicate
            col_profiles[col] = {
                "type": "string",
                "unique": len(unique_vals),
                "nulls": nulls,
                "samples": unique_vals[:5],
            }

    return {
        "total_rows": total_rows,
        "columns": col_profiles,
    }


def clean_sql(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return text


def parse_vis_config(text: str) -> tuple[str, dict | None, list | None]:
    """Parse VIS_CONFIG (blocks) hoặc CHART_CONFIG (backward compat) từ reply text.
    Returns: (clean_text, chart_config, blocks)
    """
    import re
    chart_config = None
    blocks = None

    # 1. Thử parse VIS_CONFIG — tìm trên toàn bộ text (có thể multi-line)
    vis_match = re.search(r'VIS_CONFIG\s*:\s*(\[[\s\S]*\])', text)
    if vis_match:
        json_str = vis_match.group(1)
        # Tìm đúng vị trí đóng ngoặc [] bằng cách thử parse JSON từ dài đến ngắn
        for end in range(len(json_str), 0, -1):
            candidate = json_str[:end]
            if not candidate.rstrip().endswith(']'):
                continue
            try:
                parsed_blocks = json.loads(candidate)
                if isinstance(parsed_blocks, list) and len(parsed_blocks) > 0:
                    blocks = parsed_blocks
                    # Trích chart_config từ block đầu tiên có type=chart (backward compat)
                    for b in parsed_blocks:
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
                break
            except json.JSONDecodeError:
                continue

    # 2. Fallback: parse CHART_CONFIG cũ (nếu chưa có chart_config)
    if chart_config is None:
        chart_match = re.search(r'CHART_CONFIG\s*:\s*(\{.*\})', text)
        if chart_match:
            try:
                cfg = json.loads(chart_match.group(1))
                if "yKeys" not in cfg and "yKey" in cfg:
                    cfg["yKeys"] = [cfg["yKey"]]
                elif "yKeys" in cfg and "yKey" not in cfg:
                    cfg["yKey"] = cfg["yKeys"][0] if cfg["yKeys"] else ""
                chart_config = cfg
            except json.JSONDecodeError:
                pass

    # 3. Dọn text — loại bỏ dòng VIS_CONFIG/CHART_CONFIG và code fences
    clean_lines = []
    for line in text.split("\n"):
        stripped = line.strip()
        if re.search(r'(VIS_CONFIG|CHART_CONFIG)\s*:', stripped):
            continue
        if stripped.startswith("```") or stripped == "json":
            continue
        clean_lines.append(line)

    return "\n".join(clean_lines).strip(), chart_config, blocks


def text_to_sql(question: str) -> dict:
    schema = get_schema_context()
    system_prompt = SQL_SYSTEM_PROMPT + f"Schema:\n{schema}"

    pre_input_tokens = count_tokens(system_prompt + "\n" + question)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        config={
            "system_instruction": system_prompt,
            "temperature": 0,
            "thinking_config": {"include_thoughts": True, "thinking_budget": 2048},
        },
        contents=question,
    )

    usage = extract_token_usage(response.usage_metadata)
    usage["pre_input"] = pre_input_tokens
    usage["schema"] = count_tokens(schema)
    usage["instruction"] = count_tokens(system_prompt) - usage["schema"]
    usage["question"] = count_tokens(question)

    sql = clean_sql(response.text)
    thinking = extract_thinking(response)

    # Thử chạy SQL, nếu lỗi thì retry 1 lần với thông báo lỗi
    try:
        db_result = execute_sql(sql)
    except Exception as e:
        error_msg = str(e)
        retry_response = client.models.generate_content(
            model="gemini-2.5-flash",
            config={
                "system_instruction": system_prompt,
                "temperature": 0,
                "thinking_config": {"include_thoughts": True, "thinking_budget": 2048},
            },
            contents=f"{question}\n\nSQL trước đó bị lỗi: {error_msg}\nViết lại SQL khác, tránh lỗi này.",
        )
        retry_usage = extract_token_usage(retry_response.usage_metadata)
        usage["input"] += retry_usage["input"]
        usage["thinking"] += retry_usage["thinking"]
        usage["output"] += retry_usage["output"]
        usage["total"] += retry_usage["total"]

        sql = clean_sql(retry_response.text)
        thinking += "\n\n[Retry] " + extract_thinking(retry_response)
        db_result = execute_sql(sql)

    return {
        "sql": sql,
        "thinking": thinking,
        "token_usage": usage,
        "columns": db_result["columns"],
        "rows": db_result["rows"],
    }


def generate_reply(question: str, columns: list, rows: list) -> dict:
    # Data profiling — giúp AI hiểu cấu trúc data mà không cần gửi toàn bộ raw rows
    profile = profile_data(columns, rows)
    profile_text = json.dumps(profile, ensure_ascii=False)

    sample_rows = rows[:50]
    data_text = json.dumps({"columns": columns, "rows": sample_rows}, ensure_ascii=False)
    columns_hint = f"Danh sách cột: {json.dumps(columns, ensure_ascii=False)}"
    contents = (
        f"Câu hỏi: {question}\n\n"
        f"{columns_hint}\n\n"
        f"DATA PROFILE (cấu trúc & thống kê):\n{profile_text}\n\n"
        f"Dữ liệu mẫu (tối đa 50 dòng):\n{data_text}"
    )

    pre_input_tokens = count_tokens(REPLY_SYSTEM_PROMPT + "\n" + contents)
    instruction_tokens = count_tokens(REPLY_SYSTEM_PROMPT)
    data_tokens = count_tokens(data_text)
    question_tokens = count_tokens(question)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        config={
            "system_instruction": REPLY_SYSTEM_PROMPT,
            "temperature": 0.3,
            "thinking_config": {"include_thoughts": True, "thinking_budget": 2048},
        },
        contents=contents,
    )

    reply_text, chart_config, blocks = parse_vis_config(response.text.strip())

    # LLM tự quyết chart. Chỉ fallback nếu LLM không trả chart nào.
    # (không override LLM)

    reply_usage = extract_token_usage(response.usage_metadata)
    reply_usage["pre_input"] = pre_input_tokens
    reply_usage["instruction"] = instruction_tokens
    reply_usage["data"] = data_tokens
    reply_usage["question"] = question_tokens

    return {
        "reply": reply_text,
        "chart_config": chart_config,
        "blocks": blocks,
        "reply_token_usage": reply_usage,
    }
