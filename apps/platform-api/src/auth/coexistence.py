"""
Coexistence layer for legacy sk_soul_* tenant API keys.
Implements SPEC.md section 11 — parallel auth system support.
Allows existing sk_soul_* keys to work alongside soulauth soulkeys
during the transition period.
"""

import hashlib
import re
from typing import Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import Soulkey, SoulTenant

logger = structlog.get_logger(__name__)

# Legacy key format: sk_soul_<tenant>_<hex>
LEGACY_KEY_PATTERN = re.compile(r"^sk_soul_([a-zA-Z0-9_]+)_[a-f0-9]+$")

# New key format: sk_agent_<tenant>_<persona>_<hex>
SOULAUTH_KEY_PATTERN = re.compile(r"^sk_agent_([a-zA-Z0-9_]+)_([a-zA-Z0-9_-]+)_[a-f0-9]+$")


def detect_key_type(raw_key: str) -> str:
    """
    Detect whether a key is a legacy sk_soul_* key or a soulauth sk_agent_* key.
    Returns: 'soulauth', 'legacy', or 'unknown'
    """
    if SOULAUTH_KEY_PATTERN.match(raw_key):
        return "soulauth"
    if LEGACY_KEY_PATTERN.match(raw_key):
        return "legacy"
    return "unknown"


def extract_tenant_from_legacy_key(raw_key: str) -> Optional[str]:
    """Extract tenant slug from a legacy sk_soul_* key."""
    match = LEGACY_KEY_PATTERN.match(raw_key)
    if match:
        return match.group(1)
    return None


async def resolve_legacy_key(
    db: AsyncSession, raw_key: str
) -> Optional[dict]:
    """
    Resolve a legacy sk_soul_* key.
    Returns a compatibility dict that can be used like a soulkey identity.
    In production, this would check the legacy key store.
    For now, it maps to a tenant-level service account identity.
    """
    tenant_slug = extract_tenant_from_legacy_key(raw_key)
    if not tenant_slug:
        return None

    # Look up tenant by slug
    result = await db.execute(
        select(SoulTenant).where(SoulTenant.slug == tenant_slug)
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        logger.warning(
            "coexistence.tenant_not_found",
            tenant_slug=tenant_slug,
        )
        return None

    # Return a compatibility identity
    # Legacy keys map to a "service-account" persona with admin-level access
    return {
        "type": "legacy",
        "tenant_id": tenant.id,
        "tenant_slug": tenant_slug,
        "persona_id": "service-account",
        "status": "active",
        "label": f"Legacy API key for {tenant_slug}",
    }


async def resolve_any_key(
    db: AsyncSession, raw_key: str
) -> tuple[str, Optional[dict]]:
    """
    Resolve any key type — soulauth or legacy.
    Returns (key_type, identity_dict_or_soulkey).
    """
    key_type = detect_key_type(raw_key)

    if key_type == "soulauth":
        from src.auth.soulkey import resolve_identity
        soulkey = await resolve_identity(db, raw_key)
        if soulkey:
            return "soulauth", {
                "type": "soulauth",
                "soulkey_id": soulkey.id,
                "tenant_id": soulkey.tenant_id,
                "persona_id": soulkey.persona_id,
                "status": soulkey.status,
                "label": soulkey.label,
            }
        return "soulauth", None

    elif key_type == "legacy":
        identity = await resolve_legacy_key(db, raw_key)
        return "legacy", identity

    return "unknown", None
