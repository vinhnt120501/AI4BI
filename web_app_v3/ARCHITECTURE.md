# AI4BI - Kiến trúc hệ thống

## Tổng quan Pipeline

```
User hỏi (tiếng Việt)
  → FastAPI (SSE streaming)
    → LLM: text → SQL (có extended thinking)
      → TiDB Cloud: chạy SQL lấy data
        → LLM: phân tích data + chọn chart type
          → Frontend render chart bằng Recharts
```

## Lưu trữ dữ liệu

Toàn bộ dữ liệu được lưu trữ tập trung trên **TiDB Cloud** (MySQL compatible, AWS Southeast Asia).

### Tables trong TiDB Cloud

| Table | Mô tả | Loại |
|-------|--------|------|
| `view_genie_person` | Thông tin khách hàng/người thụ hưởng | Business data |
| `view_genie_shop` | Cửa hàng, khu vực, tỉnh thành | Business data |
| `view_genie_vaccine_product` | Danh mục sản phẩm vaccine (SKU, nhóm bệnh) | Business data |
| `view_genie_vaccine_sales_order_detail` | Chi tiết đơn hàng bán | Business data |
| `view_genie_vaccine_returned_order_detail` | Chi tiết đơn trả hàng | Business data |
| `view_genie_vaccine_shop_target` | Chỉ tiêu bán hàng theo shop/tháng | Business data |
| `sample_central_rabie` | Dữ liệu mẫu tiêm chủng | Business data |
| `chat_history` | Lịch sử chat (câu hỏi, SQL, reply, tokens, chart config) | Application |
| `memory_facts` | Facts trích xuất từ hội thoại (category, importance) | Application |
| `memory_vectors` | Vector embeddings cho semantic search | Application |

### Kết nối database

- File config: `backend/.env` (TIDB_HOST, TIDB_PORT, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE)
- Connection pool: `backend/db/connection.py` — MySQLConnectionPool (5 connections, SSL enabled)
- Tất cả tables được auto-create khi khởi động server (`api.py`)

## Cấu trúc dự án

```
web_app_v2/
├── backend/
│   ├── api.py                  # FastAPI server + SSE streaming + memory admin API
│   ├── chat_service.py         # Orchestrate chat flow (SQL → data → reply)
│   ├── llm.py                  # LLM API (sinh SQL + phân tích data)
│   ├── memory.py               # Memory service (short-term, facts, vectors)
│   ├── prompts.py              # System prompts cho các giai đoạn
│   ├── schema_context.txt      # Schema definition cho LLM
│   ├── db/
│   │   ├── __init__.py         # Public exports
│   │   ├── connection.py       # TiDB connection pool
│   │   ├── schema.py           # Schema context management
│   │   ├── executor.py         # SQL execution + validation
│   │   ├── chat_history.py     # CRUD cho bảng chat_history
│   │   ├── memory_store.py     # CRUD cho bảng memory_facts
│   │   └── vector_store.py     # CRUD cho bảng memory_vectors + cosine similarity
│   ├── requirements.txt
│   └── .env                    # API keys, TiDB credentials
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            # Trang chat chính (SSE client)
│   │   │   ├── layout.tsx          # Root layout
│   │   │   └── globals.css         # Tailwind CSS
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── MessageBubble.tsx   # Orchestrator message
│   │   │   │   ├── DynamicChart.tsx    # Dynamic chart renderer
│   │   │   │   ├── MarkdownTableRenderer.tsx
│   │   │   │   ├── blocks/             # Structured content blocks
│   │   │   │   │   ├── BlockRenderer.tsx
│   │   │   │   │   ├── StatCard.tsx
│   │   │   │   │   ├── AnalysisTable.tsx
│   │   │   │   │   └── Heading.tsx
│   │   │   │   ├── sections/           # Các phần hiển thị trong message
│   │   │   │   │   ├── UserBubble.tsx
│   │   │   │   │   ├── ProgressTimeline.tsx
│   │   │   │   │   ├── SqlSection.tsx
│   │   │   │   │   ├── TableSection.tsx
│   │   │   │   │   ├── TokenSection.tsx
│   │   │   │   │   ├── ActionButtons.tsx
│   │   │   │   │   ├── FollowUpSuggestions.tsx
│   │   │   │   │   └── LlmPayloadSection.tsx
│   │   │   │   ├── shared/             # Components dùng chung
│   │   │   │   │   ├── CollapsibleBox.tsx
│   │   │   │   │   └── StreamingText.tsx
│   │   │   │   ├── layout/             # Header + Input
│   │   │   │   │   ├── ChatHeader.tsx
│   │   │   │   │   └── ChatInput.tsx
│   │   │   │   └── index.ts           # Public exports
│   │   │   └── sidebar/
│   │   │       ├── Sidebar.tsx
│   │   │       └── index.ts
│   │   └── types/
│   │       └── types.ts            # TypeScript interfaces
│   └── package.json
├── ARCHITECTURE.md                 # File này
└── readme/
    ├── SETUP.md                    # Hướng dẫn cài đặt frontend
    ├── DEPLOY.md                   # Deploy lên AWS
    ├── DYNAMODB_CHAT_HISTORY.md    # (Legacy) Hướng dẫn DynamoDB
    └── SWITCH_TO_GPT4O.md         # (Legacy) Chuyển từ Bedrock sang OpenAI
```

