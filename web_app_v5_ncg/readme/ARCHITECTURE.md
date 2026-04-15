# AI4BI - Kiến trúc hệ thống (web_app_v4)

## Tổng quan Pipeline

```
User hỏi (tiếng Việt)
  → FastAPI (SSE streaming)
    → Memory context (4 lớp: static, facts, vectors, short-term)
      → LLM: text → SQL (có extended thinking)
        → TiDB Cloud: chạy SQL lấy data
          → (Optional) Agentic: đánh giá data đủ chưa → gọi thêm SQL nếu cần
            → LLM: phân tích data + chọn chart type (streaming)
              → LLM: sinh follow-up suggestions
                → Frontend render progressive (chart, blocks, streaming text)
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
web_app_v4/
├── backend/
│   ├── api.py                  # FastAPI server + SSE streaming + memory admin API
│   ├── chat_service.py         # Orchestrate chat flow (memory → SQL → data → agentic → reply → followup)
│   ├── memory.py               # Memory service (4 lớp: static, facts, vectors, short-term)
│   ├── prompts.py              # System prompts cho các giai đoạn
│   ├── schema_context.txt      # Schema definition cho LLM
│   ├── test_chat.py            # Test file
│   ├── test_result.json        # Test results
│   ├── llm/                    # LLM package (modular)
│   │   ├── __init__.py         # Public exports
│   │   ├── client.py           # LLM API client wrapper + token counting
│   │   ├── sql_generator.py    # Text → SQL conversion (extended thinking)
│   │   ├── reply_generator.py  # Data → analysis + chart config (streaming)
│   │   ├── parser.py           # JSON/SQL parsing utilities
│   │   ├── agentic.py          # Agentic evaluation + multi-step refinement
│   │   └── followup.py         # Follow-up question generation
│   ├── db/                     # Database package
│   │   ├── __init__.py         # Public exports
│   │   ├── connection.py       # TiDB connection pool (MySQL compatible, SSL)
│   │   ├── schema.py           # Đọc/cache schema context cho LLM
│   │   ├── executor.py         # SQL execution + validation
│   │   ├── chat_history.py     # CRUD cho bảng chat_history
│   │   ├── memory_store.py     # CRUD cho bảng memory_facts
│   │   └── vector_store.py     # CRUD cho bảng memory_vectors + cosine similarity
│   ├── requirements.txt
│   ├── .env                    # API keys, TiDB credentials
│   └── venv/                   # Python virtual environment
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            # Trang chat chính (SSE client)
│   │   │   ├── layout.tsx          # Root layout
│   │   │   ├── not-found.tsx       # 404 page
│   │   │   └── globals.css         # Tailwind CSS
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── MessageBubble.tsx       # Orchestrator: render message với progress, SQL, data, chart, blocks
│   │   │   │   ├── DynamicChart.tsx        # Dynamic chart renderer (Recharts, 10+ loại)
│   │   │   │   ├── MarkdownTableRenderer.tsx
│   │   │   │   ├── index.ts               # Public exports
│   │   │   │   ├── blocks/                # Structured content blocks
│   │   │   │   │   ├── BlockRenderer.tsx
│   │   │   │   │   ├── StatCard.tsx
│   │   │   │   │   ├── AnalysisTable.tsx
│   │   │   │   │   └── Heading.tsx
│   │   │   │   ├── sections/              # Các phần hiển thị trong message
│   │   │   │   │   ├── UserBubble.tsx
│   │   │   │   │   ├── ProgressTimeline.tsx
│   │   │   │   │   ├── SqlSection.tsx
│   │   │   │   │   ├── TableSection.tsx
│   │   │   │   │   ├── TokenSection.tsx
│   │   │   │   │   ├── ActionButtons.tsx
│   │   │   │   │   ├── FollowUpSuggestions.tsx
│   │   │   │   │   ├── LlmPayloadSection.tsx
│   │   │   │   │   └── ReferenceDataDisclosure.tsx
│   │   │   │   ├── shared/                # Components dùng chung
│   │   │   │   │   ├── CollapsibleBox.tsx
│   │   │   │   │   └── StreamingText.tsx
│   │   │   │   └── layout/                # Header + Input
│   │   │   │       ├── ChatHeader.tsx
│   │   │   │       └── ChatInput.tsx
│   │   │   ├── sidebar/
│   │   │   │   ├── FeedRail.tsx        # Feed rail: lịch sử chat + navigation
│   │   │   │   └── index.ts
│   │   │   └── workspace/
│   │   │       ├── types.ts            # Workspace types
│   │   │       ├── layout/
│   │   │       │   └── TopBar.tsx
│   │   │       └── pages/
│   │   │           └── AnalysisPage.tsx    # Main page layout
│   │   └── types/
│   │       └── types.ts            # TypeScript interfaces
│   └── package.json
├── ARCHITECTURE.md                 # File này
├── lc_instruction.md               # Business logic & rules cho Long Châu PoC
├── start.sh                        # Start cả 2 services (backend 8333, frontend 3333)
├── ai-bi-webapp.jsx                # Legacy/reference component
└── readme/
    ├── SETUP.md                    # Hướng dẫn cài đặt
    ├── DEPLOY.md                   # Deploy lên AWS
    ├── DYNAMODB_CHAT_HISTORY.md    # (Legacy) Hướng dẫn DynamoDB
    └── SWITCH_TO_GPT4O.md         # (Legacy) Chuyển từ Bedrock sang OpenAI
```

