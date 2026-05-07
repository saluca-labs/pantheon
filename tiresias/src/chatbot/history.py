"""
In-memory per-tenant chat history store.

Stores chat sessions keyed by (tenant_id, session_id).
Retention: 100 sessions per tenant, 50 turns per session.
Production upgrade: replace dict with database table.
"""

from __future__ import annotations

import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)

MAX_SESSIONS_PER_TENANT = 100
MAX_TURNS_PER_SESSION = 50


@dataclass
class ChatTurn:
    role: str          # "user" | "assistant"
    content: str
    timestamp: float   # unix epoch


@dataclass
class ChatSession:
    session_id: str
    tenant_id: Optional[str]
    turns: list = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "tenant_id": self.tenant_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "turn_count": len(self.turns),
            "preview": self.turns[0].content[:80] if self.turns else "",
        }


# ---------------------------------------------------------------------------
# Storage: {tenant_id: deque[session_id]} + {session_id: ChatSession}
# ---------------------------------------------------------------------------

_tenant_sessions: dict = defaultdict(lambda: deque(maxlen=MAX_SESSIONS_PER_TENANT))
_sessions: dict = {}


async def append_turn(
    tenant_id: Optional[str],
    session_id: str,
    user_message: str,
    assistant_message: str,
) -> None:
    """Append a user+assistant turn to the session. Creates session if new."""
    key = tenant_id or "_anonymous"

    if session_id not in _sessions:
        session = ChatSession(session_id=session_id, tenant_id=tenant_id)
        _sessions[session_id] = session
        # If deque is full, remove oldest session from store
        if len(_tenant_sessions[key]) >= MAX_SESSIONS_PER_TENANT:
            oldest_id = _tenant_sessions[key][0]
            _sessions.pop(oldest_id, None)
        _tenant_sessions[key].append(session_id)
        logger.info("chatbot.history_session_created", session_id=session_id, tenant_id=tenant_id)

    session = _sessions[session_id]
    now = time.time()
    session.turns.append(ChatTurn(role="user", content=user_message, timestamp=now))
    session.turns.append(ChatTurn(role="assistant", content=assistant_message, timestamp=now))
    session.updated_at = now

    # Trim to max turns
    if len(session.turns) > MAX_TURNS_PER_SESSION * 2:
        session.turns = session.turns[-(MAX_TURNS_PER_SESSION * 2):]


def list_sessions(tenant_id: Optional[str]) -> list:
    """Return session summaries for a tenant, newest first."""
    key = tenant_id or "_anonymous"
    session_ids = list(_tenant_sessions[key])
    sessions = [_sessions[sid] for sid in reversed(session_ids) if sid in _sessions]
    return [s.to_dict() for s in sessions]


def get_session(session_id: str) -> Optional[ChatSession]:
    """Return a full session with all turns."""
    return _sessions.get(session_id)
