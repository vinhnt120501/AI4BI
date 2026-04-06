import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv(Path(__file__).parent / ".env")

from db import ensure_schema_context_file, init_chat_history_table, init_memory_facts_table, init_memory_vectors_table
from llm import build_reply_contents, build_sql_system_prompt, VISUALIZATION_PROMPT_RULES
from memory import MemoryService
from chat_service import process_chat

app = FastAPI()

init_chat_history_table()
init_memory_facts_table()
init_memory_vectors_table()
ensure_schema_context_file(refresh=False)
memory_service = MemoryService()

ADMIN_TOKEN = os.getenv("MEMORY_ADMIN_TOKEN", "").strip()

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    sessionId: str = ""
    userId: str = "default_user"
    instruction: str = ""


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


def _guard_admin(x_admin_token: str | None):
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=500, detail="MEMORY_ADMIN_TOKEN is not configured")
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid admin token")


@app.post("/chat")
async def chat(req: ChatRequest):
    sse_stream = await process_chat(
        message=req.message,
        session_id=req.sessionId,
        user_id=req.userId,
        instruction=req.instruction,
        memory_service=memory_service,
    )
    return StreamingResponse(sse_stream, media_type="text/event-stream")


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
    sql_ctx = memory_service.build_stage_memory_context(req.userId, req.sessionId, req.message, stage="sql")
    reply_ctx = memory_service.build_stage_memory_context(req.userId, req.sessionId, req.message, stage="reply")
    sql_prompt = build_sql_system_prompt(memory_context=sql_ctx.render())
    reply_data = build_reply_contents(
        question=req.message, columns=req.columns or [], rows=req.rows or [],
        memory_context=reply_ctx.render(),
    )
    return {
        "user_id": req.userId,
        "session_id": req.sessionId,
        "message": req.message,
        "memory_context": {"sql": sql_ctx.render(), "reply": reply_ctx.render()},
        "stage1_sql_prompt": {"system_prompt": sql_prompt["prompt"], "user_content": req.message},
        "stage2_reply_prompt": {"system_prompt": VISUALIZATION_PROMPT_RULES, "user_content": reply_data["contents"]},
    }


if __name__ == "__main__":
    import sys, uvicorn
    if "--serve" in sys.argv:
        uvicorn.run(app, host="0.0.0.0", port=8005)
