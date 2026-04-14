import json
from db import execute_sql
from prompts import AGENTIC_PLANNING_PROMPT, COMPREHENSIVE_QA_PROMPT
from .client import AGENTIC_ENABLED, generate_chat, message_text


def stream_agentic_evaluate(question: str, columns: list, rows: list,
                            schema_context: str, memory_context: str = ""):
    if not AGENTIC_ENABLED:
        return

    sample = rows[:20]

    # Status 1: Starting evaluation
    yield {"type": "status", "text": f"Đánh giá data ({len(rows)} dòng, {len(columns)} cột)..."}
    user_prompt = (
        f"Câu hỏi user: {question}\n\n"
        f"Data hiện có ({len(rows)} rows, {len(columns)} cols):\n"
        f"Columns: {json.dumps(columns, ensure_ascii=False)}\n"
        f"Sample (first {len(sample)} rows): {json.dumps(sample, ensure_ascii=False)}\n\n"
        f"Schema:\n{schema_context}\n\n"
        f"Memory:\n{memory_context}"
    )

    full_text = ""
    full_thinking = ""
    
    from .client import stream_chat
    response = stream_chat(AGENTIC_PLANNING_PROMPT, user_prompt, temperature=0)
    
    for chunk in response:
        delta = chunk.choices[0].delta.content if chunk.choices[0].delta.content else ""
        reasoning = ""
        if hasattr(chunk.choices[0].delta, "reasoning_content"):
            reasoning = chunk.choices[0].delta.reasoning_content or ""
        elif hasattr(chunk.choices[0].delta, "reasoning"):
            reasoning = chunk.choices[0].delta.reasoning or ""
            
        if reasoning:
            full_thinking += reasoning
            yield {"type": "thinking", "content": reasoning}
            
        if delta:
            full_text += delta

    try:
        content = full_text.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        result = json.loads(content)
        
        final_result = {"thinking": full_thinking, "sufficient": result.get("sufficient", True), "reason": result.get("reason", "")}
        if not final_result["sufficient"]:
            final_result["additional_sql"] = result.get("additional_sql", "").strip()

        # Status update before final
        if not final_result["sufficient"]:
            yield {"type": "status", "text": f"Cần bổ sung: {final_result.get('reason', 'thiếu thông tin')}"}
        else:
            yield {"type": "status", "text": "Dữ liệu đã đủ, tiếp tục phân tích"}

        yield {"type": "final", "result": final_result}
    except Exception as e:
        print(f"[AGENTIC] Evaluation failed to parse: {e}")
        yield {"type": "final", "result": {"thinking": full_thinking, "sufficient": True}}


def agentic_evaluate(question: str, columns: list, rows: list,
                     schema_context: str, memory_context: str = "") -> dict | None:
    # Legacy wrapper if needed, but we'll use the stream version
    gen = stream_agentic_evaluate(question, columns, rows, schema_context, memory_context)
    res = None
    for part in gen:
        if part["type"] == "final":
            res = part["result"]
    return res


def execute_agentic_step(evaluation: dict) -> dict | None:
    sql = evaluation.get("additional_sql", "")
    if not sql:
        return None
    try:
        result = execute_sql(sql)
        return {
            "sql": sql,
            "reason": evaluation.get("reason", ""),
            "columns": result["columns"],
            "rows": result["rows"],
        }
    except Exception as e:
        print(f"[AGENTIC] Additional query failed: {e}")
        return None