## Backend

### Các file chính

| File | Vai trò |
|------|---------|
| `api.py` | FastAPI server, endpoint `/chat` (SSE streaming), memory admin endpoints |
| `chat_service.py` | Orchestrate luồng xử lý: sinh SQL → chạy SQL → sinh reply |
| `llm.py` | Gọi LLM API 2 lần: (1) sinh SQL, (2) phân tích data + tạo chart config |
| `memory.py` | Memory service: short-term session, fact extraction, vector semantic search |
| `prompts.py` | System prompts cho SQL generation, reply generation, memory extraction |
| `db/` | Package quản lý database — tất cả trên TiDB Cloud |

### db/ - Database package

| File | Vai trò |
|------|---------|
| `connection.py` | TiDB connection pool (MySQL compatible, SSL) |
| `schema.py` | Đọc/cache schema context cho LLM |
| `executor.py` | Chạy SQL queries, validate SQL, compute data summary |
| `chat_history.py` | Lưu/đọc lịch sử chat (`chat_history` table) |
| `memory_store.py` | CRUD cho facts đã trích xuất (`memory_facts` table) |
| `vector_store.py` | Lưu/tìm kiếm vector embeddings (`memory_vectors` table) |

### Memory System (memory.py)

Hệ thống memory gồm 4 lớp, tất cả lưu trên TiDB Cloud:

| Lớp | Nguồn | Mô tả |
|-----|-------|-------|
| **Static Block** | Config (.env) | Context cố định (rules, domain knowledge) |
| **Fact Block** | `memory_facts` table | Facts trích xuất từ hội thoại (category + importance ranking) |
| **Vector Block** | `memory_vectors` table | Semantic search bằng cosine similarity trên embeddings |
| **Short-term** | `chat_history` table | Vài turns gần nhất trong session hiện tại |

**Vector search flow:**
1. Embedding model (`text-embedding-3-small`) tạo vector cho query
2. Lấy tất cả vectors của user từ `memory_vectors` table
3. Tính cosine similarity trong Python
4. Trả về top-k kết quả gần nhất

### api.py - FastAPI + SSE

- **Endpoint chính:** `POST /chat` nhận `{ message, sessionId, userId }`
- **Output:** Server-Sent Events stream với các event types:
  1. `status` - Trạng thái xử lý hiện tại
  2. `thinking` - Quá trình suy nghĩ của LLM
  3. `sql` - SQL đã sinh + token usage
  4. `data` - Columns + rows từ database
  5. `reply` - Phân tích + chart config
  6. `done` - Tổng token cost
  7. `error` - Lỗi nếu có
- **Memory admin endpoints:** `/memory/overview`, `/memory/search`, `/memory/reset`, `/memory/rebuild`

### llm.py - LLM API (2 giai đoạn)

**Giai đoạn 1: text → SQL**
- Input: câu hỏi tiếng Việt + schema DB + memory context
- System prompt yêu cầu:
  - Trả về tất cả cột số (SUM, COUNT, %)
  - Dùng GROUP BY để ra nhiều dòng
  - Dùng LIKE cho tìm kiếm text
  - Thêm LIMIT + ORDER BY
- Nếu SQL lỗi → tự động retry kèm error message

**Giai đoạn 2: phân tích data + chart**
- Input: câu hỏi + columns + rows + memory context
- Output: markdown phân tích + chart config JSON

## Cách tự động vẽ Chart

### LLM quyết định loại chart

