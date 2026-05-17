"""Per-tenant provider keys store (Wave H.2.e BYOK).

Lightweight async CRUD over ``_tenant_provider_keys`` plus the
:func:`resolve_provider_credentials` helper that Tiresias's
``build_provider`` calls when ``tenant_id`` is passed.

Design choices:
  * No ABC adapter (LocalPg ↔ Supabase) for now — provider keys are
    always physically co-located with pantheon's main DB regardless of
    where ``_agos_agents`` / ``_agos_prompts`` live, because credentials
    must be reachable BEFORE tenant-store dispatch. Can be promoted to a
    pluggable adapter in a future sub if a use case appears.
  * Resolution failures degrade silently to (None, None) so callers
    transparently fall back to the platform env-default. Loud failures
    only happen at create/update time via :func:`resolve_secret_ref`
    validation in the CRUD router (see provider_keys_router.py).
  * Never logs or echoes the resolved secret value.
"""

from __future__ import annotations

import time
import uuid as _uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import delete, select, text

from src.agents.secret_ref import resolve_secret_ref
from src.database.connection import async_session_factory
from src.database.models import TenantProviderKey as _ORM_Row


SUPPORTED_PROVIDERS = ("anthropic", "openai", "gemini", "groq", "ollama")
VALID_STATUSES = ("active", "disabled")


# ---------------------------------------------------------------------------
# Dataclass wire model
# ---------------------------------------------------------------------------


@dataclass
class TenantProviderKey:
    """In-memory view of a ``_tenant_provider_keys`` row.

    Distinct from the SQLAlchemy ORM class
    (``src.database.models.TenantProviderKey``) so the wire/store layer
    can evolve independently of the schema.
    """

    id: UUID
    tenant_id: UUID
    provider: str
    secret_ref: str
    base_url: Optional[str]
    status: str
    metadata: dict = field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""
    created_by: Optional[UUID] = None


def _iso(dt: Optional[datetime]) -> str:
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _from_row(row: _ORM_Row) -> TenantProviderKey:
    return TenantProviderKey(
        id=row.id if isinstance(row.id, UUID) else UUID(str(row.id)),
        tenant_id=row.tenant_id if isinstance(row.tenant_id, UUID)
                  else UUID(str(row.tenant_id)),
        provider=row.provider,
        secret_ref=row.secret_ref,
        base_url=row.base_url,
        status=row.status,
        metadata=dict(row.metadata_ or {}),
        created_at=_iso(row.created_at),
        updated_at=_iso(row.updated_at),
        created_by=(
            row.created_by if (row.created_by is None or isinstance(row.created_by, UUID))
            else UUID(str(row.created_by))
        ),
    )


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


async def list_tenant_provider_keys(
    tenant_id: UUID, provider: Optional[str] = None
) -> list[TenantProviderKey]:
    """List all per-tenant provider keys for the given tenant.

    Optionally filtered by provider. Returns an empty list if the tenant
    has no overrides.
    """
    async with async_session_factory() as session:
        stmt = select(_ORM_Row).where(_ORM_Row.tenant_id == tenant_id)
        if provider is not None:
            stmt = stmt.where(_ORM_Row.provider == provider.lower())
        stmt = stmt.order_by(_ORM_Row.provider.asc())
        result = await session.execute(stmt)
        return [_from_row(r) for r in result.scalars()]


async def get_tenant_provider_key(key_id: UUID) -> Optional[TenantProviderKey]:
    """Get one row by primary key.

    NOT tenant-scoped at this layer — the router is responsible for
    enforcing cross-tenant rejection (see provider_keys_router.py).
    """
    async with async_session_factory() as session:
        row = await session.get(_ORM_Row, key_id)
        return _from_row(row) if row else None


async def get_tenant_provider_key_by_provider(
    tenant_id: UUID, provider: str
) -> Optional[TenantProviderKey]:
    """Lookup by the natural (tenant_id, provider) key."""
    async with async_session_factory() as session:
        stmt = select(_ORM_Row).where(
            _ORM_Row.tenant_id == tenant_id,
            _ORM_Row.provider == provider.lower(),
        )
        row = (await session.execute(stmt)).scalar_one_or_none()
        return _from_row(row) if row else None


