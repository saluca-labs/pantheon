"""
PRH Middleware — scores prompt content in real-time during proxy pass-through.

Intercepts POST/PUT requests whose JSON body contains a "prompt", "messages",
or "content" field. Scores the extracted text using PRHAnalyzer, then:
  - If score >= auto_quarantine_threshold: blocks the request (HTTP 451)
  - If score >= threshold (but < auto_quarantine): emits Sigma event + audit log,
    adds X-PRH-Score / X-PRH-Category response headers, passes through
  - If score < threshold: passes through silently

Enabled only when:
  1. Tenant config has "enabled": True
  2. Request path starts with a proxied prefix (configurable, default /v1/proxy/)

Only runs if TenantContextMiddleware has populated request.state.tenant.
"""

from __future__ import annotations

import json
import uuid
from typing import Optional

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = structlog.get_logger(__name__)

# Paths where PRH analysis applies (any path starting with these prefixes)
PRH_WATCHED_PREFIXES = ["/v1/proxy/", "/v1/completions/", "/v1/chat/"]

# JSON body fields that may contain prompt text (checked in order)
PROMPT_FIELDS = ["prompt", "content", "input", "text", "query"]


def _extract_prompt(body: bytes) -> Optional[str]:
    """
    Extract prompt text from a JSON request body.
    Handles both flat {"prompt": "..."} and messages array formats.
    Returns None if no prompt field found or body is not JSON.
    """
    if not body:
        return None
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None

    if not isinstance(data, dict):
        return None

    # Flat field check
    for field in PROMPT_FIELDS:
        val = data.get(field)
        if isinstance(val, str) and val.strip():
            return val

    # OpenAI-style messages array: concatenate all user message content
    messages = data.get("messages")
    if isinstance(messages, list):
        parts = []
        for msg in messages:
            if isinstance(msg, dict):
                role = msg.get("role", "")
                content = msg.get("content", "")
                if role in ("user", "human") and isinstance(content, str):
                    parts.append(content)
        if parts:
            return " ".join(parts)

    return None


class PRHMiddleware(BaseHTTPMiddleware):
    """
    Starlette middleware that scores prompts via PRHAnalyzer before pass-through.
    Registered in main.py after TenantContextMiddleware.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Only watch specific path prefixes
        path = request.url.path
        if not any(path.startswith(prefix) for prefix in PRH_WATCHED_PREFIXES):
            return await call_next(request)

        # Only act on POST/PUT (methods that carry a body)
        if request.method not in ("POST", "PUT", "PATCH"):
            return await call_next(request)

        # Require tenant context (populated by TenantContextMiddleware)
        tenant = getattr(request.state, "tenant", None)
        if tenant is None:
            return await call_next(request)

        tenant_id_str = str(tenant.tenant_id)

        # Check per-tenant PRH enabled flag
        try:
            from src.prh._state import get_tenant_config
            config = get_tenant_config(tenant_id_str)
        except Exception:
            return await call_next(request)

        if not config.get("enabled", True):
            return await call_next(request)

        # Read and cache the body (Starlette streams are consumed once)
        try:
            body = await request.body()
        except Exception:
            return await call_next(request)

        prompt_text = _extract_prompt(body)
        if not prompt_text:
            return await call_next(request)

        # Score the prompt
        try:
            from src.prh._state import get_prh_analyzer
            analyzer = get_prh_analyzer()
            threshold = config.get("threshold", 0.5)
            result = analyzer.analyze(prompt_text, threshold=threshold)
        except Exception as exc:
            logger.warning("prh.middleware_analyze_error", error=str(exc))
            return await call_next(request)

        # Extract soulkey for audit/sigma context
        soulkey_id_str: Optional[str] = request.headers.get("X-SoulKey")

        logger.debug(
            "prh.middleware_scored",
            tenant_id=tenant_id_str,
            score=result.score,
            category=result.category,
            flagged=result.flagged,
            path=path,
        )

        auto_quarantine_threshold = config.get("auto_quarantine_threshold", 0.85)

        # --- AUTO-QUARANTINE BLOCK ---
        if result.score >= auto_quarantine_threshold:
            logger.warning(
                "prh.middleware_blocked",
                tenant_id=tenant_id_str,
                score=result.score,
                category=result.category,
                path=path,
            )
            # Fire Sigma event synchronously (no DB session available here)
            try:
                from src.prh.sigma_bridge import emit_prh_event
                emit_prh_event(
                    result,
                    tenant_id=tenant_id_str,
                    soulkey_id=soulkey_id_str,
                    prompt_snippet=prompt_text[:200],
                )
            except Exception as exc:
                logger.warning("prh.middleware_sigma_error", error=str(exc))

            return JSONResponse(
                status_code=451,
                content={
                    "error": "prompt_blocked",
                    "detail": "Prompt blocked by PRH policy.",
                    "prh_score": round(result.score, 4),
                    "prh_category": result.category,
                    "code": "PRH_AUTO_QUARANTINE",
                },
                headers={
                    "X-PRH-Score": str(round(result.score, 4)),
                    "X-PRH-Category": result.category or "unknown",
                    "X-PRH-Blocked": "true",
                },
            )

        # --- FLAGGED BUT NOT BLOCKED: emit Sigma + add headers, pass through ---
        if result.flagged:
            try:
                from src.prh.sigma_bridge import emit_prh_event
                emit_prh_event(
                    result,
                    tenant_id=tenant_id_str,
                    soulkey_id=soulkey_id_str,
                    prompt_snippet=prompt_text[:200],
                )
            except Exception as exc:
                logger.warning("prh.middleware_sigma_error", error=str(exc))

        response = await call_next(request)

        # Annotate response with PRH headers when flagged
        if result.flagged:
            response.headers["X-PRH-Score"] = str(round(result.score, 4))
            response.headers["X-PRH-Category"] = result.category or "unknown"

        return response