| Chart Type | Khi nào dùng |
|------------|-------------|
| `bar` | So sánh < 15 nhóm |
| `horizontal_bar` | >= 15 nhóm hoặc label dài |
| `line` | Xu hướng theo thời gian |
| `area` | Chuỗi thời gian tích lũy |
| `pie` | Tỷ lệ % (< 8 nhóm) |
| `donut` | Tỷ lệ % kiểu hiện đại |
| `stacked_bar` | Phân tích thành phần |
| `scatter` | Tương quan 2 biến |
| `radar` | So sánh đa chiều |
| `treemap` | Tỷ lệ kích thước |
| `funnel` | Phễu chuyển đổi |
| `composed` | Kết hợp bar + line |

LLM trả về config dạng:

```json
{
  "type": "bar",
  "xKey": "ten_cot_x",
  "yKeys": ["so_lieu_1", "so_lieu_2"]
}
```

### Frontend render chart

- `DynamicChart.tsx` nhận `chartConfig` + data → render chart tương ứng bằng Recharts
- Fallback auto-detect: nếu LLM không trả chart config → scan cột số/text → tự chọn chart type

## Frontend

### Tech Stack

- **Framework:** Next.js 15 + React 19 + TypeScript
- **CSS:** Tailwind CSS 4
- **Charting:** Recharts
- **Animation:** Framer Motion
- **Markdown:** react-markdown

### Tổ chức components (`chat/`)

| Folder | Chức năng |
|--------|-----------|
| `blocks/` | Structured content: StatCard, AnalysisTable, Heading, BlockRenderer |
| `sections/` | Các phần trong message: UserBubble, SQL, Table, Token, ActionButtons, FollowUp |
| `shared/` | Components dùng chung: CollapsibleBox, StreamingText |
| `layout/` | Chrome/layout: ChatHeader, ChatInput |
| root | MessageBubble.tsx, DynamicChart.tsx, MarkdownTableRenderer.tsx |

### Luồng xử lý SSE (page.tsx)

1. User gửi câu hỏi → `handleSend()`
2. POST đến `/chat` với fetch + ReadableStream
3. Parse từng SSE event (`event: <type>\ndata: <JSON>\n\n`)
4. Cập nhật UI theo từng event type (progressive rendering)
5. MessageBubble render ngay lập tức khi nhận data

## Streaming (SSE) - Điểm hay của kiến trúc

Backend **không chờ xong hết mới trả**, mà stream từng event:

```
[0s]  status: "Đang sinh SQL..."
[2s]  thinking: "Suy nghĩ của LLM..."
[3s]  sql: "SELECT ..." + token usage
[4s]  data: columns + rows        → Frontend hiện bảng ngay
[6s]  reply: phân tích + chart    → Frontend hiện chart + typing text
[7s]  done: tổng token cost
```

Frontend nhận từng event và render ngay → UX mượt, user không phải chờ.

## Dependencies

### Backend (requirements.txt)

| Package | Vai trò |
|---------|---------|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `python-dotenv` | Load .env |
| `mysql-connector-python` | Kết nối TiDB Cloud |
| `openai` | Gọi LLM API + Embedding API |

### Frontend

- Next.js, React, TypeScript, Tailwind CSS, Recharts, Framer Motion, react-markdown

## Deployment

```bash
# Backend: FastAPI server (port 8001)
cd backend && python api.py

# Frontend: Next.js dev server (port 3000)
cd frontend && npm run dev
```

**Environment:**
- Backend: `.env` với LLM API keys + TiDB credentials
- Frontend: `.env.local` với `NEXT_PUBLIC_API_URL` (mặc định `localhost:8001`)

## Frontend-First Data Contract

Phần này bám sát đúng những gì frontend 3 mục đang trình bày: `Tổng quan`, `Phân tích`, `Khám phá`.

Nguyên tắc:
- Frontend không hard-code nội dung business.
- Frontend chỉ render theo `screen` + `sections`.
- Backend chỉ được trả những nhóm thông tin mà UI hiện đang có chỗ hiển thị.
- Nếu một section không có dữ liệu thì backend bỏ section đó, frontend không tự bịa nội dung thay thế.

### Envelope chung

Mỗi màn hình nên nhận payload dạng:

```json
{
  "screen": "overview | analysis | explore",
  "header": {
    "title": "string",
    "subtitle": "string",
    "meta": {}
  },
  "sections": [
    {
      "type": "string",
      "id": "string",
      "title": "string",
      "subtitle": "string",
      "items": []
    }
  ],
  "actions": []
}
```

