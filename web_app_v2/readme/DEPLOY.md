# Deploy Ứng Dụng Chat AI Lên AWS

## Tổng Quan Kiến Trúc

```
User → Amplify Hosting (Frontend) → API Gateway (POST /chat) → Lambda → OpenAI (GPT-4o) → Response
```

### AWS Services Sử Dụng

| Service | Vai trò |
|---------|---------|
| **AWS Amplify Hosting** | Host frontend Next.js, tự động CI/CD từ GitHub |
| **API Gateway (HTTP API)** | Expose Lambda thành REST API endpoint |
| **AWS Lambda** | Chạy code Python gọi OpenAI API |
| **OpenAI API** | Gọi model GPT-4o để sinh phản hồi AI |

---

## Pipeline Setup Từng Service

```
Step 1: OpenAI Key       Step 2: Lambda            Step 3: API Gateway       Step 4: Frontend          Step 5: Amplify
───────────────          ──────────────────        ─────────────────────    ──────────────────      ──────────────────
│ Lấy API Key  │   →    │ Tạo function    │  →    │ Tạo HTTP API      │ →  │ Sửa code gọi    │  →    │ Push GitHub     │
│ từ OpenAI    │        │ Viết code       │       │ Tạo route POST    │    │ API thật        │       │ Tạo app Amplify │
│ Platform     │        │ Thêm Layer      │       │ /chat             │    │ Thêm streaming  │       │ Set env var     │
│              │        │ openai          │       │ Bật CORS          │    │ Fix bug IME     │       │ Deploy          │
│              │        │ Set env var     │       │ Lấy Invoke URL    │    │                 │       │                 │
└──────────────┘        └──────────────── ┘       └───────────────────┘    └─────────────────┘       └─────────────────┘
```

### Thứ Tự Setup (Quan Trọng)

| Step | Service | Việc cần làm | Phụ thuộc |
|------|---------|-------------|-----------|
| 1 | **OpenAI** | Lấy API Key từ platform.openai.com | Không |
| 2 | **Lambda** | Tạo function + viết code + thêm openai layer + set env var | Có API Key |
| 3 | **API Gateway** | Tạo HTTP API + route + CORS | Lambda đã tạo |
| 4 | **Frontend** | Sửa code gọi API Gateway URL | Có Invoke URL từ API Gateway |
| 5 | **Amplify** | Push code + tạo app + set env var + deploy | Code đã push + có Invoke URL |

### Luồng Dữ Liệu Khi User Gửi Tin Nhắn

```
1. User gõ "Xin chào" → nhấn Enter
          │
          ▼
2. Frontend (Amplify) gửi POST request
   fetch("https://xxx.execute-api.us-east-1.amazonaws.com/chat", {
       body: { "message": "Xin chào" }
   })
          │
          ▼
3. API Gateway nhận request → chuyển đến Lambda
          │
          ▼
4. Lambda parse body → gọi OpenAI API
   openai.chat.completions.create({
       model: "gpt-4o",
       messages: [{ role: "user", content: "Xin chào" }]
   })
          │
          ▼
5. OpenAI (GPT-4o) sinh phản hồi → trả về Lambda
   { "choices": [{ "message": { "content": "Xin chào! Bạn khỏe không?" } }] }
          │
          ▼
6. Lambda trả JSON response → qua API Gateway → về Frontend
   { "statusCode": 200, "body": { "reply": "Xin chào! Bạn khỏe không?" } }
          │
          ▼
7. Frontend nhận response → hiển thị streaming từng ký tự
   X → Xi → Xin → Xin  → Xin c → ... → Xin chào! Bạn khỏe không?
```

---

## Phần 1: Lambda Function

### 1.1. Lấy OpenAI API Key

1. Vào **platform.openai.com** → đăng nhập
2. Vào **API keys** → **Create new secret key**
3. Copy API key (dạng `sk-...`), lưu lại để dùng ở bước 1.4

### 1.2. Sửa Code Lambda (function `myClaude` đã có)

1. Vào **AWS Console** → **Lambda** → mở function `myClaude`
2. Tab **Code** → xóa code cũ → paste code mới bên dưới:

### 1.3. Code Lambda

```python
import json
from openai import OpenAI

client = OpenAI()


def lambda_handler(event, context):
    body = json.loads(event.get("body", "{}"))
    user_message = body.get("message", "Hello!")

    response = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=512,
        messages=[
            {"role": "user", "content": user_message}
        ]
    )

    reply = response.choices[0].message.content

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps({"reply": reply})
    }
```

### 1.4. Thêm Environment Variable

