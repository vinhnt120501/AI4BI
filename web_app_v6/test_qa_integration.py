#!/usr/bin/env python3
"""
Simple test để verify COMPREHENSIVE_QA integration
"""
import requests
import json
import time

def test_agentic_loop():
    url = "http://localhost:8333/chat"
    payload = {
        "message": "doanh thu các cửa hàng tại Hà Nội tháng 2 2026",
        "stream": True
    }

    print("🚀 Testing Agentic Loop with COMPREHENSIVE_QA")
    print(f"Question: {payload['message']}\n")

    steps_seen = []
    qa_events = []

    try:
        with requests.post(url, json=payload, stream=True, timeout=120) as response:
            print(f"✅ Connected! Status: {response.status_code}\n")

            for line in response.iter_lines():
                if not line:
                    continue

                line = line.decode('utf-8')

                # Parse SSE format
                if line.startswith('event:'):
                    event_type = line.split(':', 1)[1].strip()
                elif line.startswith('data:'):
                    data = json.loads(line.split(':', 1)[1].strip())

                    # Track status steps
                    if event_type == 'status' and 'step' in data:
                        step = data['step']
                        text = data.get('text', '')
                        if step not in steps_seen:
                            steps_seen.append(step)
                            print(f"📍 Step {step}: {text}")

                    # Track QA events
                    if event_type == 'qa_result':
                        qa_events.append(data)
                        decision = data.get('decision', 'UNKNOWN')
                        confidence = data.get('confidence', 0)
                        issues = data.get('issues_count', 0)

                        print(f"\n{'='*60}")
                        print(f"  COMPREHENSIVE QA RESULT")
                        print(f"{'='*60}")
                        print(f"Decision: {decision}")
                        print(f"Confidence: {confidence:.1%}")
                        print(f"Issues found: {issues}")
                        print(f"{'='*60}\n")

                    # Track thinking for QA stage
                    if event_type == 'thinking' and data.get('stage') == 'qa':
                        thinking = data.get('thinking', '')[:100]
                        print(f"🤔 QA Thinking: {thinking}...")

                    # Stop after we got QA result
                    if qa_events and len(steps_seen) >= 4:
                        print("\n✅ Test completed successfully!")
                        break

        print(f"\n📊 Summary:")
        print(f"  Steps executed: {steps_seen}")
        print(f"  QA evaluations: {len(qa_events)}")

        if 4 in steps_seen:
            print(f"\n🎉 COMPREHENSIVE_QA integration verified!")
            return True
        else:
            print(f"\n⚠️  Step 4 (QA) not found in pipeline")
            return False

    except requests.exceptions.Timeout:
        print("❌ Request timed out")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    success = test_agentic_loop()
    exit(0 if success else 1)
