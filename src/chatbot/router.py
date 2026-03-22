"""
Chatbot router -- /v1/support/chat SSE streaming endpoint.

Extends the /v1/support prefix. Streams grounded LLM responses using
OpenRouter (google/gemma-3-27b-it:free fallback openai/gpt-4o-mini).
Knowledge base chunks and customer context are injected into the system prompt.

Routes:
  POST /v1/support/chat          -- stream a chat response (SSE)
"""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import AsyncGenerator, Optional

import httpx
import structlog
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.chatbot.context import build_customer_context
from src.chatbot.knowledge import search_knowledge

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/v1/support", tags=["Support"])

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL_PRIMARY = "google/gemma-3-27b-it:free"
MODEL_FALLBACK = "openai/gpt-4o-mini"

# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    history: list[ChatMessage] = Field(default_factory=list)
    session_id: Optional[str] = None


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------


def _sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


def _sse_token(token: str) -> str:
    return _sse("token", json.dumps({"token": token}))


def _sse_done(session_id: str, confidence: float) -> str:
    return _sse("done", json.dumps({"session_id": session_id, "confidence": confidence}))


def _sse_error(msg: str) -> str:
    return _sse("error", json.dumps({"error": msg}))


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

_SYSTEM_TEMPLATE = (
    "You are the Tiresias AI support assistant. Tiresias is an enterprise AI agent security platform.\n"
    "Answer questions about Tiresias features, configuration, APIs, and troubleshooting.\n"
    "Be concise (2-4 sentences unless detail is requested). Ground all answers in the provided documentation.\n"
    "If confidence is low, say so clearly and offer escalation to human support.\n"
    "\n"
    "--- DOCUMENTATION CONTEXT ---\n"
    "{doc_context}\n"
    "\n"
    "--- CUSTOMER CONTEXT ---\n"
    "{customer_context}\n"
    "\n"
    "--- INSTRUCTIONS ---\n"
    "- Reference specific API endpoints or dashboard paths when relevant (e.g. \"go to Detection > PRH\").\n"
    "- For navigation questions, use the exact path format: Overview, Traces, Sessions, Providers, Costs, "
    "Playground, Quarantine, Detection Feed, Detection > PRH, Detection > SIEM Config, Detection > Rules, "
    "Detection > Playbooks, Settings > API Keys, Settings > Billing, Settings > White Label.\n"
    "- If the question is outside your knowledge, append CONFIDENCE:LOW at the end of your message.\n"
    "- Respond in plain text. No markdown headers or bullet points unless listing steps.\n"
)


# ---------------------------------------------------------------------------
# LLM streaming
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


async def _stream_openrouter(messages: list[dict], api_key: str) -> AsyncGenerator[str, None]:
    """Stream token deltas from OpenRouter. Yields raw content strings."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://tiresias.saluca.com",
        "X-Title": "Tiresias Support Bot",
    }
    payload = {
        "model": MODEL_PRIMARY,
        "messages": messages,
        "stream": True,
        "max_tokens": 600,
        "temperature": 0.3,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        async with client.stream("POST", OPENROUTER_URL, json=payload, headers=headers) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                raise RuntimeError(f"OpenRouter error {resp.status_code}: {body.decode()[:200]}")
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
    lower = response.lower()
    return 0.3 if any(s in lower for s in low_signals) else 0.85


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.post("/chat")
async def chat(request: Request, body: ChatRequest) -> StreamingResponse:
    """
    Stream a support chat response via Server-Sent Events.

    Client reads events:
      event: token  data: {"token": "..."}
      event: done   data: {"session_id": "...", "confidence": 0.85}
      event: error  data: {"error": "..."}
    """
    session_id = body.session_id or str(uuid.uuid4())

    async def generate() -> AsyncGenerator[str, None]:
        try:
            api_key = _get_api_key()
            if not api_key:
                yield _sse_error("OpenRouter API key not configured.")
                return

            # Knowledge retrieval
            doc_chunks = search_knowledge(body.message, top_k=3)
            doc_context = "\n\n".join(
                f"[{c.source} / {c.heading}]\n{c.text}" for c in doc_chunks
            ) or "No relevant documentation found."

            # Customer context
            customer_context = await build_customer_context(request)

            # Build messages
            system_content = _SYSTEM_TEMPLATE.format(
                doc_context=doc_context,
                customer_context=customer_context,
            )
            messages: list[dict] = [{"role": "system", "content": system_content}]
            for msg in body.history[-10:]:
                messages.append({"role": msg.role, "content": msg.content})
            messages.append({"role": "user", "content": body.message})

            # Stream
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
            )

            yield _sse_done(session_id, confidence)

            # Attempt to persist to history (plan 02 adds the module)
            try:
                from src.chatbot.history import append_turn  # type: ignore[import]
                tenant_id = getattr(getattr(request, "state", None), "tenant_id", None)
                await append_turn(
                    tenant_id=tenant_id,
                    session_id=session_id,
                    user_message=body.message,
                    assistant_message=full_response,
                )
            except ImportError:
                pass  # history module not yet available (plan 02)

        except Exception as exc:
            logger.error("chatbot.stream_error", error=str(exc))
            yield _sse_error(f"Chat error: {str(exc)[:200]}")

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
