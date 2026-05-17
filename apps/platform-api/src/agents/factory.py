"""Runtime selector for AgentStore + PromptStore (W-H.2.b).

Reads ``_pantheon_config`` to decide which backend to instantiate. The
returned stores are NOT cached globally — each call constructs a fresh
instance, which is cheap because:

  * LocalPg* uses the shared `async_session_factory` (no setup cost).
  * Supabase* holds only a base URL + key string + http timeout (no
    long-lived client; each call creates an ``httpx.AsyncClient``).

Callers that want a per-process singleton can wrap this with their own
cache, but for fastapi-router use it's fine to call per request.
"""

from __future__ import annotations

from typing import Optional

from src.agents.config import get_agents_store_config
from src.agents.local_pg_store import LocalPgAgentStore, LocalPgPromptStore
from src.agents.secret_ref import resolve_secret_ref
from src.agents.store import AgentStore, PromptStore
from src.agents.supabase_store import SupabaseAgentStore, SupabasePromptStore


class FactoryError(RuntimeError):
    """Raised when agents-store config is invalid or unresolvable."""


def _build_supabase_args(config: dict) -> tuple[str, str]:
    """Validate and unpack a Supabase config payload.

    Expected payload::

        {
            "url": "https://xxxxx.supabase.co",
            "service_role_key_ref": "env://SUPABASE_SERVICE_ROLE_KEY"
        }
    """
    url = config.get("url")
    ref = config.get("service_role_key_ref")
    if not url or not isinstance(url, str):
        raise FactoryError(
            "supabase config missing 'url' (e.g. https://xxxxx.supabase.co)"
        )
    if not ref or not isinstance(ref, str):
        raise FactoryError(
            "supabase config missing 'service_role_key_ref' "
            "(e.g. env://SUPABASE_SERVICE_ROLE_KEY)"
        )
    try:
        key = resolve_secret_ref(ref)
    except Exception as e:
        raise FactoryError(f"could not resolve service_role_key_ref: {e}") from e
    return url, key


async def get_agent_store(
    kind: Optional[str] = None,
    config: Optional[dict] = None,
) -> AgentStore:
    """Build the configured AgentStore.

    If ``kind`` and ``config`` are passed explicitly (e.g. by the
    test-connection endpoint trying a proposed but-not-saved config),
    they override the persisted values.
    """
    if kind is None:
        kind, persisted_config = await get_agents_store_config()
        if config is None:
            config = persisted_config

    if kind == "local":
        return LocalPgAgentStore()
    if kind == "supabase":
        url, key = _build_supabase_args(config or {})
        return SupabaseAgentStore(url=url, service_role_key=key)
    raise FactoryError(f"unknown agents_store.kind: {kind!r}")


async def get_prompt_store(
    kind: Optional[str] = None,
    config: Optional[dict] = None,
) -> PromptStore:
    """Build the configured PromptStore (mirrors ``get_agent_store``)."""
    if kind is None:
        kind, persisted_config = await get_agents_store_config()
        if config is None:
            config = persisted_config

    if kind == "local":
        return LocalPgPromptStore()
    if kind == "supabase":
        url, key = _build_supabase_args(config or {})
        return SupabasePromptStore(url=url, service_role_key=key)
    raise FactoryError(f"unknown agents_store.kind: {kind!r}")
