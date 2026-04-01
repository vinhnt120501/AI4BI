# AI4BI - Kiến trúc hệ thống

## Tổng quan Pipeline

```
User hỏi (tiếng Việt)
  → FastAPI (SSE streaming)
    → Gemini 2.5 Flash: text → SQL (có extended thinking)
      → TiDB/MySQL: chạy SQL lấy data
        → Gemini 2.5 Flash: phân tích data + chọn chart type
          → Frontend render chart bằng Recharts
```

## Cấu trúc dự án

```
web_app/
├── backend/
│   ├── api.py                  # FastAPI server + SSE streaming
│   ├── db.py                   # Kết nối TiDB/MySQL + thực thi SQL
│   ├── llm.py                  # Gemini API (sinh SQL + phân tích data)
│   └── .env                    # API keys, database credentials
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            # Trang chat chính (ChatPage)
│   │   │   ├── layout.tsx          # Root layout
│   │   │   └── globals.css         # Tailwind CSS
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── charts/             # Mỗi loại chart 1 file riêng
│   │   │   │   │   ├── utils.ts            # COLORS, buildChartData, resolveYKeys, formatters
│   │   │   │   │   ├── BarCharts.tsx       # bar, stacked_bar, horizontal_bar
│   │   │   │   │   ├── LineCharts.tsx      # line, area
│   │   │   │   │   ├── PieCharts.tsx       # pie, donut
│   │   │   │   │   ├── ScatterChart.tsx
│   │   │   │   │   ├── RadarChart.tsx
│   │   │   │   │   ├── TreemapChart.tsx
│   │   │   │   │   ├── FunnelChart.tsx
│   │   │   │   │   └── ComposedChart.tsx
│   │   │   │   ├── sections/           # Các phần hiển thị trong message
│   │   │   │   │   ├── UserBubble.tsx
│   │   │   │   │   ├── ThinkingSection.tsx
│   │   │   │   │   ├── SqlSection.tsx
│   │   │   │   │   ├── TableSection.tsx
│   │   │   │   │   ├── TokenSection.tsx
│   │   │   │   │   └── ActionButtons.tsx
│   │   │   │   ├── shared/             # Components dùng chung
│   │   │   │   │   ├── CollapsibleBox.tsx
│   │   │   │   │   └── StreamingText.tsx
│   │   │   │   ├── layout/             # Header + Input
│   │   │   │   │   ├── ChatHeader.tsx
│   │   │   │   │   └── ChatInput.tsx
│   │   │   │   ├── MessageBubble.tsx   # Orchestrator message
│   │   │   │   ├── ChartRenderer.tsx   # Orchestrator chart
│   │   │   │   └── index.ts           # Public exports
│   │   │   └── sidebar/
│   │   │       └── Sidebar.tsx         # Navigation sidebar
│   │   └── types/
│   │       └── types.ts            # TypeScript interfaces
│   └── package.json
└── start.sh                        # Script khởi động cả backend + frontend
```

## Backend

### 3 file chính

| File | Vai trò |
|------|---------|
| `api.py` | FastAPI server, endpoint `/chat` dùng **SSE streaming** gửi từng event về frontend |
| `llm.py` | Gọi Gemini API 2 lần: (1) sinh SQL, (2) phân tích data + tạo chart config |
| `db.py` | Kết nối TiDB, chạy SQL, lưu chat history |

### api.py - FastAPI + SSE

- **Endpoint chính:** `POST /chat` nhận `{ message, sessionId }`
- **Output:** Server-Sent Events stream với các event types:
  1. `status` - Trạng thái xử lý hiện tại
  2. `thinking` - Quá trình suy nghĩ của LLM
  3. `sql` - SQL đã sinh + token usage
  4. `data` - Columns + rows từ database
  5. `reply` - Phân tích + chart config
  6. `done` - Tổng token cost
  7. `error` - Lỗi nếu có
- Sau khi stream xong, lưu toàn bộ conversation vào bảng `chat_history`

### llm.py - Gemini API (2 giai đoạn)

**Giai đoạn 1: `text_to_sql()`**
- Model: `gemini-2.5-flash` với extended thinking (2048 tokens)
- Input: câu hỏi tiếng Việt + schema DB
- System prompt yêu cầu:
  - PHẢI trả về tất cả cột số (SUM, COUNT, %)
  - PHẢI dùng GROUP BY để ra nhiều dòng (không aggregate 1 dòng)
  - PHẢI dùng LIKE cho tìm kiếm text
  - PHẢI dùng self-join thay window function
  - Thêm LIMIT 20 + ORDER BY
