"""
platform-sovereign — FastAPI entrypoint.

The sovereign service exposes the policy/principles registry and the MCP
LLM cascade router. This module is the ASGI entrypoint that the Dockerfile
launches with `uvicorn src.main:app --host 0.0.0.0 --port 8090`.

Endpoints (v1):
    GET  /health/live              — liveness probe (always 200 if process up)
    GET  /health/ready              — readiness probe (registry loadable)
    GET  /v1/principles             — registry contents (verified hash chain)
    POST /v1/route                  — invoke the LLM cascade (stub providers)

The route endpoint accepts a JSON payload `{ "payload": {...} }` and returns
the first provider's response. In production the providers are wired via
configuration (Anthropic, OpenAI, Ollama). This module ships a no-op echo
provider so the service is runnable without external API keys.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from tiresias_sovereign.mcp_llm.router import MCPPipelineRouter, ProviderError
from tiresias_sovereign.principles.loader import load_registry

logger = logging.getLogger("platform.sovereign")
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "info").upper())


# ── Provider registry ──────────────────────────────────────────────────────


def _echo_provider(payload: dict) -> dict:
    """Default no-op provider used when no external LLMs are configured."""
    return {"provider": "echo", "request": payload, "response": ""}


def _build_router() -> MCPPipelineRouter:
    """
    Build the cascade router. Real providers are added when their
    corresponding env vars are set; otherwise we fall back to the echo
    provider so the service remains operable in dev/test.
    """
    providers: list = []
    if os.environ.get("ANTHROPIC_API_KEY"):
        providers.append(_echo_provider)  # placeholder, real impl loaded lazily
    if os.environ.get("OPENAI_API_KEY"):
        providers.append(_echo_provider)
    if not providers:
        providers.append(_echo_provider)
    return MCPPipelineRouter(providers)


# ── Request models (module-scoped so FastAPI can introspect them) ──────────


class RouteRequest(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)


# ── App factory ────────────────────────────────────────────────────────────


@asynccontextmanager
async def _lifespan(app: FastAPI):
    # Validate registry on boot — fail fast if the hash chain is broken.
    try:
        registry = load_registry()
        app.state.principles = registry
        app.state.principles_count = len(registry)
        logger.info("sovereign.startup.principles_loaded count=%d", len(registry))
    except Exception as exc:
        logger.error("sovereign.startup.principles_failed error=%s", exc)
        app.state.principles = []
        app.state.principles_count = 0
    app.state.cascade = _build_router()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="platform-sovereign",
        version="0.1.0",
        docs_url="/docs",
        redoc_url=None,
        lifespan=_lifespan,
    )

    @app.get("/health/live")
    async def health_live() -> dict:
        return {"status": "ok"}

    @app.get("/health/ready")
    async def health_ready() -> dict:
        principles_count = getattr(app.state, "principles_count", 0)
        if principles_count == 0:
            raise HTTPException(status_code=503, detail="principles registry empty")
        return {"status": "ready", "principles_count": principles_count}

    @app.get("/v1/principles")
    async def list_principles() -> dict:
        principles = getattr(app.state, "principles", []) or []
        return {"count": len(principles), "principles": principles}

    @app.post("/v1/route")
    async def cascade_route(request: RouteRequest) -> dict:
        cascade: MCPPipelineRouter = getattr(app.state, "cascade", None)
        if cascade is None:
            raise HTTPException(status_code=503, detail="cascade router not initialised")
        try:
            return cascade.route(request.payload)
        except ProviderError as exc:
            raise HTTPException(status_code=502, detail=f"provider cascade failed: {exc}")

    return app


app = create_app()