async def upsert_tenant_provider_key(
    tenant_id: UUID,
    provider: str,
    secret_ref: str,
    base_url: Optional[str] = None,
    status: str = "active",
    metadata: Optional[dict] = None,
    created_by: Optional[UUID] = None,
) -> TenantProviderKey:
    """Insert-or-update by (tenant_id, provider).

    The unique constraint at the DB level ensures there is at most one
    row per (tenant, provider). On update, all mutable fields
    (secret_ref, base_url, status, metadata) are replaced; created_at
    and created_by are preserved from the existing row.
    """
    provider_norm = provider.lower().strip()
    async with async_session_factory() as session:
        stmt = select(_ORM_Row).where(
            _ORM_Row.tenant_id == tenant_id,
            _ORM_Row.provider == provider_norm,
        )
        existing = (await session.execute(stmt)).scalar_one_or_none()

        if existing is not None:
            existing.secret_ref = secret_ref
            existing.base_url = base_url
            existing.status = status
            existing.metadata_ = dict(metadata or {})
            existing.updated_at = datetime.now(timezone.utc)
            await session.commit()
            await session.refresh(existing)
            return _from_row(existing)

        row = _ORM_Row(
            id=_uuid.uuid4(),
            tenant_id=tenant_id,
            provider=provider_norm,
            secret_ref=secret_ref,
            base_url=base_url,
            status=status,
            metadata_=dict(metadata or {}),
            created_by=created_by,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _from_row(row)


async def update_tenant_provider_key(
    key_id: UUID, patch: dict
) -> Optional[TenantProviderKey]:
    """Update mutable fields of a row by ID. Returns None if not found.

    Whitelist of mutable fields: ``secret_ref``, ``base_url``,
    ``status``, ``metadata``. Other keys are silently dropped (keeps
    wire/store decoupled).
    """
    _ALLOWED = frozenset({"secret_ref", "base_url", "status", "metadata"})
    clean: dict = {}
    for k, v in (patch or {}).items():
        if k not in _ALLOWED:
            continue
        if k == "metadata":
            clean["metadata_"] = dict(v or {})
        else:
            clean[k] = v
    async with async_session_factory() as session:
        row = await session.get(_ORM_Row, key_id)
        if row is None:
            return None
        for k, v in clean.items():
            setattr(row, k, v)
        row.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(row)
        return _from_row(row)


async def delete_tenant_provider_key(key_id: UUID) -> bool:
    """Hard-delete by ID. Returns True if a row was removed."""
    async with async_session_factory() as session:
        row = await session.get(_ORM_Row, key_id)
        if row is None:
            return False
        await session.delete(row)
        await session.commit()
        return True


# ---------------------------------------------------------------------------
# Tiresias-facing resolver
# ---------------------------------------------------------------------------


async def resolve_provider_credentials(
    tenant_id: UUID, provider: str
) -> tuple[Optional[str], Optional[str]]:
    """Resolve (api_key, base_url) for a tenant+provider override.

    Returns ``(None, None)`` if no per-tenant override exists, OR the row
    is disabled, OR the secret URI fails to resolve. Callers (chiefly
    :func:`src.tiresias.providers.build_provider`) should treat this
    sentinel as "fall back to env-default" — there is intentionally no
    way to distinguish "no row" from "broken secret ref" at this layer,
    because both should behave identically for the proxy: degrade to
    platform-default.

    Loud failures (broken secret ref, wrong scheme) surface at
    write-time via the CRUD router's `/test` endpoint.
    """
    if not isinstance(tenant_id, UUID):
        try:
            tenant_id = UUID(str(tenant_id))
        except (ValueError, TypeError):
            return None, None

    try:
        row = await get_tenant_provider_key_by_provider(tenant_id, provider)
    except Exception:
        # DB error → fall back to env-default rather than failing the request.
        return None, None

    if row is None or row.status != "active":
        return None, None

    try:
        api_key = resolve_secret_ref(row.secret_ref)
    except Exception:
        # Resolution failure (env var unset, unsupported scheme, …) → fall back.
        return None, None

    return api_key, row.base_url


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


async def health_check() -> dict:
    """Simple ping for monitoring. Mirrors the pattern in local_pg_store."""
    t0 = time.perf_counter()
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
        return {
            "ok": True,
            "latency_ms": int((time.perf_counter() - t0) * 1000),
        }
    except Exception as e:
        return {
            "ok": False,
            "latency_ms": int((time.perf_counter() - t0) * 1000),
            "error": str(e),
        }


__all__ = [
    "SUPPORTED_PROVIDERS",
    "VALID_STATUSES",
    "TenantProviderKey",
    "list_tenant_provider_keys",
    "get_tenant_provider_key",
    "get_tenant_provider_key_by_provider",
    "upsert_tenant_provider_key",
    "update_tenant_provider_key",
    "delete_tenant_provider_key",
    "resolve_provider_credentials",
    "health_check",
]
