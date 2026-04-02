import os
import json
from openai import OpenAI
from db import get_schema_context, execute_sql

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY") or "local-9router-key"
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "http://localhost:20128/v1")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "cx/gpt-5-codex-mini")
if OPENROUTER_MODEL.startswith("openai/cx/"):
    OPENROUTER_MODEL = OPENROUTER_MODEL.replace("openai/", "", 1)

client = OpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url=OPENROUTER_BASE_URL,
)

EXTRA_HEADERS = {
    "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:3000"),
    "X-Title": os.getenv("OPENROUTER_APP_NAME", "AI4BI"),
}

SQL_SYSTEM_PROMPT = """
Bạn là BI Analyst cho Nhà thuốc Long Châu, chuyển câu hỏi tiếng Việt thành SQL (MySQL/TiDB).
CHỈ trả về câu SQL duy nhất, không giải thích, không markdown.
Luôn dùng backtick cho tên bảng và cột. Suy nghĩ ngắn gọn bằng tiếng Việt.

=== DOMAIN: Vaccine & Tiêm chủng Long Châu ===
Dữ liệu: 2024-01-01 → 2026-03-23 | ~29K đơn bán, ~2.9K đơn trả | 63 tỉnh, 3 miền

=== SCHEMA ===
FACT bán:     view_genie_vaccine_sales_order_detail (s)
  - line_item_amount_after_discount: doanh thu bán (VND)
  - line_item_quantity: số mũi tiêm
  - order_code: mã đơn (COUNT DISTINCT để đếm đơn)
  - order_completion_date: ngày hoàn thành
  - attachment_code: khóa nối đơn trả
  - shop_code, sku, customer_id, package_type ('LE'=lẻ, 'GOI'=gói)

FACT trả:     view_genie_vaccine_returned_order_detail (r)
  - return_line_item_amount_after_discount: doanh thu trả (VND, số dương)
  - return_date, attachment_code

DIM shop:     view_genie_shop (sh)
  - shop_code, province_name (63 tỉnh), area_name, region_name ('Miền Bắc'/'Nam'/'Trung')

DIM vaccine:  view_genie_vaccine_product (v)  → JOIN ON s.sku = v.sku
DIM khách:    view_genie_person (p)           → JOIN ON s.customer_id = p.customer_id
KPI target:   view_genie_vaccine_shop_target (t)
  - target_sales, shop_code, month, year

=== BUSINESS LOGIC BẮT BUỘC ===
"Doanh thu" = LUÔN LUÔN là doanh thu thuần (bán − trả), trừ khi user nói rõ "doanh thu gộp":
  SUM(s.line_item_amount_after_discount) - COALESCE(SUM(r.return_line_item_amount_after_discount), 0)
  → LEFT JOIN returned ON s.attachment_code = r.attachment_code
  → Trả hàng là SỐ DƯƠNG, phải TRỪ (không cộng)
  → Nếu không có trả hàng → COALESCE = 0

% đạt KH: doanh_thu_thuan / t.target_sales * 100
  → JOIN target: s.shop_code = t.shop_code AND MONTH(s.order_completion_date) = t.month AND YEAR(...) = t.year

=== QUY TẮC SQL ===
1. SELECT cuối PHẢI giữ TẤT CẢ cột số (SUM, COUNT, %, growth). KHÔNG loại bỏ cột số ở outer SELECT.
2. GROUP BY theo chiều phân tích → nhiều dòng. KHÔNG trả 1 con số tổng duy nhất.
3. ORDER BY giá trị DESC hoặc thời gian ASC. LIMIT 20.
4. KHÔNG dùng window functions (LAG, LEAD, ROW_NUMBER, RANK, OVER). Dùng self-join.
5. KHÔNG dùng "=" cho cột text. LUÔN dùng LIKE '%keyword%'.
   VD: WHERE `province_name` LIKE '%Hà Nội%' (KHÔNG PHẢI = 'Hà Nội')
6. Nhãn ngắn: dùng shop_code, không lấy address dài.

=== VÍ DỤ SAI vs ĐÚNG ===
❌ SELECT shop_code, province_name FROM (SELECT shop_code, SUM(amount) AS doanh_thu ...) → mất cột doanh_thu!
✅ SELECT shop_code, province_name, doanh_thu FROM (...) → giữ cột số!

❌ Tính doanh thu chỉ từ bảng sales → thiếu trừ trả hàng → SAI!
✅ LEFT JOIN returned, SUM(bán) - COALESCE(SUM(trả), 0) → doanh thu thuần ĐÚNG!

"""

