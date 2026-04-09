import asyncio
import json
import os
import time

from llm import (
    agentic_evaluate, build_reply_contents, build_sql_system_prompt,
    execute_agentic_step, generate_followup_questions_detailed,
    stream_reply, text_to_sql_detailed,
    AGENTIC_ENABLED, AGENTIC_MAX_STEPS,
)
from db import get_schema_context, save_chat
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

            # Step 1: SQL generation
            yield sse_event("status", {"step": 1, "text": "Đang phân tích câu hỏi và tạo truy vấn SQL..."})
            t = time.perf_counter()
            sql_result = await asyncio.to_thread(
                text_to_sql_detailed, message, sql_memory_context, instruction
            )
            timings_ms["sql_stage"] = _ms(t)
            yield sse_event("thinking", {"thinking": sql_result["thinking"]})
            yield sse_event("sql", {"sql": sql_result["sql"], "token_usage": sql_result["token_usage"]})

            # Step 2: Data
            yield sse_event("status", {"step": 2, "text": "Đã nhận dữ liệu từ database..."})
            yield sse_event("data", {"columns": sql_result["columns"], "rows": sql_result["rows"]})

            # Step 2.5: Agentic
            additional_data = []
            if AGENTIC_ENABLED:
                try:
                    schema_context = await asyncio.to_thread(get_schema_context)
                except Exception:
                    schema_context = ""

                for step_i in range(AGENTIC_MAX_STEPS):
                    t = time.perf_counter()
                    evaluation = await asyncio.to_thread(
                        agentic_evaluate, message, sql_result["columns"], sql_result["rows"],
                        schema_context, sql_memory_context,
                    )
                    timings_ms[f"agentic_eval_{step_i+1}"] = _ms(t)
                    if evaluation is None:
                        break

                    yield sse_event("status", {
                        "step": 2,
                        "text": f"Đang truy vấn thêm: {evaluation.get('reason', 'phân tích sâu hơn')}..."
                    })
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
                    else:
                        break

            # Step 3: Analysis + visualization (streaming) — dùng lại memory từ SQL stage
            yield sse_event("status", {"step": 3, "text": "Đang phân tích số liệu chuyên sâu..."})

            t = time.perf_counter()
            reply_result = {"reply": "", "chart_config": None, "blocks": [], "usage": {}}
            for part in stream_reply(
                question=message, columns=sql_result["columns"], rows=sql_result["rows"],
                memory_context=sql_memory_context, custom_instruction=instruction,
                additional_data=additional_data or None,
            ):
                if part["type"] == "text":
                    yield sse_event("reply_chunk", {"text": part["content"]})
                elif part["type"] == "final":
                    reply_result = part
                    yield sse_event("reply", {
                        "reply": reply_result["reply"],
                        "blocks": reply_result.get("blocks"),
                        "chart_config": reply_result.get("chart_config"),
                        "reply_token_usage": reply_result.get("usage", {}),
                    })

            timings_ms["llm_reply"] = _ms(t)

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
            try:
                followup_result = await asyncio.to_thread(
                    generate_followup_questions_detailed,
                    message, reply_result["reply"],
                    sql_result["columns"], sql_result["rows"], sql_memory_context,
                )
                yield sse_event("suggestions", {"questions": followup_result.get("questions", [])})
            except Exception:
                yield sse_event("suggestions", {"questions": []})

            chat_data.update({
                **sql_result,
                "reply": reply_result.get("reply", ""),
                "chart_config": reply_result.get("chart_config"),
                "blocks": reply_result.get("blocks"),
                "reply_token_usage": reply_tokens,
                "grand_total": grand_total,
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
