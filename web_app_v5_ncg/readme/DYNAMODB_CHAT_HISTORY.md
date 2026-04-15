# Lưu lịch sử chat vào DynamoDB

## Tổng quan

```
User gửi tin nhắn → Frontend kèm sessionId → Lambda lưu vào DynamoDB → gọi GPT-4o → lưu reply vào DynamoDB → trả về Frontend
```

---

## Bước 1: Tạo bảng DynamoDB

1. AWS Console → **DynamoDB** → **Create table**
2. Điền thông tin:

| Field | Value | Type |
|-------|-------|------|
| Table name | `ChatHistory` | - |
| Partition key | `sessionId` | **String** |
| Sort key | `timestamp` | **Number** |

3. Giữ mặc định → nhấn **Create table**

> **Lưu ý quan trọng:** Các cột khác như `role`, `content` **không cần khai báo** — DynamoDB tự tạo khi Lambda ghi data vào. Chỉ cần khai báo Partition key và Sort key.

---

## Bước 2: Cấp quyền DynamoDB cho Lambda

1. Lambda → function `myClaude` → tab **Configuration** → **Permissions**
2. Nhấn vào **Role name** (link xanh) → mở IAM Console
3. **Add permissions** → **Attach policies** → tìm `AmazonDynamoDBFullAccess` → tick chọn → **Add permissions**

---

## Bước 3: Sửa code Lambda

Paste code mới vào Lambda `myClaude` → nhấn **Deploy**:

```python
import json
import time
import boto3
from openai import OpenAI

client = OpenAI()
dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
table = dynamodb.Table("ChatHistory")


def lambda_handler(event, context):
    raw_path = event.get("rawPath", "/chat")
    body = json.loads(event.get("body", "{}"))

    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    }

    # POST /history — Lấy lịch sử chat
    if raw_path == "/history":
        session_id = body.get("sessionId", "")
        if not session_id:
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "Missing sessionId"})}

        result = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("sessionId").eq(session_id),
            ScanIndexForward=True
        )

        messages = [
            {"role": item["role"], "content": item["content"]}
            for item in result.get("Items", [])
        ]

        return {"statusCode": 200, "headers": headers, "body": json.dumps({"messages": messages})}

    # POST /chat — Gửi tin nhắn + lưu vào DynamoDB
    user_message = body.get("message", "Hello!")
    session_id = body.get("sessionId", "default")

    # Lưu tin nhắn user
    table.put_item(Item={
        "sessionId": session_id,
        "timestamp": int(time.time() * 1000),
        "role": "user",
        "content": user_message
    })

    response = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=512,
        messages=[
            {"role": "user", "content": user_message}
        ]
    )

    reply = response.choices[0].message.content

    # Lưu tin nhắn assistant
    table.put_item(Item={
        "sessionId": session_id,
        "timestamp": int(time.time() * 1000) + 1,
        "role": "assistant",
        "content": reply
    })

    return {
        "statusCode": 200,
        "headers": headers,
        "body": json.dumps({"reply": reply})
    }
```

---

## Bước 4: Thêm route /history trong API Gateway

1. API Gateway → chọn `Web-API` → **Routes** → **Create**
2. Method: `POST`, Path: `/history`
3. Gắn integration → chọn Lambda `myClaude`

---

## Bước 5: Sửa Frontend

Frontend chỉ cần 2 thay đổi:

1. **Tạo sessionId** — dùng `crypto.randomUUID()`, lưu vào `localStorage`
2. **Gửi sessionId kèm tin nhắn** — thêm `sessionId` vào body request

```typescript
// Tạo sessionId (trong useEffect)
let id = localStorage.getItem('sessionId');
if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('sessionId', id);
}

// Gửi kèm sessionId
body: JSON.stringify({ message: inputValue, sessionId })
```

---

## Xem data trong DynamoDB

DynamoDB → **Tables** → **ChatHistory** → tab **Explore table items**

---

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách fix |
|-----|-------------|----------|
| `Type mismatch for key timestamp expected: S actual: N` | Tạo bảng với `timestamp` kiểu String nhưng code gửi Number | Xóa bảng → tạo lại với `timestamp` kiểu **Number** |
| `Type mismatch for key sessionId expected: S actual: N` | Tạo bảng với `sessionId` kiểu Number | Xóa bảng → tạo lại với `sessionId` kiểu **String** |
| `AccessDeniedException` | Lambda chưa có quyền DynamoDB | Thêm policy `AmazonDynamoDBFullAccess` vào IAM Role |
| `ResourceNotFoundException` | Tên bảng trong code không khớp với DynamoDB | Kiểm tra tên bảng trong code: `dynamodb.Table("ChatHistory")` |

> **Kinh nghiệm:** DynamoDB khác SQL — chỉ khai báo key khi tạo bảng, các cột khác tự tạo khi ghi data. Phải đảm bảo **type của key trong bảng khớp với type trong code** (String vs Number), nếu không sẽ bị lỗi `Type mismatch`.
