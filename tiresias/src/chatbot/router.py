"""
Chatbot router -- /v1/support/chat SSE streaming endpoint + history.

Extends the /v1/support prefix.

Routes:
  POST /v1/support/chat                      -- stream chat response (SSE)
  GET  /v1/support/chat/history              -- list sessions for tenant
  GET  /v1/support/chat/history/{session_id} -- get full session turns
"""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import AsyncGenerator, Optional

import httpx
import structlog
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.chatbot.actions import detect_action, execute_action
from src.chatbot.context import build_customer_context
from src.chatbot.escalation import escalate, should_escalate
from src.chatbot.history import append_turn, get_session, list_sessions
from src.chatbot.knowledge import search_knowledge

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/support", tags=["Support"])

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL_PRIMARY = "google/gemma-3-27b-it:free"
MODEL_FALLBACK = "openai/gpt-4o-mini"

# LLM generation parameters
MAX_RESPONSE_TOKENS = 600      # Cap response length to keep answers concise and cost-bounded
LLM_TEMPERATURE = 0.3           # Low temperature for factual, deterministic support answers
HISTORY_WINDOW = 10             # Number of most-recent turns sent to the LLM for context

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    history: list[ChatMessage] = Field(default_factory=list)
    session_id: Optional[str] = None


class SessionSummary(BaseModel):
    session_id: str
    tenant_id: Optional[str]
    created_at: float
    updated_at: float
    turn_count: int
    preview: str


class SessionDetail(BaseModel):
    session_id: str
    tenant_id: Optional[str]
    created_at: float
    updated_at: float
    turns: list  # [{role, content, timestamp}]


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------


def _sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


def _sse_token(token: str) -> str:
    return _sse("token", json.dumps({"token": token}))


def _sse_done(session_id: str, confidence: float, escalated: bool = False) -> str:
    return _sse("done", json.dumps({
        "session_id": session_id,
        "confidence": confidence,
        "escalated": escalated,
    }))


def _sse_error(msg: str) -> str:
    return _sse("error", json.dumps({"error": msg}))


def _sse_action(result: str) -> str:
    return _sse("action", json.dumps({"result": result}))


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

_SYSTEM_TEMPLATE = """\
You are the Tiresias AI support assistant. Tiresias is an enterprise AI agent security platform.
Answer questions about Tiresias features, configuration, APIs, and troubleshooting.
Be concise (2-4 sentences unless detail is requested). Ground all answers in the provided documentation.
If confidence is low, say so clearly and offer escalation to human support.

--- DOCUMENTATION CONTEXT ---
{doc_context}

--- CUSTOMER CONTEXT ---
{customer_context}

{action_context}--- INSTRUCTIONS ---
- Reference specific API endpoints or dashboard paths when relevant.
- For navigation: Overview, Traces, Sessions, Providers, Costs, Playground, Quarantine, Detection Feed, Detection > PRH, Detection > SIEM Config, Detection > Rules, Detection > Playbooks, Settings > API Keys, Settings > Billing.
- If the question is outside your knowledge, append CONFIDENCE:LOW at the end of your message.
- Respond in plain text. No markdown headers.
"""


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------


def _get_api_key() -> Optional[str]:
    try:
        from config.settings import get_settings  # type: ignore[import]
        settings = get_settings()
        key = getattr(settings, "openrouter_api_key", None)
        if key:
            return key
    except Exception:
        pass
    return os.environ.get("OPENROUTER_API_KEY")


async def _stream_openrouter(messages: list, api_key: str) -> AsyncGenerator[str, None]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://tiresias.network",
        "X-Title": "Tiresias Support Bot",
    }
    payload = {
        "model": MODEL_PRIMARY,
        "messages": messages,
        "stream": True,
        "max_tokens": MAX_RESPONSE_TOKENS,
        "temperature": LLM_TEMPERATURE,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        async with client.stream("POST", OPENROUTER_URL, json=payload, headers=headers) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                raise RuntimeError(f"OpenRouter {resp.status_code}: {body.decode()[:200]}")
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:]
                if raw.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(raw)
                    delta = chunk["choices"][0]["delta"].get("content", "")
                    if delta:
                        yield delta
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue


def _estimate_confidence(response: str) -> float:
    low_signals = ["confidence:low", "i don't know", "i'm not sure", "cannot find", "not certain"]
    return 0.3 if any(s in response.lower() for s in low_signals) else 0.85


