import os
import time
from db import get_schema_context, execute_sql
from prompts import SQL_ROBOT_RULES
from .client import count_tokens, extract_thinking, extract_token_usage, generate_chat, message_text
from .parser import clean_sql


def build_sql_system_prompt(custom_instruction: str = "", memory_context: str = "") -> dict:
    schema = get_schema_context()
    rules = SQL_ROBOT_RULES
    instruction = (custom_instruction or "").strip()
    memory = (memory_context or "").strip()

    system_prompt = ""
    if instruction:
        system_prompt += f"{instruction}\n\n"
    system_prompt += rules
    if memory:
        system_prompt += f"\n\nMemory Context:\n{memory}"
    system_prompt += f"\n\nSchema:\n{schema}"

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

    response = generate_chat(system_prompt, question, temperature=0)
    usage = extract_token_usage(response.usage)
    usage.update(prompt_data["counts"])
    usage["question"] = count_tokens(question)

    sql = clean_sql(message_text(response.choices[0].message))
    thinking = extract_thinking(response)

    try:
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
        thinking += "\n\n[Retry] " + extract_thinking(retry_response)
        db_result = execute_sql(sql)

    return {
        "sql": sql,
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

    retry_count = 0
    max_retries = int(os.getenv("SQL_MAX_RETRIES", "2"))

    while True:
        try:
            t = time.perf_counter()
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
            thinking += f"\n\n[Retry {retry_count}] " + extract_thinking(retry_response)

    timing["retry_count"] = float(retry_count)
    timing["total"] = round((time.perf_counter() - t_total) * 1000, 1)

    return {
        "sql": sql,
        "thinking": thinking,
        "token_usage": usage,
        "columns": db_result["columns"],
        "rows": db_result["rows"],
        "timing_ms": timing,
    }