- Nếu SQL lỗi → tự động retry kèm error message

**Giai đoạn 2: `generate_reply()`**
- Input: câu hỏi + columns + tối đa 50 rows
- Temperature: 0.3
- Output: markdown phân tích + chart config JSON

### db.py - Database

- **Database:** TiDB Cloud (MySQL compatible)
- **Các function chính:**
  - `get_schema_context()` → trả schema dạng `table(col1, col2, ...)` cho LLM
  - `execute_sql(sql)` → chạy query, trả `columns` + `rows`
  - `save_chat()` / `get_chat_history()` → lưu/đọc lịch sử chat

## Cách tự động vẽ Chart/Bảng biểu

### LLM quyết định loại chart

Trong system prompt của `generate_reply()`, LLM được hướng dẫn chọn 1 trong 12 loại chart:

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

**Orchestrator:** `ChartRenderer.tsx` nhận `chartConfig` + data → dispatch đến file chart tương ứng trong `charts/`.

**Các file chart riêng biệt:**
- `BarCharts.tsx` → bar, stacked_bar, horizontal_bar
- `LineCharts.tsx` → line, area
- `PieCharts.tsx` → pie, donut
- `ScatterChart.tsx`, `RadarChart.tsx`, `TreemapChart.tsx`, `FunnelChart.tsx`, `ComposedChart.tsx`

**Utilities (`charts/utils.ts`):**
- `buildChartData()` → convert string[][] thành object[] cho Recharts
- `resolveYKeys()` → ưu tiên AI config → fallback auto-detect cột số
- `formatYAxis()` → format 1B, 1.5M, 2.3K
- `formatTooltip()` → số có dấu phân cách hàng nghìn
- `shortenLabel()` → truncate label dài
- `COLORS` → palette 12 màu

**Fallback auto-detect (trong `MessageBubble.tsx`):**
- Nếu LLM không trả chart config → scan cột: số → yKey, text → xKey
- Auto chọn: `bar` (< 15 rows) hoặc `horizontal_bar` (>= 15 rows)

## Frontend

### Tech Stack

- **Framework:** Next.js 15 + React 19 + TypeScript
- **CSS:** Tailwind CSS 4.2
- **Charting:** Recharts 3.8.1
- **Animation:** Framer Motion 12.38
- **Markdown:** react-markdown 10.1

### Tổ chức components (`chat/`)

| Folder | Chức năng |
|--------|-----------|
| `charts/` | Mỗi loại chart 1 file + utils chung |
| `sections/` | Các phần trong message: UserBubble, Thinking, SQL, Table, Token, ActionButtons |
| `shared/` | Components dùng chung: CollapsibleBox, StreamingText |
| `layout/` | Chrome/layout: ChatHeader, ChatInput |
| root | Orchestrators: MessageBubble.tsx, ChartRenderer.tsx, index.ts |

### Luồng xử lý SSE (page.tsx)

1. User gửi câu hỏi → `handleSend()`
2. POST đến `/chat` với fetch + ReadableStream
3. Parse từng SSE event (`event: <type>\ndata: <JSON>\n\n`)
4. `updateMessage()` cập nhật UI theo từng event type
5. MessageBubble render ngay lập tức khi nhận data

### MessageBubble - 6 section

1. **Thinking** (CollapsibleBox, collapsed) - Quá trình suy nghĩ LLM
2. **SQL** (CollapsibleBox, collapsed) - SQL đã sinh + nút copy
3. **Table** (CollapsibleBox, collapsed) - Bảng data + badge số dòng
4. **Token Usage** (CollapsibleBox, collapsed) - Chi tiết token breakdown
5. **Chart** (ChartRenderer) - Biểu đồ interactive
6. **Reply** (StreamingText) - Phân tích markdown với typing animation

### StreamingText - Typing Animation

- Hiệu ứng gõ từng ký tự (12ms/char)
- Render markdown (headings, bold, lists, quotes)
- Con trỏ animated khi đang gõ

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

## Deployment

```bash
# start.sh khởi động cả 2:
# Backend: python api.py --serve (port 8001)
# Frontend: npm run dev (port 3000)
./start.sh
```

**Environment:**
- Backend: `.env` với Gemini API key + TiDB credentials
- Frontend: `NEXT_PUBLIC_API_URL` (mặc định `localhost:8001`)
