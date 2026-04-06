import json
from db import execute_sql, compute_data_summary
from prompts import AGENTIC_PLANNING_PROMPT
from .client import AGENTIC_ENABLED, generate_chat, message_text


def agentic_evaluate(question: str, columns: list, rows: list,
                     schema_context: str, memory_context: str = "") -> dict | None:
    if not AGENTIC_ENABLED:
        return None

    sample = rows[:30]
    data_summary = compute_data_summary(columns, rows)
    user_prompt = (
        f"Câu hỏi user: {question}\n\n"
        f"Data hiện có ({len(rows)} rows, {len(columns)} cols):\n"
        f"Columns: {json.dumps(columns, ensure_ascii=False)}\n"
        f"Sample (first {len(sample)} rows): {json.dumps(sample, ensure_ascii=False)}\n"
        f"Summary: {json.dumps(data_summary, ensure_ascii=False)}\n\n"
        f"Schema:\n{schema_context}\n\n"
        f"Memory:\n{memory_context}"
    )

    try:
        response = generate_chat(AGENTIC_PLANNING_PROMPT, user_prompt, temperature=0)
        content = message_text(response.choices[0].message).strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        result = json.loads(content)
        if result.get("sufficient", True):
            return None
        additional_sql = result.get("additional_sql", "").strip()
        if additional_sql:
            return {"reason": result.get("reason", ""), "additional_sql": additional_sql}
    except Exception as e:
        print(f"[AGENTIC] Evaluation failed: {e}")

    return None


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
