#!/usr/bin/env python3
"""
Test Agentic Loop: Data Gate → Visualization → Final QA
"""
import sys
sys.path.insert(0, 'backend')

import json
from llm import (
    text_to_sql,
    stream_agentic_evaluate,
    execute_agentic_step,
    stream_reply,
    stream_comprehensive_qa
)
from db import get_schema_context, execute_sql

def print_section(title):
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")

def main():
    question = "doanh thu các cửa hàng tại Hà Nội tháng 2 2026"

    print_section("BƯỚC 1: SQL GENERATOR - Tạo query đầu tiên")
    print(f"Câu hỏi: {question}\n")

    # Get schema
    schema = get_schema_context()
    print(f"Schema loaded: {len(schema)} chars\n")

    # Generate SQL
    sql_result = text_to_sql(question, schema)
    print(f"SQL Generated:\n{sql_result['sql']}\n")

    # Execute SQL
    print("Executing SQL...")
    data_result = execute_sql(sql_result['sql'])
    print(f"✅ Got {len(data_result['rows'])} rows, {len(data_result['columns'])} columns")
    print(f"Columns: {data_result['columns']}\n")

    # Collect all data
    all_data = [{
        "sql": sql_result['sql'],
        "columns": data_result['columns'],
        "rows": data_result['rows']
    }]

    print_section("BƯỚC 2: DATA GATE - Agentic đánh giá data có đủ không?")

    for chunk in stream_agentic_evaluate(
        question=question,
        columns=data_result['columns'],
        rows=data_result['rows'],
        schema_context=schema,
        memory_context=""
    ):
        if chunk['type'] == 'thinking':
            print(f"🤔 Thinking: {chunk['content'][:200]}...")
        elif chunk['type'] == 'final':
            result = chunk['result']
            print(f"\n📊 Decision: {'✅ ĐỦ' if result['sufficient'] else '❌ THIẾU'}")
            if not result['sufficient']:
                print(f"Lý do: {result['reason']}")
                print(f"\nAdditional SQL:\n{result['additional_sql']}\n")

                # Execute additional SQL
                print("Executing additional SQL...")
                additional_result = execute_agentic_step(result)
                if additional_result:
                    all_data.append({
                        "sql": additional_result['sql'],
                        "columns": additional_result['columns'],
                        "rows": additional_result['rows']
                    })
                    print(f"✅ Got thêm {len(additional_result['rows'])} rows")
            else:
                print("✅ Data đã đủ, tiến sang visualization")

    print_section("BƯỚC 3: VISUALIZATION GENERATOR - Tạo Dashboard")

    print("Generating visualization & analysis...")
    vis_blocks = []
    analysis_text = ""
    chart_config = None

    for chunk in stream_reply(
        question=question,
        columns=all_data[0]['columns'],  # Primary data
        rows=all_data[0]['rows'],
        additional_data=all_data[1:] if len(all_data) > 1 else None
    ):
        if chunk['type'] == 'thinking':
            print(f"🤔 Thinking: {chunk['content'][:150]}...")
        elif chunk['type'] == 'early_chart':
            print(f"📊 Early chart detected: {chunk.get('chart_config', {}).get('type', 'unknown')}")
        elif chunk['type'] == 'text':
            print(chunk['content'], end='', flush=True)
            analysis_text += chunk['content']
        elif chunk['type'] == 'final':
            vis_blocks = chunk['blocks']
            analysis_text = chunk['reply']
            chart_config = chunk['chart_config']
            print(f"\n\n✅ Dashboard created:")
            print(f"   - Blocks: {len(vis_blocks)}")
            print(f"   - Stat cards: {len([b for b in vis_blocks if b.get('type') == 'stat_cards'])}")
            print(f"   - Charts: {len([b for b in vis_blocks if b.get('type') == 'chart'])}")
            print(f"   - Tables: {len([b for b in vis_blocks if b.get('type') == 'table'])}")
            print(f"   - Headings: {len([b for b in vis_blocks if b.get('type') == 'heading'])}")
            print(f"   - Text blocks: {len([b for b in vis_blocks if b.get('type') == 'text'])}")

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
            print(f"🤔 Thinking: {chunk['content'][:200]}...")
        elif chunk['type'] == 'final':
            result = chunk['result']
            decision = result['overall_decision']
            confidence = result['confidence']

            if decision == 'PASS':
                print(f"\n✅✅✅ PASS - Output đã tốt!")
                print(f"Confidence: {confidence:.0%}")
            elif decision == 'NEEDS_IMPROVEMENT':
                print(f"\n⚠️  NEEDS_IMPROVEMENT - Cần fix trước khi deliver")
                print(f"Confidence: {confidence:.0%}")
                print(f"\nIssues ({len(result['issues'])}):")
                for i, issue in enumerate(result['issues'], 1):
                    print(f"  {i}. [{issue['area'].upper()}] {issue['what']}")
                    print(f"     Severity: {issue['severity']}")
                    print(f"     Action: {issue['action']}")
                    print(f"     Fix: {issue['how_to_fix'][:100]}...")
            else:  # CRITICAL_ISSUE
                print(f"\n🚨 CRITICAL_ISSUE - Block output!")
                print(f"Confidence: {confidence:.0%}")
                print(f"\nCritical issues:")
                for issue in result['issues']:
                    print(f"  - {issue['what']}")
                    print(f"    Fix: {issue['how_to_fix']}")

    print_section("KẾT THÚC")
    print("Agentic loop hoàn tất! 🎉")

if __name__ == "__main__":
    main()