`type` phải thuộc tập section mà frontend hiện có thể trình bày:
- `hero_summary`
- `stat_cards`
- `signal_list`
- `proposal_list`
- `watchlist`
- `agenda_list`
- `chat_thread`
- `context_list`
- `followup_list`
- `working_set`
- `space_grid`
- `recent_analysis_list`
- `source_health`
- `collection_list`
- `search_entry`

### 1. Mục `Tổng quan`

Bám theo UI overview: summary lớn, KPI cards, tín hiệu, phân tích đề xuất, watchlist, agenda.

Backend nên trả các section sau:

1. `hero_summary`
   Dùng cho phần tóm tắt đầu trang.
   Field:
   - `headline`
   - `summary`
   - `highlights`: 1-3 ý ngắn
   - `actions`: mỗi action có `label`, `prompt`

2. `stat_cards`
   Dùng cho 4 ô KPI.
   Field mỗi item:
   - `label`
   - `value`
   - `delta`
   - `tone`: `positive | negative | neutral`

3. `signal_list`
   Dùng cho khối “Tín hiệu”.
   Field mỗi item:
   - `title`
   - `copy`
   - `severity`: `high | medium | low`
   - `badge`
   - `prompt`

4. `proposal_list`
   Dùng cho khối “Phân tích đề xuất”.
   Field mỗi item:
   - `title`
   - `copy`
   - `prompt`

5. `watchlist`
   Dùng cho khối tài khoản/chủ đề cần hành động.
   Field mỗi item:
   - `name`
   - `note`
   - `priority`
   - `prompt`

6. `agenda_list`
   Dùng cho khối agenda cuộc họp.
   Field mỗi item:
   - `title`
   - `note`
   - `prompt`

7. `header.meta`
   Dùng cho thông tin kiểu:
   - `sources_scanned`
   - `last_updated_at`
   - `new_alerts`

Ví dụ payload:

```json
{
  "screen": "overview",
  "header": {
    "title": "Tổng quan điều hành",
    "subtitle": "Dùng AI để gom tín hiệu kinh doanh, đào sâu nguyên nhân và chuyển thẳng thành hành động.",
    "meta": {
      "sources_scanned": 14,
      "new_alerts": 3,
      "last_updated_at": "2026-04-06T09:15:00+07:00"
    }
  },
  "sections": [
    {
      "type": "hero_summary",
      "id": "hero",
      "headline": "Doanh thu toàn công ty đang tích cực, nhưng miền Nam là điểm gãy cần xử lý ngay.",
      "summary": "Hệ thống đã quét 14 nguồn dữ liệu từ phiên gần nhất...",
      "actions": [
        { "label": "Mở phân tích miền Nam", "prompt": "Tại sao doanh thu miền Nam giảm 18%?" },
        { "label": "Tạo executive brief", "prompt": "Tạo báo cáo cho ban lãnh đạo" }
      ]
    },
    {
      "type": "stat_cards",
      "id": "pulse",
      "items": [
        { "label": "MRR", "value": "56 tỷ", "delta": "+8.2%", "tone": "positive" }
      ]
    }
  ]
}
```

### 2. Mục `Phân tích`

Bám theo UI analysis: thread chat, chart/table/text động, context nhanh, câu hỏi hỏi tiếp, working set hiện tại.

Backend nên trả các nhóm sau:

1. `chat_thread`
   Đây là nội dung trung tâm của màn hình.
   Mỗi message assistant nên giữ đúng cấu trúc hiện backend `/chat` đang có:
   - `content`
   - `sql`
   - `columns`
   - `rows`
   - `chart_config`
   - `blocks`
   - `status_text`
   - `current_step`
   - `follow_up_suggestions`

2. `context_list`
   Dùng cho cột phải “Tóm tắt nhanh”.
   Field mỗi item:
   - `title`
   - `note`

3. `followup_list`
   Dùng cho khối “Câu hỏi nên hỏi tiếp”.
   Field mỗi item:
   - `label`
   - `prompt`

4. `working_set`
   Dùng cho khối “Working set hiện tại”.
   Field mỗi item:
   - `name`
   - `detail`
   - `source_type`

5. `header.meta`
   Dùng cho chip đầu trang hoặc header phụ:
   - `analysis_scope`
   - `sources_used`
   - `last_updated_at`

Quy tắc quan trọng:
- Toàn bộ narrative, cards, chart, table trong màn `Phân tích` phải đi qua `blocks` hoặc fields từ `/chat`.
- Frontend không tự dựng sẵn “Nguyên nhân gốc”, “Hành động đề xuất”, “Vinamilk” nếu backend không trả.
- Nếu backend chỉ có text + data, frontend render text + table/chart fallback; không thêm insight hard-code.

