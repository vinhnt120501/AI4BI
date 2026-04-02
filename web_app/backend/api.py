import json
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv(Path(__file__).parent / ".env")

from llm import (
    build_reply_contents,
    build_sql_system_prompt,
    generate_followup_questions,
    generate_reply,
    text_to_sql,
    REPLY_SYSTEM_PROMPT,
)
from db import get_all_tables, init_chat_history_table, init_memory_facts_table, save_chat
from memory import MemoryService

app = FastAPI()

# Tạo bảng chat_history khi khởi động
init_chat_history_table()
init_memory_facts_table()
memory_service = MemoryService()
ADMIN_TOKEN = os.getenv("MEMORY_ADMIN_TOKEN", "").strip()
SHOW_LLM_PAYLOAD = os.getenv("SHOW_LLM_PAYLOAD", "true").lower() in {"1", "true", "yes", "on"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    sessionId: str = ""
    userId: str = "default_user"


class MemorySearchRequest(BaseModel):
    userId: str = "default_user"
    query: str
    topK: int = 10


class MemoryContextPreviewRequest(BaseModel):
    message: str
    sessionId: str = ""
    userId: str = "default_user"
    columns: list[str] = []
    rows: list[list[str]] = []


def sse_event(event: str, data: dict) -> str:
    """Format 1 SSE event."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/chat")
async def chat(req: ChatRequest):
    """SSE streaming: gửi từng phần khi có kết quả."""

    # Dùng list để lưu kết quả từ generator cho save_chat
    chat_data = {}

    def stream():
        try:
            sql_memory_ctx = memory_service.build_stage_memory_context(req.userId, req.sessionId, req.message, stage="sql")
            sql_memory_context = sql_memory_ctx.render()
            sql_system_prompt, schema = build_sql_system_prompt(memory_context=sql_memory_context)
            if SHOW_LLM_PAYLOAD:
                yield sse_event("debug_payload", {
                    "stage": "sql",
                    "model": os.getenv("OPENROUTER_MODEL", ""),
                    "system_prompt": sql_system_prompt,
                    "user_content": req.message,
                    "memory_context": sql_memory_context,
                    "schema_chars": len(schema),
                })

            # Bước 1: Sinh SQL
            yield sse_event("status", {"step": 1, "text": "Đang phân tích câu hỏi và tạo truy vấn SQL..."})
            sql_result = text_to_sql(req.message, memory_context=sql_memory_context)
            yield sse_event("thinking", {"thinking": sql_result["thinking"]})
            yield sse_event("sql", {
                "sql": sql_result["sql"],
                "token_usage": sql_result["token_usage"],
            })

            # Bước 2: Data từ SQL
            yield sse_event("status", {"step": 2, "text": "Đang truy vấn dữ liệu từ database..."})
            yield sse_event("data", {
                "columns": sql_result["columns"],
                "rows": sql_result["rows"],
            })

            # Bước 3: Phân tích + reply + chart
            yield sse_event("status", {"step": 3, "text": "Đang phân tích dữ liệu và vẽ biểu đồ..."})
            reply_memory_ctx = memory_service.build_stage_memory_context(req.userId, req.sessionId, req.message, stage="reply")
            reply_memory_context = reply_memory_ctx.render()
            reply_user_content, _ = build_reply_contents(
                question=req.message,
                columns=sql_result["columns"],
                rows=sql_result["rows"],
                memory_context=reply_memory_context,
            )
            if SHOW_LLM_PAYLOAD:
                yield sse_event("debug_payload", {
                    "stage": "reply",
                    "model": os.getenv("OPENROUTER_MODEL", ""),
                    "system_prompt": REPLY_SYSTEM_PROMPT,
                    "user_content": reply_user_content,
                    "memory_context": reply_memory_context,
                })
            reply_result = generate_reply(
                req.message,
                sql_result["columns"],
                sql_result["rows"],
                memory_context=reply_memory_context,
            )
            yield sse_event("reply", {
                "reply": reply_result["reply"],
                "chart_config": reply_result["chart_config"],
                "blocks": reply_result.get("blocks"),
                "reply_token_usage": reply_result["reply_token_usage"],
            })
            suggestions = generate_followup_questions(
                question=req.message,
                reply=reply_result["reply"],
                columns=sql_result["columns"],
                rows=sql_result["rows"],
                memory_context=reply_memory_context,
            )
            yield sse_event("suggestions", {"questions": suggestions})

            # Bước 4: Tổng kết token
            sql_tokens = sql_result["token_usage"]
            reply_tokens = reply_result["reply_token_usage"]
            grand_total = {
                "input": sql_tokens["input"] + reply_tokens["input"],
                "thinking": sql_tokens["thinking"] + reply_tokens["thinking"],
                "output": sql_tokens["output"] + reply_tokens["output"],
                "total": sql_tokens["total"] + reply_tokens["total"],
            }
            yield sse_event("done", {"grand_total": grand_total})

            # Lưu data để save sau khi stream xong
            chat_data.update({
                **sql_result,
                "reply": reply_result["reply"],
                "chart_config": reply_result["chart_config"],
                "blocks": reply_result.get("blocks"),
                "reply_token_usage": reply_tokens,
                "grand_total": grand_total,
            })
            try:
                memory_service.update_after_turn(
                    user_id=req.userId,
                    session_id=req.sessionId,
                    question=req.message,
                    reply=reply_result["reply"],
                    sql_generated=sql_result["sql"],
                )
            except Exception as mem_err:
                yield sse_event("status", {"step": 4, "text": f"Memory update warning: {mem_err}"})

        except Exception as e:
            yield sse_event("error", {"error": str(e)})

    async def response_with_save():
        """Stream response rồi save chat history."""
        for chunk in stream():
            yield chunk
        # Save sau khi stream xong
        if chat_data:
            try:
                save_chat(req.sessionId, req.message, chat_data, user_id=req.userId)
                print(f"[save_chat OK] session={req.sessionId[:8]}... q={req.message[:30]}")
            except Exception as e:
                import traceback
                print(f"[save_chat ERROR] {e}")
                traceback.print_exc()
        else:
            print(f"[save_chat SKIP] No chat_data for: {req.message[:30]}")

    return StreamingResponse(response_with_save(), media_type="text/event-stream")


def _guard_admin(x_admin_token: str | None):
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=500, detail="MEMORY_ADMIN_TOKEN is not configured")
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid admin token")


@app.get("/memory/admin/overview")
def memory_admin_overview(userId: str = "default_user", x_admin_token: str | None = Header(default=None)):
    _guard_admin(x_admin_token)
    return memory_service.admin_overview(user_id=userId)


@app.post("/memory/admin/search")
def memory_admin_search(req: MemorySearchRequest, x_admin_token: str | None = Header(default=None)):
    _guard_admin(x_admin_token)
    return memory_service.admin_search(user_id=req.userId, query=req.query, top_k=req.topK)


@app.delete("/memory/admin/items/{memory_id}")
def memory_admin_delete(memory_id: int, userId: str = "default_user", x_admin_token: str | None = Header(default=None)):
    _guard_admin(x_admin_token)
    return memory_service.admin_delete_item(user_id=userId, memory_id=memory_id)


@app.post("/memory/admin/reset")
def memory_admin_reset(userId: str = "default_user", x_admin_token: str | None = Header(default=None)):
    _guard_admin(x_admin_token)
    return memory_service.admin_reset(user_id=userId)


@app.post("/memory/admin/rebuild")
def memory_admin_rebuild(userId: str = "default_user", x_admin_token: str | None = Header(default=None)):
    _guard_admin(x_admin_token)
    return memory_service.admin_rebuild(user_id=userId)


@app.post("/memory/admin/context-preview")
def memory_admin_context_preview(req: MemoryContextPreviewRequest, x_admin_token: str | None = Header(default=None)):
    _guard_admin(x_admin_token)
    sql_memory_ctx = memory_service.build_stage_memory_context(req.userId, req.sessionId, req.message, stage="sql")
    sql_memory_context = sql_memory_ctx.render()
    reply_memory_ctx = memory_service.build_stage_memory_context(req.userId, req.sessionId, req.message, stage="reply")
    reply_memory_context = reply_memory_ctx.render()
    sql_system_prompt, schema = build_sql_system_prompt(memory_context=sql_memory_context)
    reply_contents, _ = build_reply_contents(
        question=req.message,
        columns=req.columns or [],
        rows=req.rows or [],
        memory_context=reply_memory_context,
    )
    return {
        "user_id": req.userId,
        "session_id": req.sessionId,
        "message": req.message,
        "memory_context": {
            "sql": sql_memory_context,
            "reply": reply_memory_context,
        },
        "memory_blocks": {
            "sql": {
                "static": sql_memory_ctx.static_block,
                "fact": sql_memory_ctx.fact_block,
                "vector": sql_memory_ctx.vector_block,
                "short_term": sql_memory_ctx.short_term,
            },
            "reply": {
                "static": reply_memory_ctx.static_block,
                "fact": reply_memory_ctx.fact_block,
                "vector": reply_memory_ctx.vector_block,
                "short_term": reply_memory_ctx.short_term,
            },
        },
        "stage1_sql_prompt": {
            "system_prompt": sql_system_prompt,
            "user_content": req.message,
            "schema_chars": len(schema),
        },
        "stage2_reply_prompt": {
            "system_prompt": REPLY_SYSTEM_PROMPT,
            "user_content": reply_contents,
            "note": "If columns/rows are empty, this is a template preview.",
        },
    }


if __name__ == "__main__":
    import sys
    import uvicorn

    if "--serve" in sys.argv:
        uvicorn.run(app, host="0.0.0.0", port=8001)
    else:
        data = get_all_tables()
        for i, (name, info) in enumerate(data.items(), 1):
            print(f"{i}. {name}: {len(info['rows']):,} rows, {len(info['columns'])} columns")
        print(f"\nTổng: {len(data)} bảng")

        print("\nNhập câu hỏi:")
        while True:
            try:
                question = input("\n> ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if not question or question.lower() == "q":
                break
            try:
                result = text_to_sql(question)
                t = result["token_usage"]

                print(f"\n{'='*50}")
                print(f"[Lần 1: Sinh SQL]")
                print(f"  ĐẦU VÀO: {t['pre_input']:,} tokens")
                print(f"    - Schema     : {t['schema']:,}")
                print(f"    - Instruction: {t['instruction']:,}")
                print(f"    - Câu hỏi   : {t['question']:,}")
                print(f"  ĐẦU RA:")
                print(f"    - Thinking   : {t['thinking']:,}")
                print(f"    - SQL        : {t['output']:,}")
                print(f"{'='*50}")

                if result["thinking"]:
                    print(f"\n[Thinking]\n{result['thinking']}")
                print(f"\n[SQL]\n{result['sql']}\n")
                print(f"({len(result['rows'])} rows)")

                reply = generate_reply(question, result["columns"], result["rows"])
                rt = reply["reply_token_usage"]

                print(f"\n{'='*50}")
                print(f"[Lần 2: Phân tích]")
                print(f"  ĐẦU VÀO: {rt['pre_input']:,} tokens")
                print(f"    - Instruction: {rt['instruction']:,}")
                print(f"    - Câu hỏi   : {rt['question']:,}")
                print(f"    - Data SQL   : {rt['data']:,}")
                print(f"  ĐẦU RA:")
                print(f"    - Thinking   : {rt['thinking']:,}")
                print(f"    - Trả lời    : {rt['output']:,}")
                print(f"{'='*50}")

                print(f"\n{reply['reply']}")
                if reply["chart_config"]:
                    print(f"\n[Chart] {reply['chart_config']}")

                print(f"\n{'='*50}")
                print(f"[TỔNG KẾT CHI PHÍ]")
                print(f"")
                print(f"  INPUT (tính tiền): {t['pre_input'] + rt['pre_input']:,} tokens")
                print(f"    Lần 1 - Sinh SQL:")
                print(f"      SQL_SYSTEM_PROMPT : {t['instruction']:,}")
                print(f"      Schema            : {t['schema']:,}")
                print(f"      Câu hỏi           : {t['question']:,}")
                print(f"    Lần 2 - Phân tích:")
                print(f"      REPLY_SYSTEM_PROMPT: {rt['instruction']:,}")
                print(f"      Câu hỏi            : {rt['question']:,}")
                print(f"      Data từ SQL        : {rt['data']:,}")
                print(f"")
                print(f"  OUTPUT (tính tiền): {t['output'] + rt['output']:,} tokens")
                print(f"    Lần 1 - Câu SQL     : {t['output']:,}")
                print(f"    Lần 2 - Trả lời     : {rt['output']:,}")
                print(f"")
                print(f"  THINKING : {t['thinking'] + rt['thinking']:,} tokens")
                print(f"    Lần 1               : {t['thinking']:,}")
                print(f"    Lần 2               : {rt['thinking']:,}")
                print(f"")
                print(f"  ─────────────────────────────")
                print(f"  TỔNG TÍNH TIỀN: {t['pre_input'] + rt['pre_input'] + t['output'] + rt['output']:,} tokens")
                print(f"{'='*50}")
            except Exception as e:
                print(f"Lỗi: {e}")