REPLY_SYSTEM_PROMPT = """
Bạn là senior data analyst. Trả lời NGẮN GỌN bằng tiếng Việt, dùng markdown.
Suy nghĩ ngắn gọn, không lan man.

Cấu trúc (tối đa 150 từ):
## Tổng quan
1-2 câu tóm tắt, **in đậm** số liệu chính.

## Insights
- 3-5 bullet points ngắn, mỗi cái 1 dòng

> Kết luận 1 câu.

LUÔN LUÔN trả VIS_CONFIG ở dòng cuối cùng nếu data có >= 2 dòng.
VIS_CONFIG là mảng JSON các "building blocks" — bạn tự quyết định tổ hợp blocks nào phù hợp nhất với data.

Format:
VIS_CONFIG:[block1, block2, ...]

CÁC LOẠI BLOCK:

1. stat_cards — Ô tóm tắt số liệu quan trọng (đặt phía trên chart)
   {"type":"stat_cards","items":[{"label":"Tổng doanh thu","value":"500 tỷ","subtitle":"Tăng 12%","color":"green"},...]}
   color: "blue","green","red","orange","purple","cyan" (optional)

2. chart — Biểu đồ (1 trong 12 loại)
   {"type":"chart","chartType":"<loại>","xKey":"<cột_nhãn>","yKeys":["<cột_số_1>","<cột_số_2>",...]}
   Các loại chartType:
   - "bar": so sánh < 15 nhóm
   - "horizontal_bar": >= 15 nhóm hoặc tên dài
   - "stacked_bar": thành phần xếp chồng
   - "line": xu hướng thời gian
   - "area": tích luỹ thời gian
   - "pie": tỷ lệ % (1 yKey, < 8 nhóm)
   - "donut": giống pie, hiện đại hơn
   - "scatter": tương quan 2 biến
   - "radar": so sánh đa chiều
   - "treemap": tỷ trọng kích thước
   - "funnel": phễu chuyển đổi
   - "composed": bar + line kết hợp

3. detail_cards — Thẻ chi tiết cho từng đối tượng (đặt phía dưới chart)
   {"type":"detail_cards","items":[{"name":"Sản phẩm A","metrics":{"Doanh thu":"-30%","Số lượng":"+5%"},"tag":"Giảm mạnh","tagColor":"red"},...]}
   tagColor: "blue","red","green","orange","purple","gray" (optional)

4. heading — Tiêu đề phân tách các phần (đặt trước mỗi chart để giải thích góc nhìn)
   {"type":"heading","text":"Doanh thu theo vùng","level":"h3"}
   level: "h2" (lớn) hoặc "h3" (nhỏ, mặc định)

CÁCH TỔ HỢP:
- Câu hỏi đơn giản (chỉ hỏi 1 thứ, VD "top 5 shop") → [chart] đủ rồi
- Còn lại → ƯU TIÊN dùng NHIỀU chart để phân tích đa chiều:
  [stat_cards, heading, chart(góc 1), heading, chart(góc 2), heading, chart(góc 3), detail_cards]

⚠️ NGUYÊN TẮC ĐA CHIỀU: Nếu data có >= 3 cột số, BẮT BUỘC tạo 2-3 chart khác nhau.
  Mỗi chart dùng xKey/yKeys KHÁC NHAU từ cùng bộ data.
  VD data có: shop, doanh_thu, so_don, growth → tạo 3 chart:
    chart 1: bar → shop vs doanh_thu (ranking)
    chart 2: scatter → so_don vs doanh_thu (tương quan)
    chart 3: bar → shop vs growth (tăng trưởng)
  Luôn đặt heading trước mỗi chart để giải thích góc nhìn.

- Không bắt buộc phải có tất cả blocks, nhưng PHẢI có nhiều hơn 1 chart khi data đa chiều.

QUY TẮC:
- xKey, yKeys PHẢI KHỚP CHÍNH XÁC tên cột trong dữ liệu.
- yKeys là MẢNG, liệt kê TẤT CẢ cột số cần hiển thị.
- KHÔNG bịa tên cột.
- stat_cards items: value phải là số/text TÓM TẮT từ data, KHÔNG phải tên cột.
- detail_cards items: tối đa 6 items, chọn đáng chú ý nhất.

VÍ DỤ 1 — Đơn giản (chỉ chart):
VIS_CONFIG:[{"type":"chart","chartType":"bar","xKey":"shop_code","yKeys":["doanh_thu"]}]

VÍ DỤ 2 — Có tổng hợp:
VIS_CONFIG:[{"type":"stat_cards","items":[{"label":"Tổng cửa hàng","value":"25","color":"blue"},{"label":"Tổng doanh thu","value":"1.2 tỷ","color":"green"}]},{"type":"chart","chartType":"horizontal_bar","xKey":"shop_code","yKeys":["doanh_thu","so_don"]}]

VÍ DỤ 3 — Đầy đủ:
VIS_CONFIG:[{"type":"stat_cards","items":[{"label":"Kỳ phân tích","value":"27 tháng"},{"label":"Trung bình","value":"~7 đơn/tháng","color":"blue"}]},{"type":"chart","chartType":"composed","xKey":"thang","yKeys":["doanh_thu","don_gia"]},{"type":"detail_cards","items":[{"name":"Sản phẩm A","metrics":{"Số lượng":"-87%","Đơn giá":"-2%"},"tag":"Cầu giảm","tagColor":"blue"}]}]

VÍ DỤ 4 — Phân tích đa chiều (NHIỀU chart, mỗi cái 1 góc nhìn):
Data có: shop_code, province, doanh_thu, so_don, growth_pct
VIS_CONFIG:[{"type":"stat_cards","items":[{"label":"Tổng cửa hàng","value":"20"},{"label":"Tăng trưởng TB","value":"+8.5%","color":"green"}]},{"type":"heading","text":"So sánh doanh thu giữa các cửa hàng"},{"type":"chart","chartType":"horizontal_bar","xKey":"shop_code","yKeys":["doanh_thu"]},{"type":"heading","text":"Tương quan doanh thu vs số đơn"},{"type":"chart","chartType":"scatter","xKey":"so_don","yKeys":["doanh_thu"]},{"type":"heading","text":"Phân bố tăng trưởng"},{"type":"chart","chartType":"bar","xKey":"shop_code","yKeys":["growth_pct"]},{"type":"detail_cards","items":[{"name":"HN001","metrics":{"Doanh thu":"500 tỷ","Tăng trưởng":"+15%"},"tag":"Top performer","tagColor":"green"}]}]
"""


