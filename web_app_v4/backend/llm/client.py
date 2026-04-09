import os
from openai import OpenAI

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY") or "local-9router-key"
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "http://localhost:20128/v1")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "cx/gpt-5-codex-mini")
if OPENROUTER_MODEL.startswith("openai/cx/"):
    OPENROUTER_MODEL = OPENROUTER_MODEL.replace("openai/", "", 1)

AGENTIC_ENABLED = os.getenv("AGENTIC_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
AGENTIC_MAX_STEPS = int(os.getenv("AGENTIC_MAX_STEPS", "2"))
LLM_TRACE_TOKENS = os.getenv("LLM_TRACE_TOKENS", "false").lower() in {"1", "true", "yes", "on"}
LLM_TRACE_TOKENS_ON_ERROR = os.getenv("LLM_TRACE_TOKENS_ON_ERROR", "true").lower() in {"1", "true", "yes", "on"}

client = OpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url=OPENROUTER_BASE_URL,
)

EXTRA_HEADERS = {
    "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:3000"),
    "X-Title": os.getenv("OPENROUTER_APP_NAME", "AI4BI"),
}


def count_tokens(text: str) -> int:
    if not text:
        return 0
    ascii_chars = sum(1 for c in text if ord(c) < 128)
    non_ascii = len(text) - ascii_chars
    return max(1, ascii_chars // 4 + non_ascii // 2)


def _looks_like_token_overflow(err_text: str) -> bool:
    t = (err_text or "").lower()
    return any(
        needle in t
        for needle in (
            "maximum context length",
            "context length",
            "too many tokens",
            "max tokens",
            "token limit",
            "prompt is too long",
            "request too large",
            "input is too long",
        )
    )


def _is_gemma_model(model_name: str | None = None) -> bool:
    return "gemma" in (model_name or OPENROUTER_MODEL).strip().lower()


def build_chat_messages(system_prompt: str, user_prompt: str, model_name: str | None = None) -> list[dict]:
    system_prompt = (system_prompt or "").strip()
    user_prompt = user_prompt or ""

    if _is_gemma_model(model_name):
        if system_prompt:
            user_prompt = f"System Instructions:\n{system_prompt}\n\nUser Request:\n{user_prompt}"
        return [{"role": "user", "content": user_prompt}]

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})
    return messages


def log_llm_request_stats(
    *,
    stage: str,
    system_prompt: str,
    user_prompt: str,
    extra_counts: dict | None = None,
):
    sys_chars = len(system_prompt or "")
    usr_chars = len(user_prompt or "")
    sys_toks = count_tokens(system_prompt or "")
    usr_toks = count_tokens(user_prompt or "")
    total = sys_toks + usr_toks

    msg = (
        f"[LLM_TRACE] stage={stage} model={OPENROUTER_MODEL} "
        f"sys_chars={sys_chars} usr_chars={usr_chars} "
        f"sys_toks~={sys_toks} usr_toks~={usr_toks} total_in~={total}"
    )
    if extra_counts:
        prefer = ("schema", "rules", "instruction", "memory", "data", "question")
        parts = []
        for k in prefer:
            if k in extra_counts:
                parts.append(f"{k}~={extra_counts[k]}")
        for k, v in extra_counts.items():
            if k not in prefer:
                parts.append(f"{k}~={v}")
        msg += " extra(" + ", ".join(parts) + ")"

    print(msg)


def extract_thinking(response) -> str:
    return ""


def extract_token_usage(usage) -> dict:
    return {
        "input": getattr(usage, "prompt_tokens", 0) or 0,
        "thinking": 0,
        "output": getattr(usage, "completion_tokens", 0) or 0,
        "total": getattr(usage, "total_tokens", 0) or 0,
    }


def message_text(message) -> str:
    content = getattr(message, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
        return "".join(parts)
    return str(content or "")


def generate_chat(system_prompt: str, user_prompt: str, temperature: float = 0.0):
    if LLM_TRACE_TOKENS:
        log_llm_request_stats(stage="chat", system_prompt=system_prompt, user_prompt=user_prompt)
    try:
        return client.chat.completions.create(
            model=OPENROUTER_MODEL,
            temperature=temperature,
            messages=build_chat_messages(system_prompt, user_prompt),
            extra_headers=EXTRA_HEADERS,
        )
    except Exception as e:
        if LLM_TRACE_TOKENS_ON_ERROR or _looks_like_token_overflow(str(e)):
            log_llm_request_stats(stage="chat_error", system_prompt=system_prompt, user_prompt=user_prompt)
            print(f"[LLM_TRACE] error={type(e).__name__}: {e}")
        raise