Ví dụ assistant message:

```json
{
  "role": "assistant",
  "content": "Doanh thu giảm tập trung ở một số tài khoản cụ thể...",
  "sql": "SELECT ...",
  "columns": ["account_name", "revenue_change_pct"],
  "rows": [["A", "-32"], ["B", "-24"]],
  "chart_config": {
    "type": "bar",
    "xKey": "account_name",
    "yKeys": ["revenue_change_pct"]
  },
  "blocks": [
    {
      "type": "stat_cards",
      "cards": [
        { "label": "Tài khoản ảnh hưởng lớn nhất", "value": "Vinamilk", "subtitle": "-32%", "trend": "down", "color": "red" }
      ]
    },
    {
      "type": "chart",
      "chartType": "bar",
      "xKey": "account_name",
      "yKeys": ["revenue_change_pct"],
      "title": "Doanh thu theo tài khoản"
    }
  ],
  "follow_up_suggestions": [
    "Soạn email cho Vinamilk",
    "Mô phỏng mất 3 tài khoản"
  ]
}
```

### 3. Mục `Khám phá`

Bám theo UI explore: search entry, spaces, phân tích gần đây, tình trạng đồng bộ nguồn dữ liệu, collections.

Backend nên trả các section sau:

1. `search_entry`
   Dùng cho khối tìm kiếm đầu trang.
   Field:
   - `placeholder`
   - `suggested_queries`

2. `space_grid`
   Dùng cho “Không gian dữ liệu”.
   Field mỗi item:
   - `title`
   - `description`
   - `badge`
   - `tone`
   - `prompt`

3. `recent_analysis_list`
   Dùng cho “Phân tích gần đây”.
   Field mỗi item:
   - `title`
   - `summary`
   - `tag`
   - `time_label`
   - `prompt`

4. `source_health`
   Dùng cho “Tình trạng đồng bộ dữ liệu”.
   Field mỗi item:
   - `name`
   - `detail`
   - `status`
   - `state`: `ok | warning | error`
   - `updated_at`

5. `collection_list`
   Dùng cho “Lối tắt cho team điều hành”.
   Field mỗi item:
   - `title`
   - `summary`
   - `prompt`

Ví dụ payload:

```json
{
  "screen": "explore",
  "header": {
    "title": "Khám phá dữ liệu",
    "subtitle": "Bắt đầu từ domain, báo cáo gần đây hoặc truy vấn tự nhiên."
  },
  "sections": [
    {
      "type": "space_grid",
      "id": "spaces",
      "items": [
        {
          "title": "Doanh thu",
          "description": "MRR, ARR, churn, mở rộng",
          "badge": "1 tín hiệu",
          "tone": "red",
          "prompt": "Tổng quan doanh thu hiện tại"
        }
      ]
    },
    {
      "type": "recent_analysis_list",
      "id": "recent",
      "items": [
        {
          "title": "Vì sao deal doanh nghiệp tăng tốc",
          "summary": "Phân tích sâu kết nối chương trình đối tác với pipeline tăng.",
          "tag": "Bán hàng",
          "time_label": "2 giờ trước",
          "prompt": "Vì sao deal doanh nghiệp tăng tốc"
        }
      ]
    }
  ]
}
```

### Mapping từ backend hiện tại

Những gì đã dùng được ngay:
- `/chat` phù hợp cho màn `Phân tích`
- `chat_history` phù hợp để cấp `recent_analysis_list`
- `suggestions.questions` phù hợp để cấp `followup_list`
- `columns + rows + chart_config + blocks` phù hợp để render phần nội dung động của màn `Phân tích`

Những gì backend hiện chưa có rõ ràng:
- `hero_summary` cho `Tổng quan`
- `signal_list` tổng hợp cấp điều hành
- `watchlist`
- `agenda_list`
- `space_grid`
- `source_health`
- `collection_list`

### Kết luận triển khai

Muốn bám đúng frontend hiện tại thì backend nên có đúng 3 loại payload:
- `overview payload` cho mục `Tổng quan`
- `analysis payload` cho mục `Phân tích`
- `explore payload` cho mục `Khám phá`

Frontend chỉ render đúng các section ở trên. Không hard-code nội dung business. Không mở rộng thêm loại thông tin ngoài những gì UI hiện đang trình bày.
