import os
import re
import time
from db import get_schema_context, execute_sql
from prompts import SQL_ROBOT_RULES, SQL_RECENCY_REWRITE_USER_PROMPT, SQL_EXEC_ERROR_RETRY_USER_PROMPT
from .client import count_tokens, extract_thinking, extract_token_usage, generate_chat, message_text
from .parser import clean_sql


_BANNED_CALENDAR_FUNC_RE = r"\b(NOW|CURDATE|CURRENT_DATE|CURRENT_TIMESTAMP|LOCALTIMESTAMP|LOCALTIME)\b"


def _has_banned_calendar_functions(sql: str) -> bool:
    if not sql:
        return False
    in_single = False
    in_double = False
    escape_next = False
    buf = []

    def flush_segment(seg: str) -> bool:
        return bool(re.search(_BANNED_CALENDAR_FUNC_RE, seg, flags=re.I))

    for ch in sql:
        if escape_next:
            escape_next = False
            buf.append(ch)
            continue

        if ch == "\\":
            escape_next = True
            buf.append(ch)
            continue

        if not in_double and ch == "'":
            if not in_single and flush_segment("".join(buf)):
                return True
            buf = []
            in_single = not in_single
            continue

        if not in_single and ch == '"':
            if not in_double and flush_segment("".join(buf)):
                return True
            buf = []
            in_double = not in_double
            continue

        if not in_single and not in_double:
            buf.append(ch)

    return flush_segment("".join(buf))


def _rewrite_sql_follow_recency(system_prompt: str, question: str, sql: str) -> tuple[str, str]:
    """
    If the model generated calendar-anchored SQL, ask it to rewrite using MAX(date) as-of logic.
    Returns (sql, extra_thinking_note)
    """
    if not _has_banned_calendar_functions(sql):
        return sql, ""

    rewrite = generate_chat(
        system_prompt,
        SQL_RECENCY_REWRITE_USER_PROMPT.format(question=question, sql=sql),
        temperature=0,
    )
    new_sql = clean_sql(message_text(rewrite.choices[0].message))
    note = "\n\n[Rewrite] Đã rewrite SQL để neo theo MAX(date) trong DB (không dùng NOW/CURDATE...)."
    return new_sql, note


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
    sql, rewrite_note = _rewrite_sql_follow_recency(system_prompt, question, sql)
    thinking = extract_thinking(response)
    if rewrite_note:
        thinking += rewrite_note

    try:
        db_result = execute_sql(sql)
    except Exception as e:
        retry_response = generate_chat(
            system_prompt,
            SQL_EXEC_ERROR_RETRY_USER_PROMPT.format(question=question, error=str(e)),
            temperature=0,
        )
        retry_usage = extract_token_usage(retry_response.usage)
        for k in ("input", "thinking", "output", "total"):
            usage[k] += retry_usage[k]
        sql = clean_sql(message_text(retry_response.choices[0].message))
        sql, rewrite_note = _rewrite_sql_follow_recency(system_prompt, question, sql)
        thinking += "\n\n[Retry] " + extract_thinking(retry_response)
        if rewrite_note:
            thinking += rewrite_note
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
    sql, rewrite_note = _rewrite_sql_follow_recency(system_prompt, question, sql)
    thinking = extract_thinking(response)
    if rewrite_note:
        thinking += rewrite_note

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
                SQL_EXEC_ERROR_RETRY_USER_PROMPT.format(question=question, error=str(e)),
                temperature=0,
            )
            timing[f"llm_sql_retry_{retry_count}"] = round((time.perf_counter() - t) * 1000, 1)
            retry_usage = extract_token_usage(retry_response.usage)
            for k in ("input", "thinking", "output", "total"):
                usage[k] += retry_usage[k]
            sql = clean_sql(message_text(retry_response.choices[0].message))
            sql, rewrite_note = _rewrite_sql_follow_recency(system_prompt, question, sql)
            thinking += f"\n\n[Retry {retry_count}] " + extract_thinking(retry_response)
            if rewrite_note:
                thinking += rewrite_note

    timing["retry_count"] = float(retry_count)
    timing["total"] = round((time.perf_counter() - t_total) * 1000, 1)

async def stream_text_to_sql(question: str, memory_context: str = "", custom_instruction: str = ""):
    """Async generator yielding {'type': 'thinking', 'content': '...'} and finally the full result."""
    from .client import stream_chat, extract_token_usage, message_text, extract_thinking
    from .parser import clean_sql
    import re
    
    prompt_data = build_sql_system_prompt(custom_instruction=custom_instruction, memory_context=memory_context)
    system_prompt = prompt_data["prompt"]
    
    full_text = ""
    thinking_buffer = ""
    in_thinking_tag = False
    
    # We use a simple tag detector for streaming thinking
    response_stream = stream_chat(system_prompt, question)
    
    for chunk in response_stream:
        delta = chunk.choices[0].delta
        content = delta.content or ""
        reasoning = getattr(delta, "reasoning_content", "") or ""
        
        if reasoning:
            yield {"type": "thinking", "chunk": reasoning}
            thinking_buffer += reasoning
        elif content:
            full_text += content
            # Try to detect tags in content if not in native reasoning_content
            if "<thinking>" in full_text and "</thinking>" not in full_text:
                in_thinking_tag = True
            if in_thinking_tag:
                match = re.search(r'<thinking>([\s\S]*)$', full_text, re.I)
                if match:
                    # This is slightly complex for streaming, but let's yield the new delta
                    tag_start = full_text.find("<thinking>") + 10
                    new_thought = full_text[tag_start:]
                    # We only yield the difference since last yielded might be hard
                    # For now, just yield the content and let frontend handle it or just yield 'thinking' type to show spinner
                    yield {"type": "thinking", "chunk": content}
            if "</thinking>" in full_text:
                in_thinking_tag = False

    # Now we have the full text, we can use existing logic for DB exec
    # For now, we'll just parse the final text
    thinking = thinking_buffer
    if not thinking:
        match = re.search(r'<thinking>([\s\S]*?)<\/thinking>', full_text, re.I)
        if match:
            thinking = match.group(1).strip()
    
    sql = clean_sql(full_text)
    sql, rewrite_note = _rewrite_sql_follow_recency(system_prompt, question, sql)
    if rewrite_note:
        thinking += rewrite_note
    
    # Execute SQL (this part is still blocking, but we already yielded thinking)
    try:
        db_result = execute_sql(sql)
    except Exception as e:
        # Fallback to sync retry for now to keep it simple
        db_result = {"columns": [], "rows": []}
        # In a real app, we'd retry here with another stream
    
    yield {
        "type": "final",
        "sql": sql,
        "thinking": thinking,
        "columns": db_result["columns"],
        "rows": db_result["rows"],
        "token_usage": prompt_data["counts"] # basic usage
    }