def _build_transcript(history: list, user_message: str, assistant_message: str) -> str:
    lines = []
    for msg in history[-6:]:
        lines.append(f"{msg.role.upper()}: {msg.content[:200]}")
    lines.append(f"USER: {user_message[:200]}")
    lines.append(f"ASSISTANT: {assistant_message[:400]}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/chat")
async def chat(request: Request, body: ChatRequest) -> StreamingResponse:
    """
    Stream a support chat response via Server-Sent Events.

    SSE events:
      event: action  data: {"result": "..."}   (if action detected, sent before LLM tokens)
      event: token   data: {"token": "..."}
      event: done    data: {"session_id": "...", "confidence": 0.85, "escalated": false}
      event: error   data: {"error": "..."}
    """
    session_id = body.session_id or str(uuid.uuid4())
    tenant_id: Optional[str] = getattr(getattr(request, "state", None), "tenant_id", None)

    async def generate() -> AsyncGenerator[str, None]:
        try:
            api_key = _get_api_key()
            if not api_key:
                yield _sse_error("OpenRouter API key not configured.")
                return

            # --- Action detection (BOT-05) ---
            action_context = ""
            action_name = detect_action(body.message)
            if action_name:
                action_result = await execute_action(action_name, body.message)
                if action_result:
                    yield _sse_action(action_result)
                    action_context = (
                        f"--- ACTION RESULT (for context only) ---\n{action_result}\n\n"
                    )

            # --- Knowledge retrieval ---
            doc_chunks = search_knowledge(body.message, top_k=3)
            doc_context = "\n\n".join(
                f"[{c.source} / {c.heading}]\n{c.text}" for c in doc_chunks
            ) or "No relevant documentation found."

            # --- Customer context ---
            customer_context = await build_customer_context(request)

            # --- Build LLM messages ---
            system_content = _SYSTEM_TEMPLATE.format(
                doc_context=doc_context,
                customer_context=customer_context,
                action_context=action_context,
            )
            messages = [{"role": "system", "content": system_content}]
            for msg in body.history[-HISTORY_WINDOW:]:
                messages.append({"role": msg.role, "content": msg.content})
            messages.append({"role": "user", "content": body.message})

            # --- Stream LLM response ---
            full_response = ""
            t0 = time.monotonic()
            async for token in _stream_openrouter(messages, api_key):
                full_response += token
                yield _sse_token(token)

            elapsed = time.monotonic() - t0
            confidence = _estimate_confidence(full_response)

            logger.info(
                "chatbot.response_complete",
                session_id=session_id,
                elapsed_s=round(elapsed, 2),
                confidence=confidence,
                doc_chunks=len(doc_chunks),
                action=action_name,
            )

            # --- Persist history (BOT-07) ---
            await append_turn(
                tenant_id=tenant_id,
                session_id=session_id,
                user_message=body.message,
                assistant_message=full_response,
            )

            # --- Auto-escalation (BOT-06) ---
            escalated = False
            if should_escalate(body.message, confidence):
                transcript = _build_transcript(body.history, body.message, full_response)
                linear_url = await escalate(
                    tenant_id=tenant_id,
                    session_id=session_id,
                    user_message=body.message,
                    chat_transcript=transcript,
                    confidence=confidence,
                )
                escalated = True
                logger.info("chatbot.escalation_triggered", session_id=session_id, linear_url=linear_url)

            yield _sse_done(session_id, confidence, escalated)

        except Exception as exc:
            logger.error("chatbot.stream_error", error=str(exc))
            yield _sse_error(f"Chat error: {str(exc)[:200]}")

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/chat/history")
async def list_chat_history(request: Request) -> dict:
    """List chat session summaries for the current tenant."""
    tenant_id: Optional[str] = getattr(getattr(request, "state", None), "tenant_id", None)
    sessions = list_sessions(tenant_id)
    return {"sessions": sessions, "total": len(sessions)}


@router.get("/chat/history/{session_id}")
async def get_chat_session(session_id: str, request: Request) -> dict:
    """Get full turn history for a chat session."""
    tenant_id: Optional[str] = getattr(getattr(request, "state", None), "tenant_id", None)
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Tenant isolation: only return if session belongs to this tenant
    if session.tenant_id and tenant_id and session.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return {
        "session_id": session.session_id,
        "tenant_id": session.tenant_id,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
        "turns": [
            {"role": t.role, "content": t.content, "timestamp": t.timestamp}
            for t in session.turns
        ],
    }
