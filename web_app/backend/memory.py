import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from openai import OpenAI

from db import (
    count_chat_turns,
    delete_memory_fact,
    get_chat_history,
    get_memory_facts,
    insert_memory_fact,
    reset_memory_facts,
)

try:
    import chromadb
    from llama_index.core import Document, Settings, VectorStoreIndex
    from llama_index.embeddings.openai import OpenAIEmbedding
    from llama_index.vector_stores.chroma import ChromaVectorStore

    LLAMAINDEX_READY = True
except Exception:
    LLAMAINDEX_READY = False


@dataclass
class MemoryContext:
    short_term: str
    static_block: str
    fact_block: str
    vector_block: str

    def render(self) -> str:
        sections = []
        if self.static_block:
            sections.append(f"[Static Memory]\n{self.static_block}")
        if self.fact_block:
            sections.append(f"[Fact Memory]\n{self.fact_block}")
        if self.vector_block:
            sections.append(f"[Vector Memory]\n{self.vector_block}")
        if self.short_term:
            sections.append(f"[Short-term Session]\n{self.short_term}")
        return "\n\n".join(sections).strip()


class MemoryService:
    def __init__(self):
        self.persist_dir = os.getenv("MEMORY_PERSIST_DIR", str(Path(__file__).parent / ".memory"))
        self.short_token_limit = int(os.getenv("MEMORY_SHORT_TOKEN_LIMIT", "1800"))
        self.long_top_k = int(os.getenv("MEMORY_LONG_TOP_K", "5"))
        self.sql_fact_top_k = int(os.getenv("MEMORY_SQL_FACT_TOP_K", "3"))
        self.sql_vector_top_k = int(os.getenv("MEMORY_SQL_VECTOR_TOP_K", "2"))
        self.short_max_turns = int(os.getenv("MEMORY_SHORT_MAX_TURNS", "3"))
        self.short_summary_chars = int(os.getenv("MEMORY_SHORT_SUMMARY_CHARS", "220"))
        self.summary_every_n = int(os.getenv("MEMORY_SUMMARY_EVERY_N_TURNS", "8"))
        self.embedding_model = os.getenv("OPENROUTER_EMBEDDING_MODEL", "openai/text-embedding-3-small")
        if "/" in self.embedding_model:
            # LlamaIndex OpenAIEmbedding expects bare model names, e.g. "text-embedding-3-small"
            self.embedding_model = self.embedding_model.split("/")[-1]
        self.chat_model = os.getenv("OPENROUTER_MODEL", "cx/gpt-5-codex-mini")
        self.openrouter_base = os.getenv("OPENROUTER_BASE_URL", "http://localhost:20128/v1")
        self.openrouter_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY") or "local-9router-key"
        self.extra_headers = {
            "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:3000"),
            "X-Title": os.getenv("OPENROUTER_APP_NAME", "AI4BI"),
        }
        self.client = OpenAI(api_key=self.openrouter_key, base_url=self.openrouter_base)
        self.static_block = os.getenv(
            "MEMORY_STATIC_BLOCK",
            (
                "Bạn là BI assistant cho Long Châu. Ưu tiên trả lời ngắn gọn, dữ liệu-first, "
                "mặc định timezone Asia/Ho_Chi_Minh, ngôn ngữ tiếng Việt."
            ),
        )
        self._init_vector_store()
        self._chart_pattern = re.compile(
            r"\b(chart|charttype|bar|line|pie|donut|scatter|radar|treemap|funnel|composed|"
            r"visual|visualization|plot|graph|biểu đồ)\b",
            re.IGNORECASE,
        )

    def _init_vector_store(self):
        self.vector_index = None
        self.vector_store = None
        if not LLAMAINDEX_READY:
            return
        Path(self.persist_dir).mkdir(parents=True, exist_ok=True)
        Settings.embed_model = OpenAIEmbedding(
            model=self.embedding_model,
            api_key=self.openrouter_key,
            api_base=self.openrouter_base,
            default_headers=self.extra_headers,
        )
        chroma_client = chromadb.PersistentClient(path=self.persist_dir)
        collection = chroma_client.get_or_create_collection("memory_vector_block")
        self.vector_store = ChromaVectorStore(chroma_collection=collection)
        self.vector_index = VectorStoreIndex.from_vector_store(self.vector_store)

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        return max(1, len(text) // 4)

    def build_memory_context(self, user_id: str, session_id: str, query: str) -> MemoryContext:
        short = self._build_short_term_context(user_id, session_id, max_turns=self.short_max_turns)
        facts = self._build_fact_block(user_id, top_k=self.long_top_k)
        vector = self._build_vector_block(user_id, query, top_k=self.long_top_k)
        return MemoryContext(
            short_term=short,
            static_block=self.static_block,
            fact_block=facts,
            vector_block=vector,
        )

    def build_stage_memory_context(self, user_id: str, session_id: str, query: str, stage: str) -> MemoryContext:
        stage = (stage or "reply").lower()
        if stage == "sql":
            # SQL step: compact context only, avoid flooding prompt with long transcript.
            return MemoryContext(
                short_term=self._build_short_term_summary(user_id, session_id, max_turns=2),
                static_block=self.static_block,
                fact_block=self._build_fact_block(user_id, top_k=self.sql_fact_top_k),
                vector_block=self._build_vector_block(user_id, query, top_k=self.sql_vector_top_k),
            )
        return self.build_memory_context(user_id=user_id, session_id=session_id, query=query)

    def _build_short_term_context(self, user_id: str, session_id: str, max_turns: int | None = None) -> str:
        limit = max_turns if max_turns is not None else 20
        rows = get_chat_history(session_id=session_id, limit=limit, user_id=user_id)
        rows = list(reversed(rows))
        budget = self.short_token_limit
        chunks = []
        for row in rows:
            q = (row.get("question") or "").strip()
            a = (row.get("reply") or "").strip()
            if a and len(a) > self.short_summary_chars:
                a = a[: self.short_summary_chars].rstrip() + "..."
            block = f"User: {q}\nAssistant: {a}".strip()
            cost = self._estimate_tokens(block)
            if cost > budget:
                continue
            chunks.append(block)
            budget -= cost
        return "\n\n".join(chunks)

    def _build_short_term_summary(self, user_id: str, session_id: str, max_turns: int = 2) -> str:
        rows = get_chat_history(session_id=session_id, limit=max_turns, user_id=user_id)
        rows = list(reversed(rows))
        if not rows:
            return ""
        lines = []
        for row in rows:
            q = (row.get("question") or "").strip()
            a = (row.get("reply") or "").strip()
            if a and len(a) > 120:
                a = a[:120].rstrip() + "..."
            lines.append(f"- Q: {q} | A: {a}")
        return "\n".join(lines)

    def _build_fact_block(self, user_id: str, top_k: int = 5) -> str:
        facts = get_memory_facts(user_id=user_id, limit=max(top_k * 4, 16))
        if not facts:
            return ""
        unique = []
        seen = set()
        for f in facts:
            key = (str(f.get("category", "")).strip().lower(), str(f.get("content", "")).strip().lower())
            if not key[1] or key in seen:
                continue
            seen.add(key)
            unique.append(f)
            if len(unique) >= top_k:
                break
        lines = []
        for f in unique:
            lines.append(
                f"- ({f.get('category','fact')}, importance={f.get('importance', 1)}) {f.get('content','')}"
            )
        return "\n".join(lines)

    def _build_vector_block(self, user_id: str, query: str, top_k: int = 5) -> str:
        if not self.vector_index or not query.strip():
            return ""
        try:
            retriever = self.vector_index.as_retriever(similarity_top_k=top_k)
            hits = retriever.retrieve(query)
        except Exception:
            return ""

        lines = []
        seen_text = set()
        for hit in hits:
            md = getattr(hit.node, "metadata", {}) or {}
            if md.get("user_id") != user_id:
                continue
            score = getattr(hit, "score", None)
            text = (hit.node.get_content() or "").strip()
            if not text:
                continue
            norm = text.lower()
            if norm in seen_text:
                continue
            seen_text.add(norm)
            if score is None:
                lines.append(f"- {text}")
            else:
                lines.append(f"- (score={score:.3f}) {text}")
        return "\n".join(lines[:top_k])

    def update_after_turn(
        self,
        user_id: str,
        session_id: str,
        question: str,
        reply: str,
        sql_generated: str = "",
    ):
        extracted = self._extract_facts(question=question, reply=reply, sql_generated=sql_generated)
        now = datetime.now().isoformat(timespec="seconds")
        for item in extracted:
            category = item.get("category", "business_context")
            content = item.get("content", "").strip()
            importance = int(item.get("importance", 1))
            if not content:
                continue
            memory_id = insert_memory_fact(
                user_id=user_id,
                session_id=session_id,
                category=category,
                content=content,
                importance=max(1, min(5, importance)),
                source_type="fact_extraction",
            )
            self._upsert_vector_doc(
                memory_id=str(memory_id),
                text=content,
                metadata={
                    "user_id": user_id,
                    "session_id": session_id,
                    "category": category,
                    "importance": importance,
                    "created_at": now,
                },
            )

        # Periodic summarize block
        total_turns = count_chat_turns(user_id=user_id, session_id=session_id)
        if total_turns > 0 and total_turns % self.summary_every_n == 0:
            summary = self._summarize_recent_turns(user_id=user_id, session_id=session_id, n=self.summary_every_n)
            if summary:
                memory_id = insert_memory_fact(
                    user_id=user_id,
                    session_id=session_id,
                    category="recurring_task",
                    content=summary,
                    importance=3,
                    source_type="periodic_summary",
                )
                self._upsert_vector_doc(
                    memory_id=str(memory_id),
                    text=summary,
                    metadata={
                        "user_id": user_id,
                        "session_id": session_id,
                        "category": "recurring_task",
                        "importance": 3,
                        "created_at": now,
                    },
                )

    def _extract_facts(self, question: str, reply: str, sql_generated: str) -> list[dict[str, Any]]:
        # Cheap heuristic first: pick stable BI preferences
        text = f"{question}\n{reply}"
        candidates = []
        lowered = text.lower()
        if "theo tỉnh" in lowered or "theo thanh pho" in lowered or "theo thành" in lowered:
            candidates.append({"category": "business_context", "content": "Ưu tiên phân tích theo tỉnh/thành", "importance": 3})
        if "tháng" in lowered:
            candidates.append({"category": "business_context", "content": "Thường hỏi theo chu kỳ tháng", "importance": 2})
        if "doanh thu" in lowered:
            candidates.append({"category": "recurring_task", "content": "Quan tâm KPI doanh thu", "importance": 4})

        # LLM extraction to enrich facts
        prompt = (
            "Extract durable memory items from this turn. "
            "Return strict JSON array of objects with keys: category, content, importance(1-5). "
            "Only keep reusable BI preferences/context. Max 4 items.\n\n"
            f"Question: {question}\nSQL: {sql_generated}\nReply: {reply}"
        )
        try:
            res = self.client.chat.completions.create(
                model=self.chat_model,
                temperature=0,
                messages=[
                    {"role": "system", "content": "You extract long-term memory facts for BI assistant."},
                    {"role": "user", "content": prompt},
                ],
                extra_headers=self.extra_headers,
            )
            content = res.choices[0].message.content or "[]"
            parsed = self._parse_json_array(content)
            for item in parsed:
                if isinstance(item, dict) and item.get("content"):
                    candidates.append(
                        {
                            "category": item.get("category", "business_context"),
                            "content": str(item.get("content")).strip(),
                            "importance": int(item.get("importance", 2)),
                        }
                    )
        except Exception:
            pass

        return self._dedupe_facts(candidates)

    @staticmethod
    def _parse_json_array(text: str) -> list[Any]:
        text = text.strip()
        # Remove markdown fences if any
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        match = re.search(r"\[[\s\S]*\]", text)
        candidate = match.group(0) if match else text
        try:
            parsed = json.loads(candidate)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []

    @staticmethod
    def _is_chart_related(category: str, content: str) -> bool:
        category = (category or "").strip().lower()
        content = (content or "").strip()
        if "chart" in category or "visual" in category:
            return True
        return bool(re.search(
            r"\b(chart|charttype|bar|line|pie|donut|scatter|radar|treemap|funnel|composed|visual|visualization|plot|graph|biểu đồ)\b",
            content,
            flags=re.IGNORECASE,
        ))

    @classmethod
    def _dedupe_facts(cls, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen = set()
        out = []
        for it in items:
            category = it.get("category", "").strip()
            content = it.get("content", "").strip()
            if cls._is_chart_related(category, content):
                continue
            key = (category.lower(), content.lower())
            if not key[1] or key in seen:
                continue
            seen.add(key)
            out.append(it)
        return out

    def _summarize_recent_turns(self, user_id: str, session_id: str, n: int) -> str:
        rows = get_chat_history(session_id=session_id, limit=n, user_id=user_id)
        rows = list(reversed(rows))
        transcript = []
        for row in rows:
            q = (row.get("question") or "").strip()
            r = (row.get("reply") or "").strip()
            transcript.append(f"User: {q}\nAssistant: {r}")
        if not transcript:
            return ""
        text = "\n\n".join(transcript)
        prompt = (
            "Summarize reusable long-term BI memory from this recent transcript in one short sentence. "
            "Focus on preferences/recurring analytical intent."
        )
        try:
            res = self.client.chat.completions.create(
                model=self.chat_model,
                temperature=0.2,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": text},
                ],
                extra_headers=self.extra_headers,
            )
            return (res.choices[0].message.content or "").strip()
        except Exception:
            return ""

    def _upsert_vector_doc(self, memory_id: str, text: str, metadata: dict[str, Any]):
        if not self.vector_index or not text.strip():
            return
        doc = Document(text=text, metadata={**metadata, "memory_id": memory_id}, doc_id=f"mem-{memory_id}")
        try:
            self.vector_index.insert(doc)
        except Exception:
            pass

    def admin_overview(self, user_id: str) -> dict[str, Any]:
        facts = get_memory_facts(user_id=user_id, limit=20)
        return {
            "user_id": user_id,
            "count": len(facts),
            "static_block": self.static_block,
            "latest": facts[:10],
            "llamaindex_ready": LLAMAINDEX_READY,
        }

    def admin_search(self, user_id: str, query: str, top_k: int = 10) -> dict[str, Any]:
        fact_hits = get_memory_facts(user_id=user_id, query=query, limit=top_k)
        vector = self._build_vector_block(user_id=user_id, query=query, top_k=top_k)
        return {"facts": fact_hits, "vector_hits": vector}

    def admin_delete_item(self, user_id: str, memory_id: int) -> dict[str, Any]:
        removed = delete_memory_fact(user_id=user_id, memory_id=memory_id)
        return {"removed": removed, "memory_id": memory_id}

    def admin_reset(self, user_id: str) -> dict[str, Any]:
        deleted = reset_memory_facts(user_id=user_id)
        return {"deleted": deleted, "user_id": user_id}

    def admin_rebuild(self, user_id: str) -> dict[str, Any]:
        self.admin_reset(user_id)
        rows = get_chat_history(session_id="", user_id=user_id, limit=5000, cross_session=True)
        processed = 0
        for row in rows:
            self.update_after_turn(
                user_id=user_id,
                session_id=row.get("session_id") or "default_session",
                question=row.get("question") or "",
                reply=row.get("reply") or "",
                sql_generated=row.get("sql_generated") or "",
            )
            processed += 1
        return {"reprocessed_turns": processed, "user_id": user_id}