## Backend

### Các file chính

| File | Vai trò |
|------|---------|
| `api.py` | FastAPI server, endpoint `/chat` (SSE streaming), file ingestion, memory admin endpoints |
| `chat_service.py` | Orchestrate luồng xử lý: memory → SQL → data → agentic → reply → followup |
| `memory.py` | Memory service: short-term session, fact extraction, vector semantic search |
| `prompts.py` | System prompts cho SQL generation, reply generation, memory extraction |

### llm/ - LLM package (modular)

| File | Vai trò |
|------|---------|
| `client.py` | LLM API client wrapper (OpenAI/OpenRouter compatible) + token counting |
| `sql_generator.py` | Sinh SQL từ câu hỏi tiếng Việt (extended thinking) |
| `reply_generator.py` | Phân tích data + sinh chart config + markdown response (streaming) |
| `parser.py` | Parse JSON, SQL, visualization config từ LLM output |
| `agentic.py` | Đánh giá data đã đủ trả lời chưa, gọi thêm SQL nếu cần |
| `followup.py` | Sinh câu hỏi gợi ý tiếp theo |

### db/ - Database package

| File | Vai trò |
|------|---------|
| `connection.py` | TiDB connection pool (MySQL compatible, SSL) |
| `schema.py` | Đọc/cache schema context cho LLM |
| `executor.py` | Chạy SQL queries, validate SQL (chỉ cho SELECT/WITH), compute data summary |
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
- **File ingestion:** `POST /files/ingest` — upload file để bổ sung memory context
- **Output:** Server-Sent Events stream với các event types:
  1. `status` - Trạng thái xử lý hiện tại
  2. `thinking` - Quá trình suy nghĩ của LLM (extended thinking)
  3. `sql` - SQL đã sinh + token usage
  4. `data` - Columns + rows từ database
  5. `additional_data` - Data bổ sung từ agentic step
  6. `reply` - Phân tích + chart config (streaming text)
  7. `suggestions` - Câu hỏi gợi ý tiếp theo
  8. `timing` - Performance metrics
  9. `done` - Tổng token cost
  10. `error` - Lỗi nếu có
- **Memory admin endpoints:**
  - `GET /memory/admin/overview` — Thống kê memory
  - `POST /memory/admin/search` — Tìm kiếm memory
  - `DELETE /memory/admin/items/{memory_id}` — Xóa memory item
  - `POST /memory/admin/reset` — Reset user memory
  - `POST /memory/admin/rebuild` — Rebuild memory indexes
  - `POST /memory/admin/context-preview` — Preview memory context

### Luồng xử lý chi tiết (chat_service.py)

```
1. Build memory context (memory.py)
   - Fetch short-term chat history
   - Search vector embeddings (semantic match)
   - Include extracted facts
   - Load static business rules
   ↓
2. SQL Generation (llm/sql_generator.py)
   - text_to_sql_detailed() với extended thinking
   - System prompt: schema + rules + memory context
   → Stream: status, thinking, sql, token_usage
   ↓
3. Execute SQL (db/executor.py)
   - Validate (chỉ SELECT/WITH, không DML/DDL)
   - Chạy trên TiDB Cloud
   → Stream: data (columns + rows)
   ↓
4. Agentic Evaluation (llm/agentic.py) — optional
   - agentic_evaluate(): đánh giá data đã đủ chưa
   - execute_agentic_step(): gọi thêm SQL nếu cần
   → Stream: additional_data
   ↓
5. Reply Generation (llm/reply_generator.py)
   - stream_reply(): streaming markdown + blocks + chart config
   - build_reply_contents(): parse structured blocks
   → Stream: reply (streaming text)
   ↓
6. Follow-up Generation (llm/followup.py)
   - generate_followup_questions_detailed()
   → Stream: suggestions
   ↓
7. Save to chat_history + stream done event
   → Stream: timing, done
```

### LLM Pipeline (2+ giai đoạn)

**Giai đoạn 1: text → SQL** (`llm/sql_generator.py`)
- Input: câu hỏi tiếng Việt + schema DB + memory context
- System prompt yêu cầu:
  - Trả về tất cả cột số (SUM, COUNT, %)
  - Dùng GROUP BY để ra nhiều dòng
  - Dùng LIKE cho tìm kiếm text
  - Thêm LIMIT + ORDER BY
- Nếu SQL lỗi → tự động retry kèm error message

**Giai đoạn 1.5: Agentic evaluation** (`llm/agentic.py`) — optional
- Đánh giá data đã đủ trả lời câu hỏi chưa
- Nếu chưa → sinh thêm SQL queries bổ sung
- Iterative refinement cho câu hỏi phức tạp

