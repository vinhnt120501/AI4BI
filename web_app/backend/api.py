from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv(Path(__file__).parent / ".env")

from llm import text_to_sql, generate_reply
from db import get_all_tables

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    sessionId: str = ""


@app.post("/chat")
async def chat(req: ChatRequest):
    try:
        sql_result = text_to_sql(req.message)

        reply_result = generate_reply(
            req.message,
            sql_result["columns"],
            sql_result["rows"],
        )

        sql_tokens = sql_result["token_usage"]
        reply_tokens = reply_result["reply_token_usage"]
        grand_total = {
            "input": sql_tokens["input"] + reply_tokens["input"],
            "thinking": sql_tokens["thinking"] + reply_tokens["thinking"],
            "output": sql_tokens["output"] + reply_tokens["output"],
            "total": sql_tokens["total"] + reply_tokens["total"],
        }

        return {
            **sql_result,
            "reply": reply_result["reply"],
            "chart_config": reply_result["chart_config"],
            "reply_token_usage": reply_tokens,
            "grand_total": grand_total,
        }
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    import sys
    import uvicorn

    if "--serve" in sys.argv:
        uvicorn.run(app, host="0.0.0.0", port=8000)
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
