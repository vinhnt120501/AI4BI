#!/usr/bin/env python3
"""
Test Agentic Loop với MOCK DATA (không cần DB)
"""
import sys
sys.path.insert(0, 'backend')

import json
import os
os.environ['AGENTIC_ENABLED'] = '1'

from llm import (
    stream_agentic_evaluate,
    stream_reply,
    stream_comprehensive_qa
)

def print_section(title):
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")

def main():
    question = "doanh thu các cửa hàng tại Hà Nội tháng 2 2026"

    # Mock schema
    schema = """
Tables:
- view_genie_shop: shop_code, province_name, district_name, ward_name
- view_genie_vaccine_sales_order_detail: shop_code, order_completion_date, line_item_amount_after_discount

Relationship: view_genie_shop.shop_code = view_genie_vaccine_sales_order_detail.shop_code
"""

    # Mock data - Kết quả query tháng 2/2026
    mock_columns = ["shop_code", "province_name", "district_name", "ward_name", "total_revenue_feb_2026"]
    mock_rows = [
        ["SHOP001", "Hà Nội", "Hoàn Kiếm", "Phường Cửa Đông", 500000000],
        ["SHOP002", "Hà Nội", "Hoàn Kiếm", "Phường Tràng Tiền", 450000000],
        ["SHOP003", "Hà Nội", "Đống Đa", "Phường Quốc Tử Giám", 380000000],
        ["SHOP004", "Hà Nội", "Hai Bà Trưng", "Phường Trần Khát Chân", 320000000],
        ["SHOP005", "Hà Nội", "Tây Hồ", "Phường Quảng An", 290000000],
        ["SHOP006", "Hà Nội", "Cầu Giấy", "Phường Dịch Vọng", 250000000],
        ["SHOP007", "Hà Nội", "Thanh Xuân", "Phường Khương Mai", 220000000],
        ["SHOP008", "Hà Nội", "Hoàng Mai", "Phường Giáp Bát", 180000000],
    ]

    print_section("BƯỚC 1: SQL GENERATOR - Mock data")
    print(f"Câu hỏi: {question}")
    print(f"\nMock data (8 cửa hàng Hà Nội tháng 2/2026):")
    for row in mock_rows[:3]:
        print(f"  {row[0]} - {row[2]}: {row[4]:,.0f} VND")
    print(f"  ...")

    all_data = [{
        "sql": "SELECT ... FROM ... WHERE province_name='Hà Nội' AND date='2026-02'",
        "columns": mock_columns,
        "rows": mock_rows
    }]

    print_section("BƯỚC 2: DATA GATE - Agentic đánh giá data có đủ không?")

    additional_data = []
    for chunk in stream_agentic_evaluate(
        question=question,
        columns=mock_columns,
        rows=mock_rows,
        schema_context=schema,
        memory_context=""
    ):
        if chunk['type'] == 'thinking':
            print(f"🤔 {chunk['content'][:150]}...")
        elif chunk['type'] == 'final':
            result = chunk['result']
            print(f"\n📊 Decision: {'✅ ĐỦ' if result['sufficient'] else '❌ THIẾU'}")
            if not result['sufficient']:
                print(f"Lý do: {result['reason']}")
                print(f"\nAdditional SQL:\n{result['additional_sql']}\n")

                # Mock additional data (tháng 1/2026 để so sánh MoM)
                print("📈 Mock thêm data tháng 1/2026 để so sánh MoM...")
                additional_data.append({
                    "sql": result['additional_sql'],
                    "columns": ["shop_code", "total_revenue_jan_2026"],
                    "rows": [
                        ["SHOP001", 420000000],
                        ["SHOP002", 380000000],
                        ["SHOP003", 350000000],
                        ["SHOP004", 300000000],
                        ["SHOP005", 270000000],
                    ]
                })
                print("✅ Got thêm 5 rows (tháng 1/2026)")
                all_data.extend(additional_data)
            else:
                print("✅ Data đã đủ, tiến sang visualization")

    print_section("BƯỚC 3: VISUALIZATION GENERATOR - Tạo Dashboard")

    vis_blocks = []
    analysis_text = ""

    print("Generating visualization & analysis...\n")

    for chunk in stream_reply(
        question=question,
        columns=mock_columns,
        rows=mock_rows,
        additional_data=additional_data if additional_data else None
    ):
        if chunk['type'] == 'thinking':
            print(f"🤔 {chunk['content'][:150]}...")
        elif chunk['type'] == 'early_chart':
            chart_type = chunk.get('chart_config', {}).get('type', 'unknown')
            print(f"📊 Early chart: {chart_type}")
        elif chunk['type'] == 'text':
            print(chunk['content'], end='', flush=True)
            analysis_text += chunk['content']
        elif chunk['type'] == 'final':
            vis_blocks = chunk['blocks']
            analysis_text = chunk['reply']
            print(f"\n\n✅ Dashboard created:")
            print(f"   - Total blocks: {len(vis_blocks)}")
            for btype in ['stat_cards', 'chart', 'table', 'heading', 'text']:
                count = len([b for b in vis_blocks if b.get('type') == btype])
                if count > 0:
                    print(f"   - {btype}: {count}")

    print_section("BƯỚC CUỐI: COMPREHENSIVE QA - Final check trước khi deliver")

    for chunk in stream_comprehensive_qa(
        question=question,
        all_data=all_data,
        vis_config=vis_blocks,
        analysis_text=analysis_text,
        schema_context=schema,
        memory_context=""
    ):
        if chunk['type'] == 'thinking':
            print(f"🤔 {chunk['content'][:200]}...")
        elif chunk['type'] == 'final':
            result = chunk['result']
            decision = result['overall_decision']
            confidence = result['confidence']

            if decision == 'PASS':
                print(f"\n✅✅✅ PASS - Output đã tốt!")
                print(f"Confidence: {confidence:.0%}")
                print("\n🎉 Output sẵn sàng deliver cho người dùng!")
            elif decision == 'NEEDS_IMPROVEMENT':
                print(f"\n⚠️  NEEDS_IMPROVEMENT - Cần fix trước khi deliver")
                print(f"Confidence: {confidence:.0%}")
                print(f"\nIssues ({len(result['issues'])}):")
                for i, issue in enumerate(result['issues'], 1):
                    print(f"\n  {i}. [{issue['area'].upper()}] ({issue['severity']})")
                    print(f"     Vấn đề: {issue['what']}")
                    print(f"     Hành động: {issue['action']}")
                    print(f"     Cách fix: {issue['how_to_fix'][:150]}...")
            else:  # CRITICAL_ISSUE
                print(f"\n🚨 CRITICAL_ISSUE - Block output!")
                print(f"Confidence: {confidence:.0%}")
                print(f"\nCritical issues:")
                for issue in result['issues']:
                    print(f"  - {issue['what']}")
                    print(f"    Fix: {issue['how_to_fix']}")

    print_section("TÓM TẮT AGENTIC LOOP")
    print("1️⃣  SQL Generator → Query data")
    print("2️⃣  Data Gate (Agentic) → Đánh giá & query thêm nếu cần")
    print("3️⃣  Visualization → Tạo dashboard + analysis")
    print("4️⃣  Final QA → Check chất lượng trước khi deliver")
    print("\n✅ Pipeline hoàn tất!")

if __name__ == "__main__":
    main()
