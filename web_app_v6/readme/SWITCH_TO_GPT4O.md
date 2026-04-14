# Chuyển Lambda từ Bedrock (Claude) sang OpenAI (GPT-4o)

Hướng dẫn thay đổi model AI từ Claude 3.5 Haiku (AWS Bedrock) sang GPT-4o (OpenAI) cho Lambda function `myClaude` đã có sẵn.

---

## Vấn đề gặp phải

- Lambda mặc định không có thư viện `openai` → cần tạo Lambda Layer
- Cài layer trên **macOS** → lỗi `No module named 'pydantic_core._pydantic_core'` vì binary không tương thích Linux
- Cài trên **CloudShell** (Python 3.9) cho Lambda **Python 3.10** → cũng lỗi tương tự

## Cách giải quyết đúng

Dùng **CloudShell** trên AWS Console, chỉ định đúng **platform** và **python version**:

```bash
rm -rf python openai-layer.zip
mkdir -p python
pip install --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.10 --target python openai
zip -r openai-layer.zip python/
```

---

## Các bước thực hiện trên AWS Console

### Bước 1: Tạo Lambda Layer (trong CloudShell)

1. Mở **CloudShell**: thanh đen trên cùng AWS Console → phía bên phải → icon hình `>_`
2. Chạy lệnh ở trên
3. Tải file zip về: **Actions** (góc trên bên phải cửa sổ CloudShell) → **Download file** → gõ `openai-layer.zip` → **Download**
4. Vào **Lambda** → menu bên trái → **Layers** → **Create layer**
5. Name: `openai-sdk`, upload file vừa tải, runtime: **Python 3.10** → **Create**

### Bước 2: Sửa code Lambda (function `myClaude`)

1. Vào **Lambda** → **Functions** → mở **myClaude**
2. Tab **Code** → xóa code cũ → paste code mới → nhấn **Deploy**

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

### Bước 3: Gắn Layer vào function

1. Vẫn trong **myClaude** → kéo xuống **cuối trang** → phần **Layers** → nhấn **Edit**
2. **Add a layer** → **Custom layers** → chọn **openai-sdk** → chọn version mới nhất → **Add**
3. Nhấn **Save**

### Bước 4: Thêm Environment Variable

1. Tab **Configuration** → **Environment variables** → **Edit** → **Add environment variable**
2. Key: `OPENAI_API_KEY`, Value: API key từ platform.openai.com
3. Nhấn **Save**

### Bước 5: Tăng Timeout

1. Tab **Configuration** → **General configuration** → **Edit**
2. Timeout: **0 min 30 sec**
3. Nhấn **Save**

---

## Lưu ý quan trọng

- Frontend **không cần thay đổi gì** — API request/response format giữ nguyên (`{ message }` → `{ reply }`)
- Không cần push code lên GitHub, không cần redeploy Amplify
- Không cần thay đổi API Gateway
- Chỉ cần thao tác trên AWS Console