**Giai đoạn 2: phân tích data + chart** (`llm/reply_generator.py`)
- Input: câu hỏi + columns + rows + memory context
- Output: markdown phân tích + structured blocks (stat cards, charts, tables)

**Giai đoạn 3: follow-up suggestions** (`llm/followup.py`)
- Input: câu hỏi + data summary
- Output: danh sách câu hỏi gợi ý tiếp theo

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
  "yKeys": ["so_lieu_1", "so_lieu_2"],
  "options": {
    "layout": "horizontal",
    "stacked": true,
    "dualAxis": false,
    "gradient": true,
    "colors": ["#4F46E5", "#10B981"]
  }
}
```

### Frontend render chart

- `DynamicChart.tsx` nhận `chartConfig` + data → render chart tương ứng bằng Recharts
- Fallback auto-detect: nếu LLM không trả chart config → scan cột số/text → tự chọn chart type

## Frontend

### Tech Stack

- **Framework:** Next.js 15 + React 19 + TypeScript
- **CSS:** Tailwind CSS 4 + @tailwindcss/typography
- **Charting:** Recharts 3.8+
- **Animation:** Framer Motion 12.38+
- **Markdown:** react-markdown + remark-gfm
- **Icons:** Lucide React

### Tổ chức components

| Folder | Chức năng |
|--------|-----------|
| `chat/blocks/` | Structured content: StatCard, AnalysisTable, Heading, BlockRenderer |
| `chat/sections/` | Các phần trong message: UserBubble, ProgressTimeline, SQL, Table, Token, ActionButtons, FollowUp, LlmPayload, ReferenceData |
| `chat/shared/` | Components dùng chung: CollapsibleBox, StreamingText |
| `chat/layout/` | Chrome/layout: ChatHeader, ChatInput |
| `chat/` (root) | MessageBubble.tsx, DynamicChart.tsx, MarkdownTableRenderer.tsx |
| `sidebar/` | FeedRail.tsx — lịch sử chat + navigation |
| `workspace/layout/` | TopBar.tsx — thanh trên cùng |
| `workspace/pages/` | AnalysisPage.tsx — main page layout |

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
[4s]  data: columns + rows          → Frontend hiện bảng ngay
[5s]  additional_data: (nếu cần)    → Agentic bổ sung data
[6s]  reply: phân tích + chart      → Frontend hiện chart + streaming text
[7s]  suggestions: câu hỏi gợi ý   → Frontend hiện follow-up
[8s]  timing: performance metrics
[8s]  done: tổng token cost
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
| `openai` | Gọi LLM API + Embedding API (OpenAI/OpenRouter compatible) |

### Frontend (package.json)

| Package | Vai trò |
|---------|---------|
| `next` 15 | React framework |
| `react` 19 | UI library |
| `typescript` 5.7+ | Type safety |
| `tailwindcss` 4 | CSS framework |
| `@tailwindcss/typography` | Prose styling |
| `recharts` 3.8+ | Chart rendering |
| `framer-motion` 12.38+ | Animations |
| `react-markdown` | Markdown rendering |
| `remark-gfm` | GitHub Flavored Markdown |
| `lucide-react` | Icon library |

## Deployment

```bash
# Chạy cả 2 services cùng lúc
./start.sh

# Hoặc chạy riêng:
# Backend: FastAPI server (port 8333)
cd backend && python api.py --serve

# Frontend: Next.js dev server (port 3333)
cd frontend && npm run dev -- -p 3333
```

**Environment:**
- Backend: `.env` với LLM API keys + TiDB credentials
- Frontend: `.env.local` với `NEXT_PUBLIC_API_URL` (mặc định `/api`), `NEXT_PUBLIC_BACKEND_URL` (mặc định `http://localhost:8333`)

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
   Dùng cho khối "Tín hiệu".
   Field mỗi item:
   - `title`
   - `copy`
   - `severity`: `high | medium | low`
   - `badge`
   - `prompt`

4. `proposal_list`
   Dùng cho khối "Phân tích đề xuất".
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
   Dùng cho cột phải "Tóm tắt nhanh".
   Field mỗi item:
   - `title`
   - `note`

3. `followup_list`
   Dùng cho khối "Câu hỏi nên hỏi tiếp".
   Field mỗi item:
   - `label`
   - `prompt`

4. `working_set`
   Dùng cho khối "Working set hiện tại".
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
- Frontend không tự dựng sẵn "Nguyên nhân gốc", "Hành động đề xuất", "Vinamilk" nếu backend không trả.
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
   Dùng cho "Không gian dữ liệu".
   Field mỗi item:
   - `title`
   - `description`
   - `badge`
   - `tone`
   - `prompt`

3. `recent_analysis_list`
   Dùng cho "Phân tích gần đây".
   Field mỗi item:
   - `title`
   - `summary`
   - `tag`
   - `time_label`
   - `prompt`

4. `source_health`
   Dùng cho "Tình trạng đồng bộ dữ liệu".
   Field mỗi item:
   - `name`
   - `detail`
   - `status`
   - `state`: `ok | warning | error`
   - `updated_at`

5. `collection_list`
   Dùng cho "Lối tắt cho team điều hành".
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
