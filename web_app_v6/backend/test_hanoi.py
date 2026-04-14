import json
import time
import requests

BASE_URL = "http://localhost:8333"
question = "Doanh thu tại Hà Nội tháng 2 2026"

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

        # Print key events
        if event_type == "status":
            print(f"[{elapsed:5.1f}s] {event_type}: {data.get('text', '')}")
        elif event_type == "reply":
            blocks = data.get("blocks", [])
            print(f"[{elapsed:5.1f}s] {event_type}: {len(blocks)} blocks")
        elif event_type in ("done", "suggestions"):
            print(f"[{elapsed:5.1f}s] {event_type}")

        event_type = ""
        data_buf = ""

total = round(time.time() - t0, 1)

# Analyze final result
print(f"\n{'='*80}")
print(f"ANALYSIS - Total: {len(events)} events, {total}s")
print(f"{'='*80}\n")

# Get final reply
final_reply = None
for event in reversed(events):
    if event['event'] == 'reply' and event['data'].get('blocks'):
        final_reply = event['data']
        break

if final_reply:
    blocks = final_reply.get('blocks', [])
    print(f"Total blocks: {len(blocks)}\n")
    
    # Count by type
    from collections import Counter
    block_types = [b.get('type', 'unknown') for b in blocks]
    print("Block types:")
    for bt, count in Counter(block_types).most_common():
        print(f"  {bt}: {count}")
    
    # Show charts
    charts = [b for b in blocks if b.get('type') == 'chart']
    print(f"\nCharts: {len(charts)}")
    for i, chart in enumerate(charts):
        print(f"\nChart {i+1}:")
        print(f"  Type: {chart.get('chartType', 'N/A')}")
        print(f"  Title: {chart.get('title', 'N/A')}")
        print(f"  Purpose: {chart.get('purpose', 'N/A')}")
        print(f"  Data rows: {len(chart.get('data', []))}")
    
    # Show stat cards
    stat_cards = [b for b in blocks if b.get('type') == 'stat_cards']
    print(f"\nStat Cards: {len(stat_cards)}")
    if stat_cards:
        cards = stat_cards[0].get('cards', [])
        print(f"  Total cards: {len(cards)}")
        for card in cards:
            print(f"    - {card.get('label', 'N/A')}: {card.get('value', 'N/A')}")
    
    # Show text blocks
    texts = [b for b in blocks if b.get('type') == 'text']
    print(f"\nText blocks: {len(texts)}")
    for i, text in enumerate(texts):
        content = text.get('content', '')
        print(f"\nText {i+1} ({len(content)} chars):")
        print(f"  {content[:300]}...")
        if len(content) > 300:
            print(f"  ... (truncated, total {len(content)} chars)")
            
    # Show full text analysis
    print(f"\n{'='*80}")
    print("FULL TEXT ANALYSIS")
    print(f"{'='*80}\n")
    
    for i, text in enumerate(texts):
        content = text.get('content', '')
        print(f"--- Text Block {i+1} ---\n{content}\n")

with open("test_hanoi_result.json", "w", encoding="utf-8") as f:
    json.dump({"question": question, "events": events}, f, ensure_ascii=False, indent=2)

print(f"\nKết quả đã lưu vào: test_hanoi_result.json")