1. Vào **Lambda Console** → mở function `myClaude`
2. Tab **Configuration** → **Environment variables**
3. Nhấn **Edit** → **Add environment variable**

| Key | Value |
|-----|-------|
| `OPENAI_API_KEY` | `sk-xxxxxxxxxxxxxxxx` (API key từ bước 1.1) |

4. Nhấn **Save**

### 1.5. Thêm Lambda Layer (openai SDK)

Lambda mặc định không có thư viện `openai`. Cần tạo Layer.

**⚠️ QUAN TRỌNG:** Phải tạo layer trên **CloudShell** (Linux) và chỉ định đúng platform + python version. Nếu tạo trên macOS sẽ bị lỗi `pydantic_core`.

**Mở CloudShell:** thanh đen trên cùng AWS Console → phía bên phải → icon hình `>_` → nhấn vào

**Chạy lệnh trong CloudShell:**

```bash
rm -rf python openai-layer.zip
mkdir -p python
pip install --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.10 --target python openai
zip -r openai-layer.zip python/
```

**Tải file zip về máy:** CloudShell → góc trên bên phải cửa sổ CloudShell → **Actions** → **Download file** → gõ `openai-layer.zip` → **Download**

**Tạo Layer trên AWS Console:**

1. Vào **Lambda** → menu bên trái → **Layers** (nằm dưới Functions) → **Create layer**
2. **Name**: `openai-sdk`
3. Upload file `openai-layer.zip` vừa tải
4. **Compatible runtimes**: chọn `Python 3.10`
5. Nhấn **Create**

**Gắn Layer vào Lambda:**

1. Mở function `myClaude` → tab **Code** → kéo xuống **cuối trang** → phần **Layers**
2. Nhấn **Edit** → **Add a layer**
3. Chọn **Custom layers** → dropdown chọn `openai-sdk` → version mới nhất → nhấn **Add**
4. Nhấn **Save**

### 1.6. Tăng Timeout Lambda

OpenAI API có thể mất vài giây để phản hồi:

1. Tab **Configuration** → **General configuration** → **Edit**
2. **Timeout**: đổi thành `30` giây (mặc định chỉ 3 giây)
3. Nhấn **Save**

---

## Phần 2: API Gateway

### 2.1. Tạo HTTP API

1. Vào **AWS Console** → **API Gateway**
2. Nhấn **Create API** → tìm **HTTP API** → nhấn **Build**

### 2.2. Step 1 - Configure API

1. Nhấn **Add integration** → chọn **Lambda**
2. **Lambda function**: chọn `myClaude`
3. **API name**: gõ `Web-API`
4. Nhấn **Next**

### 2.3. Step 2 - Configure Routes

1. **Method**: chọn `POST`
2. **Resource path**: gõ `/chat`
3. Nhấn **Next**

### 2.4. Step 3 - Define Stages

1. Giữ nguyên `$default` (Auto-deploy đã bật sẵn)
2. Nhấn **Next**

### 2.5. Step 4 - Review and Create

1. Kiểm tra lại thông tin
2. Nhấn **Create**

### 2.6. Lấy Invoke URL

1. Sau khi tạo xong, vào **Deploy** → **Stages** (menu bên trái)
2. Nhấn vào **$default**
3. Copy **Invoke URL**, dạng: `https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com`

### 2.7. Bật CORS

1. Menu bên trái → nhấn **CORS**
2. Điền các giá trị:

| Field | Giá trị |
|-------|---------|
| **Access-Control-Allow-Origin** | `*` |
| **Access-Control-Allow-Methods** | `POST` |
| **Access-Control-Allow-Headers** | `content-type` |

3. Nhấn **Add** sau mỗi giá trị, rồi nhấn **Save**

### 2.8. Test API

```bash
curl -X POST https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Xin chào"}'
```

Kết quả mong đợi:
```json
{"reply": "Xin chào! Bạn khỏe không? Hôm nay tôi có thể giúp gì cho bạn?"}
```

---

## Phần 3: Frontend - Kết Nối API

### 3.1. Code Frontend Gọi API (page.tsx)

Phần `handleSend` gọi API Gateway thay vì mock data:

```typescript
const handleSend = async () => {
    if (inputValue.trim() === '') return;

    // Tạo tin nhắn user
    const newUserMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: inputValue,
    };
    setMessages((prev) => [...prev, newUserMsg]);
    setInputValue('');
    setIsTyping(true);

    // Gọi API Gateway → Lambda → OpenAI
    const aiMsgId = (Date.now() + 1).toString();
    try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: inputValue }),
        });
        const data = await res.json();
        const fullText = data.reply as string;

        // Streaming effect — hiển thị từng ký tự
        const aiMsg: Message = { id: aiMsgId, role: 'assistant', content: '' };
        setMessages((prev) => [...prev, aiMsg]);
        setIsTyping(false);

        for (let i = 1; i <= fullText.length; i++) {
            await new Promise((r) => setTimeout(r, 15));
            const partial = fullText.slice(0, i);
            setMessages((prev) =>
                prev.map((m) => m.id === aiMsgId ? { ...m, content: partial } : m)
            );
        }
    } catch {
        const errorMsg: Message = {
            id: aiMsgId,
            role: 'assistant',
            content: 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.',
        };
        setMessages((prev) => [...prev, errorMsg]);
        setIsTyping(false);
    }
};
```

### 3.2. Fix Bug IME Tiếng Việt (ChatInput.tsx)

Khi gõ tiếng Việt, Enter có thể bị bắn 2 lần (1 cho IME, 1 cho gửi). Fix bằng `isComposing`:

```typescript
onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSend(); }}
```

---

## Phần 4: Amplify Hosting

### 4.1. Push Code Lên GitHub

```bash
cd frontend
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<username>/<repo-name>.git
git branch -M main
git push -u origin main
```

### 4.2. Tạo App Trên Amplify

1. Vào **AWS Console** → **AWS Amplify**
2. Nhấn **Create new app**
3. Chọn **GitHub** → authorize → chọn repo
4. Amplify tự detect Next.js

### 4.3. Build Settings

Nếu repo chỉ chứa code frontend (không có monorepo), dùng build spec mặc định:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

Nếu frontend nằm trong thư mục con (monorepo), thêm `appRoot`:

```yaml
version: 1
applications:
  - appRoot: web_app/frontend
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - .next/cache/**/*
```

### 4.4. Thêm Environment Variable

1. Vào **Amplify Console** → chọn app
2. Menu bên trái → **Hosting** → **Environment variables**
3. Nhấn **Manage variables** → **Add variable**

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com` |

4. Nhấn **Save**
5. Vào branch **main** → **Redeploy this version**

### 4.5. Kết Quả

Sau khi build xong, Amplify cấp URL dạng:
```
https://main.xxxxxxxxxx.amplifyapp.com
```

Mỗi lần push code lên GitHub, Amplify tự động build và deploy lại (CI/CD).

---

## Các Lỗi Thường Gặp

| Lỗi | Nguyên nhân | Cách fix |
|-----|-------------|----------|
| `Build path does not exist` | Amplify không tìm thấy thư mục code | Kiểm tra `appRoot` trong build spec, hoặc bỏ nếu repo là frontend thuần |
| `Module not found: framer-motion` | Thiếu dependency | `npm install framer-motion` rồi push lại |
| `No module named 'openai'` (CloudWatch) | Lambda chưa có Layer openai | Tạo và gắn Lambda Layer chứa openai SDK (xem bước 1.5) |
| `No module named 'pydantic_core._pydantic_core'` | Layer tạo trên macOS hoặc sai Python version | Tạo lại layer trên CloudShell với đúng platform và python version (xem bước 1.5) |
| `AuthenticationError` (CloudWatch) | Sai hoặc thiếu OpenAI API Key | Kiểm tra env var `OPENAI_API_KEY` trong Lambda Configuration |
| `Task timed out` (CloudWatch) | Lambda timeout quá ngắn | Tăng timeout lên 30 giây (xem bước 1.6) |
| `Internal Server Error` từ API Gateway | Lambda bị lỗi runtime | Vào CloudWatch Logs xem chi tiết lỗi |
| Frontend hiện "Xin lỗi, đã có lỗi xảy ra" | API Gateway URL sai hoặc CORS chưa bật | Kiểm tra env var `NEXT_PUBLIC_API_URL` và CORS config |
| Gõ tiếng Việt gửi 2 tin nhắn | IME Enter event bị bắn 2 lần | Thêm `!e.nativeEvent.isComposing` vào onKeyDown |

---

## Chi Phí Ước Tính (Free Tier)

| Service | Free Tier |
|---------|-----------|
| **Amplify Hosting** | 1,000 phút build/tháng, 5GB hosting/tháng |
| **API Gateway** | 1 triệu request/tháng (12 tháng đầu) |
| **Lambda** | 1 triệu request/tháng, 400,000 GB-giây |
| **OpenAI API** | Tính theo token sử dụng (không có free tier, xem pricing tại openai.com) |
