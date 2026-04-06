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