def stream_comprehensive_qa(question: str, all_data: list, vis_config: list,
                           analysis_text: str, schema_context: str,
                           memory_context: str = "", instructions: str = ""):
    """
    Final QA: Đánh giá toàn bộ output (Data + Analysis + Visualization) trước khi deliver.

    Args:
        question: Câu hỏi gốc của user
        all_data: List của tất cả data đã query [{"columns": [], "rows": [], "sql": ""}, ...]
        vis_config: VIS_CONFIG hoàn chỉnh từ reply_generator
        analysis_text: Phân tích văn bản đã tạo
        schema_context: Schema database
        memory_context: Memory hội thoại (nếu có)
        instructions: Business rules/instructions

    Yields:
        {"type": "thinking", "content": "..."} - thinking process
        {"type": "final", "result": {...}} - final QA decision
    """
    if not AGENTIC_ENABLED:
        yield {"type": "final", "result": {"overall_decision": "PASS", "confidence": 1.0, "issues": []}}
        return

    # Status: Starting QA
    yield {"type": "status", "text": f"QA: Đánh giá data ({len(all_data)} queries)..."}
    yield {"type": "status", "text": f"QA: Kiểm tra {len(vis_config)} blocks visualization..."}

    # Build input cho QA
    user_prompt = f"""Câu hỏi user: {question}

Tất cả dữ liệu đã lấy ({len(all_data)} queries):
"""
    for i, data in enumerate(all_data, 1):
        user_prompt += f"\n--- Query #{i} ---\n"
        user_prompt += f"SQL: {data.get('sql', 'N/A')}\n"
        user_prompt += f"Columns: {json.dumps(data.get('columns', []), ensure_ascii=False)}\n"
        rows = data.get('rows', [])
        sample = rows[:20]
        user_prompt += f"Rows (total {len(rows)}, showing first {len(sample)}): {json.dumps(sample, ensure_ascii=False)}\n"

    user_prompt += f"\n\nVIS_CONFIG (Dashboard structure):\n{json.dumps(vis_config, ensure_ascii=False, indent=2)}\n"
    user_prompt += f"\n\nAnalysis Text:\n{analysis_text}\n"
    user_prompt += f"\n\nSchema:\n{schema_context}\n"
    if memory_context:
        user_prompt += f"\n\nMemory (conversation history):\n{memory_context}\n"
    if instructions:
        user_prompt += f"\n\nInstructions (business rules):\n{instructions}\n"

    full_text = ""
    full_thinking = ""

    from .client import stream_chat
    response = stream_chat(COMPREHENSIVE_QA_PROMPT, user_prompt, temperature=0)

    for chunk in response:
        delta = chunk.choices[0].delta.content if chunk.choices[0].delta.content else ""
        reasoning = ""
        if hasattr(chunk.choices[0].delta, "reasoning_content"):
            reasoning = chunk.choices[0].delta.reasoning_content or ""
        elif hasattr(chunk.choices[0].delta, "reasoning"):
            reasoning = chunk.choices[0].delta.reasoning or ""

        if reasoning:
            full_thinking += reasoning
            yield {"type": "thinking", "content": reasoning}

        if delta:
            full_text += delta

    try:
        content = full_text.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        result = json.loads(content)

        final_result = {
            "thinking": full_thinking,
            "overall_decision": result.get("overall_decision", "PASS"),
            "confidence": result.get("confidence", 0.0),
            "issues": result.get("issues", [])
        }

        # Status before final
        decision = final_result["overall_decision"]
        issues_count = len(final_result["issues"])
        if decision == "PASS":
            yield {"type": "status", "text": "QA: Chất lượng tốt ✅"}
        elif decision == "NEEDS_IMPROVEMENT":
            yield {"type": "status", "text": f"QA: Cần cải thiện ({issues_count} vấn đề)"}
        else:  # CRITICAL_ISSUE
            yield {"type": "status", "text": "QA: Phát hiện lỗi nghiêm trọng"}

        yield {"type": "final", "result": final_result}
    except Exception as e:
        print(f"[COMPREHENSIVE_QA] Evaluation failed to parse: {e}")
        yield {"type": "final", "result": {"thinking": full_thinking, "overall_decision": "PASS", "confidence": 0.5, "issues": []}}


def comprehensive_qa(question: str, all_data: list, vis_config: list,
                    analysis_text: str, schema_context: str,
                    memory_context: str = "", instructions: str = "") -> dict | None:
    """
    Non-stream version của comprehensive_qa.

    Returns:
        None nếu AGENTIC_ENABLED = False
        Dict với keys: thinking, overall_decision, confidence, issues
    """
    if not AGENTIC_ENABLED:
        return {"overall_decision": "PASS", "confidence": 1.0, "issues": []}

    gen = stream_comprehensive_qa(question, all_data, vis_config, analysis_text,
                                  schema_context, memory_context, instructions)
    res = None
    for part in gen:
        if part["type"] == "final":
            res = part["result"]
    return res
