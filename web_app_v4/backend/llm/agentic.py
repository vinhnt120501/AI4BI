import json
import os
import re
from db import execute_sql
from prompts import AGENTIC_PLANNING_PROMPT
from .client import AGENTIC_ENABLED, generate_chat, message_text


def agentic_evaluate(question: str, columns: list, rows: list,
                     schema_context: str, memory_context: str = "") -> dict | None:
    if not AGENTIC_ENABLED:
        return None

    sample = rows[:20]
    max_schema_chars = int(os.getenv("AGENTIC_SCHEMA_MAX_CHARS", "5000"))
    max_memory_chars = int(os.getenv("AGENTIC_MEMORY_MAX_CHARS", "1200"))
    schema_context = (schema_context or "")[:max_schema_chars]
    memory_context = (memory_context or "")[:max_memory_chars]
    user_prompt = (
        f"Câu hỏi user: {question}\n\n"
        f"Data hiện có ({len(rows)} rows, {len(columns)} cols):\n"
        f"Columns: {json.dumps(columns, ensure_ascii=False)}\n"
        f"Sample (first {len(sample)} rows): {json.dumps(sample, ensure_ascii=False)}\n\n"
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


def _extract_select_items(sql: str) -> list[str]:
    match = re.search(r"(?is)\bSELECT\b(.*?)\bFROM\b", sql)
    if not match:
        return []
    select_clause = match.group(1)
    items: list[str] = []
    current = ""
    depth = 0
    for ch in select_clause:
        if ch == "(":
            depth += 1
        elif ch == ")" and depth > 0:
            depth -= 1
        if ch == "," and depth == 0:
            items.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        items.append(current.strip())
    return items


def _is_aggregate_item(item: str) -> bool:
    return bool(re.search(r"\b(SUM|COUNT|AVG|MIN|MAX|GROUP_CONCAT|JSON_ARRAYAGG)\s*\(", item, re.IGNORECASE))


def _build_group_by_clause(sql: str) -> str | None:
    if re.search(r"\bGROUP\s+BY\b", sql, re.IGNORECASE):
        return None
    items = _extract_select_items(sql)
    group_cols = []
    for item in items:
        if not item or _is_aggregate_item(item):
            continue
        raw = re.sub(r"\bAS\b.*$", "", item, flags=re.IGNORECASE).strip()
        if raw and raw.upper() not in {"DISTINCT", "*"}:
            group_cols.append(raw)
    if not group_cols:
        return None
    return ", ".join(group_cols)


def _retry_group_by_fix(sql: str, error: Exception) -> str | None:
    message = str(error).lower()
    if "only_full_group_by" not in message and "nonaggregated column" not in message:
        return None
    group_by_clause = _build_group_by_clause(sql)
    if not group_by_clause:
        return None
    if re.search(r"\bORDER\s+BY\b", sql, re.IGNORECASE):
        return re.sub(r"(?is)(\bORDER\s+BY\b)", f"GROUP BY {group_by_clause} \1", sql)
    if re.search(r"\bLIMIT\b", sql, re.IGNORECASE):
        return re.sub(r"(?is)(\bLIMIT\b)", f"GROUP BY {group_by_clause} \1", sql)
    return sql.rstrip().rstrip(";") + f" GROUP BY {group_by_clause}"


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
        fixed_sql = _retry_group_by_fix(sql, e)
        if fixed_sql and fixed_sql != sql:
            try:
                result = execute_sql(fixed_sql)
                print(f"[AGENTIC] Retried query with GROUP BY after only_full_group_by failure.")
                return {
                    "sql": fixed_sql,
                    "reason": evaluation.get("reason", ""),
                    "columns": result["columns"],
                    "rows": result["rows"],
                }
            except Exception as e2:
                print(f"[AGENTIC] Additional query failed after GROUP BY retry: {e2}")
                return None
        print(f"[AGENTIC] Additional query failed: {e}")
        return None