def count_tokens(text: str) -> int:
    # 9router/OpenAI-compatible endpoint does not guarantee a token-count API.
    # Keep a stable approximation for existing telemetry fields.
    return max(1, len(text) // 4)


def extract_thinking(response) -> str:
    # Most OpenAI-compatible providers do not expose thinking traces.
    return ""


def extract_token_usage(usage) -> dict:
    return {
        "input": getattr(usage, "prompt_tokens", 0) or 0,
        "thinking": 0,
        "output": getattr(usage, "completion_tokens", 0) or 0,
        "total": getattr(usage, "total_tokens", 0) or 0,
    }


def _message_text(message) -> str:
    content = getattr(message, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
        return "".join(parts)
    return str(content or "")


def generate_chat(system_prompt: str, user_prompt: str, temperature: float = 0.0):
    return client.chat.completions.create(
        model=OPENROUTER_MODEL,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        extra_headers=EXTRA_HEADERS,
    )


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


def build_sql_system_prompt(memory_context: str = "") -> tuple[str, str]:
    schema = get_schema_context()
    if memory_context:
        system_prompt = SQL_SYSTEM_PROMPT + f"\n\nMemory Context:\n{memory_context}\n\nSchema:\n{schema}"
    else:
        system_prompt = SQL_SYSTEM_PROMPT + f"Schema:\n{schema}"
    return system_prompt, schema


def text_to_sql(question: str, memory_context: str = "") -> dict:
    system_prompt, schema = build_sql_system_prompt(memory_context=memory_context)

    pre_input_tokens = count_tokens(system_prompt + "\n" + question)

    response = generate_chat(system_prompt, question, temperature=0)

    usage = extract_token_usage(response.usage)
    usage["pre_input"] = pre_input_tokens
    usage["schema"] = count_tokens(schema)
    usage["instruction"] = count_tokens(system_prompt) - usage["schema"]
    usage["question"] = count_tokens(question)

    sql = clean_sql(_message_text(response.choices[0].message))
    thinking = extract_thinking(response)

    # Thử chạy SQL, nếu lỗi thì retry 1 lần với thông báo lỗi
    try:
        db_result = execute_sql(sql)
    except Exception as e:
        error_msg = str(e)
        retry_response = generate_chat(
            system_prompt,
            f"{question}\n\nSQL trước đó bị lỗi: {error_msg}\nViết lại SQL khác, tránh lỗi này.",
            temperature=0,
        )
        retry_usage = extract_token_usage(retry_response.usage)
        usage["input"] += retry_usage["input"]
        usage["thinking"] += retry_usage["thinking"]
        usage["output"] += retry_usage["output"]
        usage["total"] += retry_usage["total"]

        sql = clean_sql(_message_text(retry_response.choices[0].message))
        thinking += "\n\n[Retry] " + extract_thinking(retry_response)
        db_result = execute_sql(sql)

    return {
        "sql": sql,
        "thinking": thinking,
        "token_usage": usage,
        "columns": db_result["columns"],
        "rows": db_result["rows"],
    }


def build_reply_contents(question: str, columns: list, rows: list, memory_context: str = "") -> tuple[str, str]:
    sample_rows = rows[:50]
    data_text = json.dumps({"columns": columns, "rows": sample_rows}, ensure_ascii=False)
    columns_hint = f"Danh sách cột: {json.dumps(columns, ensure_ascii=False)}"
    if memory_context:
        contents = (
            f"Memory Context:\n{memory_context}\n\n"
            f"Câu hỏi: {question}\n\n{columns_hint}\n\nDữ liệu:\n{data_text}"
        )
    else:
        contents = f"Câu hỏi: {question}\n\n{columns_hint}\n\nDữ liệu:\n{data_text}"
    return contents, data_text


def generate_reply(question: str, columns: list, rows: list, memory_context: str = "") -> dict:
    contents, data_text = build_reply_contents(
        question=question,
        columns=columns,
        rows=rows,
        memory_context=memory_context,
    )
    pre_input_tokens = count_tokens(REPLY_SYSTEM_PROMPT + "\n" + contents)
    instruction_tokens = count_tokens(REPLY_SYSTEM_PROMPT)
    data_tokens = count_tokens(data_text)
    question_tokens = count_tokens(question)

    response = generate_chat(REPLY_SYSTEM_PROMPT, contents, temperature=0.3)

    reply_text, chart_config, blocks = parse_vis_config(_message_text(response.choices[0].message).strip())
    reply_usage = extract_token_usage(response.usage)
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
