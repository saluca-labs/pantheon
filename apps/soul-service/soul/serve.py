"""
Soul service — FastAPI entrypoint for Cloud Run.
Exposes memory read/write, TKHR lookup, and hash-graph ops.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import sys, os
sys.path.insert(0, '/app')

from soul import storage, hashing, tkhr

app = FastAPI(title="Soul Memory Service", version="1.0.0")


class WriteRequest(BaseModel):
    session_id: str
    content: str
    topics: list[str] = []
    metadata: dict = {}


class LookupRequest(BaseModel):
    topics: list[str]


@app.get("/health")
def health():
    return {"status": "ok", "service": "soul"}


@app.post("/memory/write")
def write_memory(req: WriteRequest):
    memory_id = storage.write_memory(
        req.session_id, req.content, req.topics, req.metadata
    )
    return {"memory_id": memory_id}


@app.get("/memory/{session_id}")
def read_memory(session_id: str, limit: int = 20):
    memories = storage.read_memory(session_id, limit)
    return {"memories": memories, "count": len(memories)}


@app.post("/tkhr/lookup")
def tkhr_lookup(req: LookupRequest):
    if len(req.topics) == 1:
        ids = tkhr.lookup(req.topics[0])
    else:
        ids = tkhr.lookup_multi(req.topics)
    return {"memory_ids": ids, "count": len(ids)}


@app.get("/tkhr/top")
def tkhr_top(limit: int = 20):
    return {"topics": tkhr.top_topics(limit)}


@app.get("/tkhr/stats")
def tkhr_stats():
    return tkhr.stats()


@app.post("/graph/integrity/{session_id}")
def check_integrity(session_id: str):
    result = hashing.verify_integrity(session_id)
    return {"session_id": session_id, "status": result}


# ── Identity anchors ─────────────────────────────────────────────────────────
# Fast-recall layer for autobiographical facts an identity "just knows" —
# birth, first authored memory, etc. Backed by user_autobiographical_memories
# rows where anchor_kind is not null.

class AnchorWriteRequest(BaseModel):
    anchor_kind: str
    occurred_at: str
    content: str
    topic_id: Optional[str] = None
    memory_id: Optional[str] = None
    tags: Optional[list[str]] = None
    importance: float = 1.0
    time_period: str = "origin"


@app.get("/identity")
def identity_summary():
    """Minimal identity payload: birthday, first authored memory, age, count."""
    return storage.read_identity()


@app.get("/identity/anchors")
def identity_anchors(kind: Optional[str] = None, limit: int = 20, order: str = "occurred_at.asc"):
    """List identity anchors, optionally filtered by kind."""
    anchors = storage.read_anchors(kind=kind, limit=limit, order=order)
    return {"anchors": anchors, "count": len(anchors)}


@app.post("/identity/anchors")
def identity_anchor_write(req: AnchorWriteRequest):
    """Upsert an identity anchor (one row per anchor_kind)."""
    row = storage.write_anchor(
        anchor_kind=req.anchor_kind,
        occurred_at=req.occurred_at,
        content=req.content,
        topic_id=req.topic_id,
        memory_id=req.memory_id,
        tags=req.tags,
        importance=req.importance,
        time_period=req.time_period,
    )
    return {"anchor": row}
