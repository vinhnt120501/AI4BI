"""
Test chat API: gửi câu hỏi, lưu toàn bộ SSE events ra file JSON.

Usage:
    python test_chat.py
    python test_chat.py "Doanh thu theo tháng năm 2025"
    python test_chat.py "Top 10 vaccine bán chạy nhất" output.json
"""

import json
import sys
import time
import requests

BASE_URL = "http://localhost:8333"

question = input("\nNhập câu hỏi: ").strip()
if not question:
    print("Chưa nhập câu hỏi.")
    sys.exit(1)

output_file = "test_result.json"

print(f"\nCâu hỏi: {question}")
print(f"Đang gửi đến {BASE_URL}/chat ...\n")

t0 = time.time()
resp = requests.post(
    f"{BASE_URL}/chat",
    json={"message": question, "sessionId": f"test-{int(time.time())}", "userId": "default_user"},
    stream=True,
    timeout=300,
)

events = []
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
        try:
            data = json.loads(data_buf)
        except json.JSONDecodeError:
            data = {"raw": data_buf}

        events.append({"event": event_type, "time": f"{elapsed}s", "data": data})

        # Print progress
        if event_type == "status":
            print(f"  [{elapsed:5.1f}s] {event_type}: {data.get('text', '')}")
        elif event_type == "reply":
            reply = data.get("reply", "")
            blocks = data.get("blocks", [])
            print(f"  [{elapsed:5.1f}s] {event_type}: {len(reply)} chars, {len(blocks)} blocks")
        elif event_type == "suggestions":
            print(f"  [{elapsed:5.1f}s] {event_type}: {data.get('questions', [])}")
        elif event_type in ("done", "error", "timing"):
            print(f"  [{elapsed:5.1f}s] {event_type}")
        else:
            print(f"  [{elapsed:5.1f}s] {event_type}")

        event_type = ""
        data_buf = ""

total = round(time.time() - t0, 1)

output = {
    "question": question,
    "total_events": len(events),
    "total_time": f"{total}s",
    "events": events,
}

with open(output_file, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"\nXong! {len(events)} events, {total}s")
print(f"Kết quả đã lưu vào: {output_file}")
