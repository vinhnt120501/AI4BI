"""
Test API: gửi câu hỏi, lưu toàn bộ kết quả LLM xử lý ra file JSON.

    python test_api.py
"""

import json
import time
import requests

BASE_URL = "http://localhost:8005"
OUTPUT_FILE = "test_result.json"

question = input("\nNhập câu hỏi: ").strip()
if not question:
    question = "Top 5 tỉnh có doanh thu cao nhất"
    print(f"(Dùng mặc định: \"{question}\")")

print(f"\nĐang gửi đến {BASE_URL}/chat ...")

t0 = time.time()
resp = requests.post(
    f"{BASE_URL}/chat",
    json={"message": question, "sessionId": "test", "userId": "test_user"},
    stream=True,
    timeout=600,
)

all_events = []
event_type = ""
data_buf = ""

for line in resp.iter_lines(decode_unicode=True):
    if line is None:
        continue
    if line.startswith("event: "):
        event_type = line[7:].strip()
    elif line.startswith("data: "):
        data_buf = line[6:]
    elif line == "" and event_type and data_buf:
        elapsed = round(time.time() - t0, 1)
        data = json.loads(data_buf)
        all_events.append({"event": event_type, "time": f"{elapsed}s", "data": data})
        print(f"  [{elapsed:5.1f}s]  {event_type}")
        event_type = ""
        data_buf = ""

total = round(time.time() - t0, 1)

output = {
    "question": question,
    "total_events": len(all_events),
    "total_time": f"{total}s",
    "events": all_events,
}

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"\nXong! {len(all_events)} events, {total}s")
print(f"Kết quả đã lưu vào: {OUTPUT_FILE}")
