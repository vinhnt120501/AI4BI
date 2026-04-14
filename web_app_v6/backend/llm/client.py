import os
from openai import OpenAI

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY") or "local-9router-key"
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "http://localhost:20128/v1")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "cx/gpt-5-codex-mini")
if OPENROUTER_MODEL.startswith("openai/cx/"):
    OPENROUTER_MODEL = OPENROUTER_MODEL.replace("openai/", "", 1)

AGENTIC_ENABLED = os.getenv("AGENTIC_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
AGENTIC_MAX_STEPS = int(os.getenv("AGENTIC_MAX_STEPS", "2"))

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


def extract_thinking(response) -> str:
    if not response or not hasattr(response, "choices") or not response.choices:
        return ""
    msg = response.choices[0].message
    # 1. Direct property (OpenRouter reasoning_content or Reasoning part)
    reasoning = getattr(msg, "reasoning_content", "") or ""
    if not reasoning and hasattr(msg, "reasoning"):
        reasoning = getattr(msg, "reasoning", "") or ""
    if not reasoning and hasattr(msg, "model_extra") and msg.model_extra:
        reasoning = msg.model_extra.get("reasoning_content") or msg.model_extra.get("reasoning") or ""
    
    # 2. Extract from content tags (fallback for models that wrap thought in text)
    if not reasoning:
        text = message_text(msg)
        import re
        match = re.search(r'<(thought|thinking|reasoning)>([\s\S]*?)<\/\1>', text, re.I)
        if match:
            reasoning = match.group(2).strip()
            
    return str(reasoning)


def extract_token_usage(usage) -> dict:
    thinking_tokens = getattr(usage, "completion_tokens_details", None)
    thinking_count = 0
    if thinking_tokens and hasattr(thinking_tokens, "reasoning_tokens"):
        thinking_count = thinking_tokens.reasoning_tokens or 0
    
    return {
        "input": getattr(usage, "prompt_tokens", 0) or 0,
        "thinking": thinking_count,
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
    return client.chat.completions.create(
        model=OPENROUTER_MODEL,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        extra_headers=EXTRA_HEADERS,
        extra_body={
            "include_reasoning": True
        }
    )


def stream_chat(system_prompt: str, user_prompt: str, temperature: float = 0.0):
    return client.chat.completions.create(
        model=OPENROUTER_MODEL,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        extra_headers=EXTRA_HEADERS,
        stream=True,
        extra_body={
            "include_reasoning": True
        }
    )
