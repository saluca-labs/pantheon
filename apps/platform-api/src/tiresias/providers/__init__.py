from __future__ import annotations

from typing import Optional
from uuid import UUID

from .base import BaseProvider
from .openai import OpenAIProvider
from .anthropic import AnthropicProvider
from .gemini import GeminiProvider
from .groq import GroqProvider
from .ollama import OllamaProvider
from .openrouter import OpenRouterProvider

PROVIDER_MAP: dict[str, type[BaseProvider]] = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "groq": GroqProvider,
    "ollama": OllamaProvider,
    "openrouter": OpenRouterProvider,
}

_ENV_KEY_MAP = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GOOGLE_API_KEY",
    "groq": "GROQ_API_KEY",
    "ollama": "OLLAMA_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}

_DEFAULT_BASE_MAP = {
    "openai": "https://api.openai.com",
    "anthropic": "https://api.anthropic.com",
    "gemini": "https://generativelanguage.googleapis.com",
    "groq": "https://api.groq.com",
    "ollama": "http://localhost:11434",
    "openrouter": "https://openrouter.ai/api",
}


_ENV_BASE_MAP = {
    "openai": "OPENAI_BASE_URL",
    "anthropic": "ANTHROPIC_BASE_URL",
    "gemini": "GEMINI_BASE_URL",
    "groq": "GROQ_BASE_URL",
    "ollama": "OLLAMA_BASE_URL",
    "openrouter": "OPENROUTER_BASE_URL",
}


def build_provider(
    name: str,
    env: dict,
    api_base: str | None = None,
    tenant_id: Optional[UUID] = None,
) -> BaseProvider:
    """Instantiate a provider by name.

    Resolution order (W-H.2.e):
      1. If ``tenant_id`` is supplied, look up a per-tenant BYOK row in
         ``_tenant_provider_keys`` via
         :func:`src.agents.provider_keys_store.resolve_provider_credentials`.
         If that returns a non-empty (api_key, base_url) tuple, use them.
      2. Fall back to ``env[<PROVIDER>_API_KEY]`` and
         ``env[<PROVIDER>_BASE_URL]`` / hard-coded default base.

    The per-tenant path is ADDITIVE. Callers that do NOT pass a
    ``tenant_id`` (startup boot, cascade pre-build, background workers)
    keep the exact pre-W-H.2.e behavior: env-default only.

    Args:
        name:      Provider name (openai, anthropic, gemini, groq, ollama)
        env:       Environment variables dict (typically os.environ or a test dict)
        api_base:  Optional explicit base URL override. Wins over both
                   per-tenant base_url and env-default if supplied.
        tenant_id: Optional caller's tenant id. When provided, a
                   per-tenant override row may supply api_key + base_url.

    Raises:
        ValueError: If name is not a known provider.
    """
    name = name.lower().strip()
    if name not in PROVIDER_MAP:
        known = list(PROVIDER_MAP)
        raise ValueError(f"Unknown provider: {name!r}. Known providers: {known}")
    cls = PROVIDER_MAP[name]

    tenant_api_key: Optional[str] = None
    tenant_base_url: Optional[str] = None
    if tenant_id is not None:
        # Synchronous wrapper around the async resolver. We accept the
        # extra event-loop hop here so the upgrade is non-invasive — no
        # caller of build_provider() needs to become async. If we're
        # already inside a running loop (request handlers), we cannot
        # use asyncio.run(); fall back to threading the coroutine.
        try:
            tenant_api_key, tenant_base_url = _resolve_tenant_sync(name, tenant_id)
        except Exception:
            # Resolution failure → fall through to env-default. This is
            # the same fail-safe contract documented in
            # provider_keys_store.resolve_provider_credentials.
            tenant_api_key, tenant_base_url = None, None

    key_var = _ENV_KEY_MAP[name]
    api_key = tenant_api_key or env.get(key_var, "")
    base_env_var = _ENV_BASE_MAP.get(name)
    base = (
        api_base
        or tenant_base_url
        or (env.get(base_env_var, "") if base_env_var else "")
        or _DEFAULT_BASE_MAP[name]
    )
    return cls(api_key=api_key, api_base=base)


def _resolve_tenant_sync(
    provider: str, tenant_id: UUID
) -> tuple[Optional[str], Optional[str]]:
    """Sync bridge to :func:`resolve_provider_credentials`.

    Handles both "no running loop" (call from sync test / boot path) and
    "inside a running loop" (call from async FastAPI handler) cases. The
    latter happens because :func:`build_provider` itself is synchronous
    by design — callers like Tiresias's `_resolve_provider_for_model`
    are inside an async request handler but invoke the builder lazily.

    Uses ``asyncio.run`` when there is no loop and a short-lived thread
    + asyncio.run when there is one (avoids blocking the running loop).
    """
    import asyncio
    from src.agents.provider_keys_store import resolve_provider_credentials

    async def _go():
        return await resolve_provider_credentials(tenant_id, provider)

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        # No running loop — safe to call asyncio.run directly.
        return asyncio.run(_go())

    # We're inside an event loop. Run the coro in a worker thread with
    # its own loop so we don't deadlock.
    import concurrent.futures

    def _runner():
        return asyncio.run(_go())

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        future = ex.submit(_runner)
        return future.result(timeout=10.0)


__all__ = [
    "BaseProvider",
    "OpenAIProvider",
    "AnthropicProvider",
    "GeminiProvider",
    "GroqProvider",
    "OllamaProvider",
    "OpenRouterProvider",
    "PROVIDER_MAP",
    "build_provider",
]
