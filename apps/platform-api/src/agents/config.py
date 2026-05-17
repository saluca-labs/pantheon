"""Read/write helpers for ``_pantheon_config`` (W-H.2.b).

Thin async accessors over the k/v table so the factory and the portal
API endpoints stay free of SQL details. Defaults are returned when the
row doesn't exist (handles fresh installs where 0041 has run but the
seed somehow didn't apply).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select

from src.database.connection import async_session_factory
from src.database.models import PantheonConfig


DEFAULT_AGENTS_STORE_KIND = "local"
DEFAULT_AGENTS_STORE_CONFIG: dict = {}


def _coerce_value(raw: Any) -> Any:
    """SQLite stores JSON as TEXT; Postgres returns dict/list directly.

    Normalize so callers always get the Python object.
    """
    if isinstance(raw, (dict, list, int, float, bool)) or raw is None:
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return raw
    return raw


async def get_config(key: str, default: Any = None) -> Any:
    """Read a single config value. Returns ``default`` if absent."""
    async with async_session_factory() as session:
        row = await session.get(PantheonConfig, key)
        if row is None:
            return default
        return _coerce_value(row.value)


async def set_config(key: str, value: Any) -> None:
    """Upsert a config value."""
    async with async_session_factory() as session:
        row = await session.get(PantheonConfig, key)
        if row is None:
            row = PantheonConfig(key=key, value=value)
            session.add(row)
        else:
            row.value = value
            row.updated_at = datetime.now(timezone.utc)
        await session.commit()


async def get_agents_store_config() -> tuple[str, dict]:
    """Return ``(kind, config_dict)`` for the agents store.

    Both fields default to the LocalPg config if missing, so a fresh
    install with no seed produces the same behavior as the default.
    """
    kind = await get_config("agents_store.kind", default=DEFAULT_AGENTS_STORE_KIND)
    if not isinstance(kind, str):
        kind = DEFAULT_AGENTS_STORE_KIND
    config = await get_config("agents_store.config", default=DEFAULT_AGENTS_STORE_CONFIG)
    if not isinstance(config, dict):
        config = DEFAULT_AGENTS_STORE_CONFIG
    return kind, config


async def set_agents_store_config(kind: str, config: Optional[dict] = None) -> None:
    """Write the agents-store kind + config in a single atomic-ish pair.

    Validates ``kind`` is one of the supported strings; the config payload
    is validated by the factory at construction time (so misconfigurations
    surface there with a useful error message rather than here).
    """
    if kind not in {"local", "supabase"}:
        raise ValueError(f"unsupported agents_store.kind: {kind!r}")
    await set_config("agents_store.kind", kind)
    await set_config("agents_store.config", config or {})
