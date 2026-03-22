"""
Chatbot knowledge base -- keyword + TF-IDF search over Tiresias documentation.

Loads 5 markdown files from src/chatbot/knowledge/ at startup.
search_knowledge(query, top_k=3) returns the most relevant chunks.
"""

from __future__ import annotations

import math
import re
from pathlib import Path
from typing import NamedTuple

import structlog

logger = structlog.get_logger(__name__)

_KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"


class DocChunk(NamedTuple):
    source: str       # filename without extension
    heading: str      # nearest ## heading above the chunk
    text: str         # chunk text (max 600 chars)
    score: float      # TF-IDF relevance score


# ---------------------------------------------------------------------------
# Module-level state: loaded once at import time
# ---------------------------------------------------------------------------

_chunks: list[dict] = []
_idf: dict[str, float] = {}


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def _split_into_chunks(text: str, source: str) -> list[dict]:
    """Split markdown into chunks at ## headings."""
    chunks = []
    current_heading = "Overview"
    current_lines: list[str] = []

    def flush() -> None:
        if current_lines:
            body = "\n".join(current_lines).strip()
            if body:
                chunks.append({
                    "source": source,
                    "heading": current_heading,
                    "text": body,
                    "terms": _tokenize(body),
                })

    for line in text.splitlines():
        if line.startswith("## "):
            flush()
            current_heading = line[3:].strip()
            current_lines = []
        else:
            current_lines.append(line)
    flush()
    return chunks


def load_knowledge_base() -> None:
    """Load all markdown files and build IDF table. Called once at import."""
    global _chunks, _idf
    _chunks = []

    if not _KNOWLEDGE_DIR.exists():
        logger.warning("chatbot.knowledge_dir_missing", path=str(_KNOWLEDGE_DIR))
        return

    for md_file in sorted(_KNOWLEDGE_DIR.glob("*.md")):
        source = md_file.stem
        text = md_file.read_text(encoding="utf-8")
        new_chunks = _split_into_chunks(text, source)
        _chunks.extend(new_chunks)
        logger.info("chatbot.knowledge_loaded", source=source, chunks=len(new_chunks))

    n_docs = len(_chunks)
    if n_docs == 0:
        return

    doc_freq: dict[str, int] = {}
    for chunk in _chunks:
        for term in set(chunk["terms"]):
            doc_freq[term] = doc_freq.get(term, 0) + 1
    _idf = {term: math.log(n_docs / (1 + df)) for term, df in doc_freq.items()}
    logger.info("chatbot.knowledge_ready", total_chunks=n_docs, vocab_size=len(_idf))


def _tfidf_score(query_terms: list[str], chunk: dict) -> float:
    chunk_len = max(len(chunk["terms"]), 1)
    tf: dict[str, float] = {}
    for t in chunk["terms"]:
        tf[t] = tf.get(t, 0) + 1.0
    score = 0.0
    for t in query_terms:
        if t in tf:
            score += (tf[t] / chunk_len) * _idf.get(t, 0.0)
    return score


def search_knowledge(query: str, top_k: int = 3) -> list[DocChunk]:
    """Return the top_k most relevant doc chunks for the given query."""
    if not _chunks:
        load_knowledge_base()
    if not _chunks:
        return []

    query_terms = _tokenize(query)
    scored = [(_tfidf_score(query_terms, chunk), chunk) for chunk in _chunks]
    scored.sort(key=lambda x: x[0], reverse=True)

    results = []
    for score, chunk in scored[:top_k]:
        if score > 0:
            results.append(DocChunk(
                source=chunk["source"],
                heading=chunk["heading"],
                text=chunk["text"][:600],
                score=score,
            ))
    return results


# Auto-load on import
load_knowledge_base()
