import asyncio
import json
import os
import time

from llm import (
    agentic_evaluate, build_reply_contents, build_sql_system_prompt,
    execute_agentic_step, generate_followup_questions_detailed,
    stream_reply, text_to_sql_detailed, stream_comprehensive_qa,
    AGENTIC_ENABLED, AGENTIC_MAX_STEPS,
)
from db import get_schema_context, save_chat
from db.executor import execute_sql
from memory import MemoryService

SHOW_LLM_PAYLOAD = os.getenv("SHOW_LLM_PAYLOAD", "true").lower() in {"1", "true", "yes", "on"}


def sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 1)


async def process_chat(message: str, session_id: str, user_id: str,
                       instruction: str, memory_service: MemoryService):
    """Main chat pipeline — yields SSE events, returns chat_data for saving."""
    chat_data = {}

    async def stream():
        request_started = time.perf_counter()
        timings_ms: dict[str, float] = {}
        try:
            yield sse_event("status", {"step": 0, "text": "Đang chuẩn bị ngữ cảnh và bộ nhớ..."})
            await asyncio.sleep(0.01)

            # Memory context for SQL stage
            t = time.perf_counter()
            sql_memory_ctx = await asyncio.to_thread(
                memory_service.build_stage_memory_context, user_id, session_id, message, "sql"
            )
            sql_memory_context = sql_memory_ctx.render()
            prompt_data = build_sql_system_prompt(custom_instruction=instruction, memory_context=sql_memory_context)
            timings_ms["memory_sql"] = _ms(t)

            if SHOW_LLM_PAYLOAD:
                yield sse_event("debug_payload", {
                    "stage": "sql",
                    "model": os.getenv("OPENROUTER_MODEL", ""),
                    "system_prompt": prompt_data["prompt"],
                    "user_content": message,
                    "memory_context": sql_memory_context,
                })
                await asyncio.sleep(0.01)

            # Step 1: SQL generation (streaming)
            yield sse_event("status", {"step": 1, "text": "Đang phân tích câu hỏi và tạo truy vấn SQL..."})
            await asyncio.sleep(0.01)
            t = time.perf_counter()
            
            from llm import stream_text_to_sql
            sql_result = {"sql": "", "thinking": "", "columns": [], "rows": [], "token_usage": {}}
            
            async for part in stream_text_to_sql(message, sql_memory_context, instruction):
                if part["type"] == "thinking":
                    yield sse_event("thinking", {"thinking": part["chunk"], "stage": "sql"})
                elif part["type"] == "final":
                    sql_result = part
            
            timings_ms["sql_stage"] = _ms(t)
            yield sse_event("thinking", {"thinking": "", "stage": "sql"}) # flush
            yield sse_event("sql", {"sql": sql_result["sql"], "token_usage": sql_result["token_usage"]})
            await asyncio.sleep(0.01)

            # Step 2: Data
            yield sse_event("status", {"step": 2, "text": "Đã nhận dữ liệu từ database..."})
            await asyncio.sleep(0.01)
            yield sse_event("data", {"columns": sql_result["columns"], "rows": sql_result["rows"]})
            await asyncio.sleep(0.01)

            # Step 2.5: Agentic
            additional_data = []
            if AGENTIC_ENABLED:
                yield sse_event("status", {"step": 2, "text": "Đang đánh giá thông tin và lập kế hoạch phân tích sâu..."})
                try:
                    schema_context = await asyncio.to_thread(get_schema_context)
                except Exception:
                    schema_context = ""

                from llm import stream_agentic_evaluate
                for step_i in range(AGENTIC_MAX_STEPS):
                    evaluation = None
                    t = time.perf_counter()
                    
                    # Call generator and yield parts directly
                    gen = stream_agentic_evaluate(
                        message, sql_result["columns"], sql_result["rows"],
                        schema_context, sql_memory_context
                    )
                    
                    for part in gen:
                        if part["type"] == "thinking":
                            yield sse_event("thinking", {"thinking": part["content"], "stage": "agentic"})
                        elif part["type"] == "status":
                            yield sse_event("status", {"step": 2, "text": part["text"]})
                        elif part["type"] == "final":
                            evaluation = part["result"]
                    
                    timings_ms[f"agentic_eval_{step_i+1}"] = _ms(t)
                    await asyncio.sleep(0.01)
                    
                    if evaluation is None or evaluation.get("sufficient", True):
                        break

                    yield sse_event("status", {
                        "step": 2,
                        "text": f"Đang truy vấn thêm: {evaluation.get('reason', 'phân tích sâu hơn')}..."
                    })
                    await asyncio.sleep(0.01)
                    t = time.perf_counter()
                    extra_result = await asyncio.to_thread(execute_agentic_step, evaluation)
                    timings_ms[f"agentic_exec_{step_i+1}"] = _ms(t)
                    if extra_result:
                        additional_data.append(extra_result)
                        yield sse_event("additional_data", {
                            "step": step_i + 1,
                            "reason": extra_result.get("reason", ""),
                            "sql": extra_result.get("sql", ""),
                            "columns": extra_result["columns"],
                            "rows": extra_result["rows"],
                        })
                        await asyncio.sleep(0.01)
                    else:
                        break

            # Step 3: Analysis + visualization (COLLECT ONLY, không deliver UI)
            yield sse_event("status", {"step": 3, "text": "Đang tổng hợp dữ liệu và trực quan hóa phân tích..."})
            await asyncio.sleep(0.01)

            t = time.perf_counter()
            reply_result = {"reply": "", "chart_config": None, "blocks": [], "usage": {}}
            for part in stream_reply(
                question=message, columns=sql_result["columns"], rows=sql_result["rows"],
                memory_context=sql_memory_context, custom_instruction=instruction,
                additional_data=additional_data or None,
            ):
                if part["type"] == "thinking":
                    yield sse_event("thinking", {"thinking": part["content"], "stage": "reply"})
                elif part["type"] == "final":
                    reply_result = part

            timings_ms["llm_reply"] = _ms(t)

            # Log blocks for debugging
            blocks_count = len(reply_result.get("blocks", []))
            chart_config = reply_result.get("chart_config")
            print(f"[DEBUG] stream_reply returned {blocks_count} blocks, chart_config: {bool(chart_config)}")
            if blocks_count > 0:
                for i, block in enumerate(reply_result.get("blocks", [])):
                    print(f"[DEBUG] Block {i+1}: type={block.get('type')}, chartType={block.get('chartType', 'N/A')}")

            # Fallback: nếu完全没有 blocks, tạo stat cards đơn giản từ data
            if blocks_count == 0 and not chart_config and sql_result.get("columns"):
                cols = sql_result["columns"]
                rows = sql_result["rows"]
                print(f"[DEBUG] Creating fallback stat cards from data ({len(cols)} columns, {len(rows)} rows)")

                # Tạo stat cards từ first numeric columns
                stat_cards = []
                for col in cols[:4]:  # Max 4 cards
                    if rows and len(rows) > 0:
                        # Lấy giá trị từ row đầu tiên
                        value = rows[0][cols.index(col)] if col in cols else "N/A"
                        stat_cards.append({
                            "label": col,
                            "value": str(value),
                            "color": "blue"
                        })

                if stat_cards:
                    reply_result["blocks"] = [
                        {"type": "stat_cards", "cards": stat_cards},
                        {"type": "text", "content": reply_result.get("reply", "").strip() or "Đã lấy dữ liệu từ database."}
                    ]
                    print(f"[DEBUG] Created {len(stat_cards)} stat cards as fallback")

            # Step 4: Comprehensive QA với Auto-fix Loop
            qa_result = {"overall_decision": "PASS", "confidence": 1.0, "issues": []}
            QA_MAX_RETRIES = 2  # Tối đa sửa 2 lần

            for qa_retry in range(QA_MAX_RETRIES + 1):
                if AGENTIC_ENABLED:
                    if qa_retry > 0:
                        yield sse_event("status", {"step": 4, "text": f"Đang sửa các vấn đề phát hiện (lần {qa_retry})..."})
                    else:
                        yield sse_event("status", {"step": 4, "text": "Đang kiểm tra chất lượng phân tích..."})
                    await asyncio.sleep(0.01)

                    try:
                        # Collect all data for QA
                        all_data_for_qa = [
                            {
                                "sql": sql_result.get("sql", ""),
                                "columns": sql_result.get("columns", []),
                                "rows": sql_result.get("rows", [])
                            }
                        ]
                        all_data_for_qa.extend([
                            {
                                "sql": extra.get("sql", ""),
                                "columns": extra.get("columns", []),
                                "rows": extra.get("rows", [])
                            }
                            for extra in additional_data
                        ])

                        t = time.perf_counter()
                        gen = stream_comprehensive_qa(
                            question=message,
                            all_data=all_data_for_qa,
                            vis_config=reply_result.get("blocks", []),
                            analysis_text=reply_result.get("reply", ""),
                            schema_context=schema_context,
                            memory_context=sql_memory_context,
                            instructions=instruction
                        )

                        for part in gen:
                            if part["type"] == "thinking":
                                yield sse_event("thinking", {"thinking": part["content"], "stage": "qa"})
                            elif part["type"] == "status":
                                yield sse_event("status", {"step": 4, "text": part["text"]})
                            elif part["type"] == "final":
                                qa_result = part["result"]

                        timings_ms["comprehensive_qa"] = _ms(t)

                        # Send QA result with full data for frontend display
                        yield sse_event("qa_result", {
                            "decision": qa_result.get("overall_decision"),
                            "confidence": qa_result.get("confidence"),
                            "issues_count": len(qa_result.get("issues", [])),
                            "dimension_scores": qa_result.get("dimension_scores", {}),
                            "issues": qa_result.get("issues", []),
                        })

                        # Log warnings if not PASS
                        if qa_result.get("overall_decision") != "PASS":
                            print(f"[QA] Warning: {qa_result.get('overall_decision')}")
                            for issue in qa_result.get("issues", []):
                                print(f"[QA]   - [{issue.get('area')}] {issue.get('what')}")

                    except Exception as e:
                        print(f"[QA] Error during comprehensive QA: {e}")
                        import traceback
                        traceback.print_exc()

                decision = qa_result.get("overall_decision", "PASS")

                # Nếu PASS hoặc đã hết retry → break loop
                if decision == "PASS" or qa_retry >= QA_MAX_RETRIES:
                    break

                # Nếu có issues → tự động sửa
                issues = qa_result.get("issues", [])
                if not issues:
                    break

                # Phân loại issues để biết cách fix
                needs_more_data = any(i.get("action") == "ADDITIONAL_SQL" for i in issues)
                needs_better_analysis = any(i.get("action") in ["IMPROVE_ANALYSIS", "IMPROVE_VISUALIZATION", "REFINE_MESSAGE"] for i in issues)

                if needs_more_data and additional_data is not None:
                    # Query thêm data
                    yield sse_event("status", {"step": 4, "text": "Đang truy vấn thêm dữ liệu theo đề xuất của QA..."})
                    await asyncio.sleep(0.01)

                    # Tìm issue đầu tiên yêu cầu additional SQL
                    for issue in issues:
                        if issue.get("action") == "ADDITIONAL_SQL" and issue.get("how_to_fix"):
                            try:
                                # Tạo SQL từ how_to_fix (nếu có SQL trong đó)
                                fix_hint = issue["how_to_fix"]
                                # Simple heuristic: extract SQL từ hint
                                import re
                                sql_match = re.search(r'```sql\n?(SELECT.*?)```', fix_hint, re.DOTALL | re.IGNORECASE)
                                if sql_match:
                                    additional_sql = sql_match.group(1).strip()
                                else:
                                    # Nếu không có SQL trong hint, skip
                                    print(f"[QA] Could not extract SQL from fix hint")
                                    continue

                                # Execute additional SQL
                                extra_result = await asyncio.to_thread(
                                    execute_sql, additional_sql
                                )

                                if extra_result and extra_result.get("rows"):
                                    additional_data.append(extra_result)
                                    yield sse_event("additional_data", {
                                        "step": len(additional_data),
                                        "reason": f"QA suggested: {issue.get('what', 'Additional data needed')}",
                                        "sql": additional_sql,
                                        "columns": extra_result.get("columns", []),
                                        "rows": extra_result.get("rows", []),
                                    })
                                    await asyncio.sleep(0.01)
                                    break
                            except Exception as e:
                                print(f"[QA] Error executing additional SQL: {e}")

                if needs_better_analysis:
                    # Regenerate analysis với thêm context từ QA
                    yield sse_event("status", {"step": 4, "text": "Đang cải thiện phân tích theo đề xuất của QA..."})
                    await asyncio.sleep(0.01)

                    # Build QA feedback context
                    qa_feedback = "\n\n".join([
                        f"- [{i.get('area')}] {i.get('what')}"
                        for i in issues[:5]  # Max 5 issues
                    ])

                    # Regenerate reply với QA feedback
                    t = time.perf_counter()
                    reply_result = {"reply": "", "chart_config": None, "blocks": [], "usage": {}}
                    for part in stream_reply(
                        question=message,
                        columns=sql_result["columns"],
                        rows=sql_result["rows"],
                        memory_context=sql_memory_context,
                        custom_instruction=f"{instruction}\n\nQA Feedback để cải thiện:\n{qa_feedback}",
                        additional_data=additional_data or None,
                    ):
                        if part["type"] == "thinking":
                            yield sse_event("thinking", {"thinking": part["content"], "stage": "reply_improved"})
                        elif part["type"] == "final":
                            reply_result = part

                    timings_ms[f"llm_reply_improved_{qa_retry}"] = _ms(t)

            # CHỈ DELIVER SAU QA CHECK (hoặc hết retries)
            decision = qa_result.get("overall_decision", "PASS")
            should_deliver = decision == "PASS"

            if decision == "CRITICAL_ISSUE":
                # BLOCK - Gửi error, không deliver kết quả
                issues = qa_result.get("issues", [])
                error_msg = "Phát hiện vấn đề nghiêm trọng trong quá trình phân tích. "
                if issues:
                    for issue in issues[:3]:  # Max 3 issues
                        error_msg += f"• [{issue.get('area')}] {issue.get('what')} "

                yield sse_event("error", {"error": error_msg})
                return  # Dừng pipeline, không deliver gì thêm

            elif decision == "NEEDS_IMPROVEMENT":
                # Deliver bình thường, issues đã được hiện trong timeline
                should_deliver = True

            # Deliver results (chỉ khi PASS hoặc NEEDS_IMPROVEMENT đã inject warning)
            if should_deliver and reply_result.get("reply"):
                reply_text = reply_result["reply"]
                # Split into sentences/phrases for streaming
                import re
                chunks = re.split(r'(?<=[.!?]\s)', reply_text)
                for chunk in chunks:
                    if chunk.strip():
                        yield sse_event("reply_chunk", {"text": chunk})
                        await asyncio.sleep(0.01)  # Small delay for natural streaming

            # Send final reply event
            if should_deliver and (reply_result.get("reply") or reply_result.get("blocks")):
                yield sse_event("reply", {
                    "reply": reply_result.get("reply", ""),
                    "thinking": reply_result.get("thinking", ""),
                    "blocks": reply_result.get("blocks"),
                    "chart_config": reply_result.get("chart_config"),
                    "reply_token_usage": reply_result.get("usage", {}),
                    "qa_result": qa_result,  # Include QA result for reference
                })

            # Done — user nhận kết quả ngay
            sql_tokens = sql_result.get("token_usage", {})
            reply_tokens = reply_result.get("usage", {})
            grand_total = {
                k: sql_tokens.get(k, 0) + reply_tokens.get(k, 0)
                for k in ("input", "thinking", "output", "total")
            }
            timings_ms["total"] = _ms(request_started)
            sql_sub = sql_result.get("timing_ms", {})
            if sql_sub:
                for k, v in sql_sub.items():
                    timings_ms[f"sql__{k}"] = v

            timings_ms["total"] = _ms(request_started)

            yield sse_event("done", {"grand_total": grand_total})
            yield sse_event("timing", {"timings_ms": timings_ms})

            # Suggestions — hiện cuối cùng, sau done
            followup_questions: list[str] = []
            try:
                followup_result = await asyncio.to_thread(
                    generate_followup_questions_detailed,
                    message, reply_result["reply"],
                    sql_result["columns"], sql_result["rows"], sql_memory_context,
                )
                followup_questions = followup_result.get("questions", [])
                yield sse_event("suggestions", {"questions": followup_questions})
            except Exception:
                yield sse_event("suggestions", {"questions": []})

            chat_data.update({
                **sql_result,
                "reply": reply_result.get("reply", ""),
                "chart_config": reply_result.get("chart_config"),
                "blocks": reply_result.get("blocks"),
                "reply_token_usage": reply_tokens,
                "grand_total": grand_total,
                "follow_up_suggestions": followup_questions,
                "qa_result": qa_result,  # Lưu kết quả QA
            })

            # Background: memory update + save — user không chờ
            async def _background_tasks():
                try:
                    await asyncio.gather(
                        asyncio.to_thread(
                            memory_service.update_after_turn,
                            user_id, session_id, message,
                            reply_result["reply"], sql_result["sql"],
                        ),
                        asyncio.to_thread(
                            save_chat, session_id, message, chat_data, user_id,
                        ),
                        return_exceptions=True,
                    )
                except Exception as e:
                    print(f"[background] {e}")

            asyncio.create_task(_background_tasks())

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield sse_event("error", {"error": str(e)})

    async def stream_and_save():
        async for chunk in stream():
            yield chunk

    return stream_and_save()
