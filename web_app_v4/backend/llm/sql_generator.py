import os
import re
import time
from db import get_schema_context, execute_sql
from prompts import SQL_ROBOT_RULES
from .client import count_tokens, extract_thinking, extract_token_usage, generate_chat, message_text, log_llm_request_stats
from .parser import clean_sql

ALLOWED_ANALYTICS_TABLES = {
    "sample_central_rabie",
    "view_genie_person",
    "view_genie_shop",
    "view_genie_vaccine_product",
    "view_genie_vaccine_returned_order_detail",
    "view_genie_vaccine_sales_order_detail",
    "view_genie_vaccine_shop_target",
}
FORBIDDEN_TABLES = {"chat_history", "memory_facts", "memory_vectors"}


def _curate_schema_context(raw_schema: str) -> str:
    sections = []
    current_name = None
    current_lines = []

    def flush():
        nonlocal current_name, current_lines
        if current_name in ALLOWED_ANALYTICS_TABLES and current_lines:
            sections.append("\n".join(current_lines).strip())
        current_name = None
        current_lines = []

    for line in raw_schema.splitlines():
        if line.startswith("TABLE: `") and line.endswith("`"):
            flush()
            current_name = line[len("TABLE: `"):-1]
            current_lines = [line]
        elif current_name is not None:
            current_lines.append(line)
    flush()
    return "\n\n".join(section for section in sections if section.strip()).strip()


def _validate_generated_sql(sql: str):
    lowered = sql.lower()
    forbidden_hits = [name for name in FORBIDDEN_TABLES if re.search(rf"\b{name}\b", lowered)]
    if forbidden_hits:
        raise ValueError(
            f"SQL references forbidden internal tables: {', '.join(sorted(forbidden_hits))}."
        )


def build_sql_system_prompt(custom_instruction: str = "", memory_context: str = "") -> dict:
    raw_schema = get_schema_context()
    schema = _curate_schema_context(raw_schema)
    rules = SQL_ROBOT_RULES
    instruction = (custom_instruction or "").strip()
    memory = (memory_context or "").strip()

    system_prompt = ""
    if instruction:
        system_prompt += f"{instruction}\n\n"
    system_prompt += rules
    if memory:
        system_prompt += f"\n\nMemory Context:\n{memory}"
    system_prompt += f"\n\nAnalytics Schema:\n{schema}"

    return {
        "prompt": system_prompt,
        "counts": {
            "schema": count_tokens(schema),
            "rules": count_tokens(rules),
            "instruction": count_tokens(instruction) if instruction else 0,
            "memory": count_tokens(memory) if memory else 0,
        }
    }


def text_to_sql(question: str, memory_context: str = "", custom_instruction: str = "") -> dict:
    prompt_data = build_sql_system_prompt(custom_instruction=custom_instruction, memory_context=memory_context)
    system_prompt = prompt_data["prompt"]

    log_llm_request_stats(
        stage="sql",
        system_prompt=system_prompt,
        user_prompt=question,
        extra_counts={**prompt_data.get("counts", {}), "question": count_tokens(question)},
    )
    response = generate_chat(system_prompt, question, temperature=0)
    usage = extract_token_usage(response.usage)
    usage.update(prompt_data["counts"])
    usage["question"] = count_tokens(question)

    sql = clean_sql(message_text(response.choices[0].message))
    thinking = extract_thinking(response)
    sql_attempts = [sql] if sql else []

    try:
        _validate_generated_sql(sql)
        db_result = execute_sql(sql)
    except Exception as e:
        retry_response = generate_chat(
            system_prompt,
            f"{question}\n\nSQL trước đó bị lỗi: {e}\nViết lại SQL khác, tránh lỗi này.",
            temperature=0,
        )
        retry_usage = extract_token_usage(retry_response.usage)
        for k in ("input", "thinking", "output", "total"):
            usage[k] += retry_usage[k]
        sql = clean_sql(message_text(retry_response.choices[0].message))
        if sql:
            sql_attempts.append(sql)
        thinking += "\n\n[Retry] " + extract_thinking(retry_response)
        _validate_generated_sql(sql)
        db_result = execute_sql(sql)

    return {
        "sql": sql,
        "sql_attempts": sql_attempts,
        "thinking": thinking,
        "token_usage": usage,
        "columns": db_result["columns"],
        "rows": db_result["rows"],
    }


def text_to_sql_detailed(question: str, memory_context: str = "", custom_instruction: str = "") -> dict:
    timing = {}
    t_total = time.perf_counter()

    t = time.perf_counter()
    prompt_data = build_sql_system_prompt(custom_instruction=custom_instruction, memory_context=memory_context)
    system_prompt = prompt_data["prompt"]
    timing["build_prompt"] = round((time.perf_counter() - t) * 1000, 1)

    t = time.perf_counter()
    response = generate_chat(system_prompt, question, temperature=0)
    timing["llm_sql_1"] = round((time.perf_counter() - t) * 1000, 1)

    usage = extract_token_usage(response.usage)
    usage.update(prompt_data["counts"])
    usage["question"] = count_tokens(question)

    sql = clean_sql(message_text(response.choices[0].message))
    thinking = extract_thinking(response)
    sql_attempts = [sql] if sql else []

    retry_count = 0
    max_retries = int(os.getenv("SQL_MAX_RETRIES", "2"))

    while True:
        try:
            t = time.perf_counter()
            _validate_generated_sql(sql)
            db_result = execute_sql(sql)
            timing[f"db_exec_{retry_count or 1}"] = round((time.perf_counter() - t) * 1000, 1)
            break
        except Exception as e:
            retry_count += 1
            if retry_count > max_retries:
                raise
            t = time.perf_counter()
            retry_response = generate_chat(
                system_prompt,
                f"{question}\n\nSQL trước đó bị lỗi: {e}\nViết lại SQL khác, tránh lỗi này.",
                temperature=0,
            )
            timing[f"llm_sql_retry_{retry_count}"] = round((time.perf_counter() - t) * 1000, 1)
            retry_usage = extract_token_usage(retry_response.usage)
            for k in ("input", "thinking", "output", "total"):
                usage[k] += retry_usage[k]
            sql = clean_sql(message_text(retry_response.choices[0].message))
            if sql:
                sql_attempts.append(sql)
            thinking += f"\n\n[Retry {retry_count}] " + extract_thinking(retry_response)

    timing["retry_count"] = float(retry_count)
    timing["total"] = round((time.perf_counter() - t_total) * 1000, 1)

    return {
        "sql": sql,
        "sql_attempts": sql_attempts,
        "thinking": thinking,
        "token_usage": usage,
        "columns": db_result["columns"],
        "rows": db_result["rows"],
        "timing_ms": timing,
    }
