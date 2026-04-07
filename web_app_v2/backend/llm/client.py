import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).parent.parent / ".env", override=True)

OPENROUTER_API_KEY = (
    os.getenv("LLM_API_KEY")
    or os.getenv("OPENROUTER_API_KEY")
    or os.getenv("OPENAI_API_KEY")
    or "local-9router-key"
)
OPENROUTER_BASE_URL = os.getenv("LLM_BASE_URL") or os.getenv("OPENROUTER_BASE_URL", "http://localhost:20128/v1")
OPENROUTER_MODEL = os.getenv("LLM_MODEL") or os.getenv("OPENROUTER_MODEL", "cx/gpt-5-codex-mini")
if OPENROUTER_MODEL.startswith("openai/cx/"):
    OPENROUTER_MODEL = OPENROUTER_MODEL.replace("openai/", "", 1)

AGENTIC_ENABLED = os.getenv("AGENTIC_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
AGENTIC_MAX_STEPS = int(os.getenv("AGENTIC_MAX_STEPS", "2"))

client = OpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url=OPENROUTER_BASE_URL,
)

EXTRA_HEADERS = {}
site_url = os.getenv("OPENROUTER_SITE_URL")
app_name = os.getenv("OPENROUTER_APP_NAME")
if site_url:
    EXTRA_HEADERS["HTTP-Referer"] = site_url
if app_name:
    EXTRA_HEADERS["X-Title"] = app_name


def count_tokens(text: str) -> int:
    if not text:
        return 0
    ascii_chars = sum(1 for c in text if ord(c) < 128)
    non_ascii = len(text) - ascii_chars
    return max(1, ascii_chars // 4 + non_ascii // 2)


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
    return client.chat.completions.create(
        model=OPENROUTER_MODEL,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        extra_headers=EXTRA_HEADERS,
    )
