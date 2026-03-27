import os
import json
from google import genai
from db import get_schema_context, execute_sql

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

SQL_SYSTEM_PROMPT = """
Bạn là senior data analyst chuyển câu hỏi tiếng Việt thành SQL cho database MySQL/TiDB.
CHỈ trả về câu SQL duy nhất, không giải thích, không markdown.
Luôn dùng backtick cho tên bảng và cột.
Luôn suy nghĩ bằng tiếng Việt.

QUAN TRỌNG — Quy tắc viết SQL để phân tích insights:
- KHÔNG BAO GIỜ trả về 1 con số tổng duy nhất (VD: SELECT SUM(...)).
- Luôn GROUP BY theo chiều phân tích phù hợp (thời gian, địa điểm, sản phẩm, v.v.) để có nhiều dòng dữ liệu.
- Kết quả phải có ít nhất 2 cột: 1 cột nhãn (label) và 1 cột giá trị (value) để vẽ biểu đồ.
- Sắp xếp kết quả có ý nghĩa (ORDER BY giá trị DESC hoặc theo thời gian ASC).
- Giới hạn LIMIT 20 nếu dữ liệu quá nhiều.
- Ví dụ: Hỏi 'doanh thu Hà Nội tháng 2' → GROUP BY từng cửa hàng ở Hà Nội, không phải SUM tất cả.

"""

REPLY_SYSTEM_PROMPT = """
Bạn là trợ lý phân tích dữ liệu BI bằng tiếng Việt.
Luôn suy nghĩ bằng tiếng Việt.

Nhiệm vụ:
1. Phân tích kết quả truy vấn và trả lời câu hỏi bằng tiếng Việt, rõ ràng, dễ hiểu.
2. Đề xuất loại biểu đồ phù hợp nhất (Recharts). Trả về JSON ở dòng cuối cùng:
   CHART_CONFIG:{"type":"bar|line|pie|area","xKey":"tên_cột_x","yKey":"tên_cột_y"}
   - type: bar (so sánh), line (xu hướng), pie (tỷ lệ), area (tích luỹ)
   - Nếu chỉ có 1 giá trị đơn lẻ hoặc không phù hợp vẽ chart, không cần trả CHART_CONFIG.
"""


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


def clean_sql(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return text


def parse_chart_config(text: str) -> tuple[str, dict | None]:
    chart_config = None
    clean_lines = []
    for line in text.split("\n"):
        if line.strip().startswith("CHART_CONFIG:"):
            try:
                chart_config = json.loads(line.strip().replace("CHART_CONFIG:", ""))
            except json.JSONDecodeError:
                pass
        else:
            clean_lines.append(line)
    return "\n".join(clean_lines).strip(), chart_config


def text_to_sql(question: str) -> dict:
    schema = get_schema_context()
    system_prompt = SQL_SYSTEM_PROMPT + f"Schema:\n{schema}"

    pre_input_tokens = count_tokens(system_prompt + "\n" + question)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        config={
            "system_instruction": system_prompt,
            "temperature": 0,
            "thinking_config": {"include_thoughts": True},
        },
        contents=question,
    )

    usage = extract_token_usage(response.usage_metadata)
    usage["pre_input"] = pre_input_tokens
    usage["schema"] = count_tokens(schema)
    usage["instruction"] = count_tokens(system_prompt) - usage["schema"]
    usage["question"] = count_tokens(question)

    sql = clean_sql(response.text)
    db_result = execute_sql(sql)

    return {
        "sql": sql,
        "thinking": extract_thinking(response),
        "token_usage": usage,
        "columns": db_result["columns"],
        "rows": db_result["rows"],
    }


def generate_reply(question: str, columns: list, rows: list) -> dict:
    sample_rows = rows[:50]
    data_text = json.dumps({"columns": columns, "rows": sample_rows}, ensure_ascii=False)
    contents = f"Câu hỏi: {question}\n\nDữ liệu:\n{data_text}"

    pre_input_tokens = count_tokens(REPLY_SYSTEM_PROMPT + "\n" + contents)
    instruction_tokens = count_tokens(REPLY_SYSTEM_PROMPT)
    data_tokens = count_tokens(data_text)
    question_tokens = count_tokens(question)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        config={
            "system_instruction": REPLY_SYSTEM_PROMPT,
            "temperature": 0.3,
            "thinking_config": {"include_thoughts": True},
        },
        contents=contents,
    )

    reply_text, chart_config = parse_chart_config(response.text.strip())
    reply_usage = extract_token_usage(response.usage_metadata)
    reply_usage["pre_input"] = pre_input_tokens
    reply_usage["instruction"] = instruction_tokens
    reply_usage["data"] = data_tokens
    reply_usage["question"] = question_tokens

    return {
        "reply": reply_text,
        "chart_config": chart_config,
        "reply_token_usage": reply_usage,
    }
