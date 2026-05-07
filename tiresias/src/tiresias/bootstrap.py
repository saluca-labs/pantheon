from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import subprocess

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tiresias.config import TiresiasSettings
from tiresias.encryption.envelope import EnvelopeEncryption
from tiresias.encryption.providers import resolve_kek_provider
from tiresias.storage.schema import TiresiasLicense

logger = logging.getLogger(__name__)


def _to_sync_url(url: str) -> str:
    """Convert an async database URL to a sync one for Alembic.

    Strips '+asyncpg' from the scheme so that
    'postgresql+asyncpg://...' becomes 'postgresql://...'.
    """
    return url.replace("postgresql+asyncpg://", "postgresql://")


def run_auto_migrations() -> None:
    """Run Alembic migrations automatically on first boot (Postgres mode only).

    Skipped when TIRESIAS_DATABASE_URL is unset (SQLite / local mode).
    Failures are logged as warnings — the proxy continues regardless,
    since the tables may already exist from a prior manual migration.
    """
    db_url = os.environ.get("TIRESIAS_DATABASE_URL")
    if not db_url:
        logger.debug("TIRESIAS_DATABASE_URL not set — skipping auto-migration (SQLite mode).")
        return

    if not db_url.startswith("postgresql"):
        logger.debug("Non-Postgres database URL — skipping auto-migration.")
        return

    sync_url = _to_sync_url(db_url)

    # Alembic env.py reads from config.settings which expects
    # SOULAUTH_DATABASE_URL / SOULAUTH_DATABASE_URL_SYNC.
    # Inject the sync URL so Alembic can connect without extra config.
    env = os.environ.copy()
    env["SOULAUTH_DATABASE_URL"] = db_url
    env["SOULAUTH_DATABASE_URL_SYNC"] = sync_url

    logger.info("Running Alembic auto-migration (alembic upgrade head)...")
    try:
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            timeout=120,
            env=env,
        )
        if result.returncode == 0:
            stdout = result.stdout.strip()
            if "already" in stdout.lower() or not stdout:
                logger.info("Auto-migration: database already at head revision.")
            else:
                logger.info("Auto-migration succeeded:\n%s", stdout)
        else:
            logger.warning(
                "Auto-migration returned non-zero exit code %d.\nstdout: %s\nstderr: %s",
                result.returncode,
                result.stdout.strip(),
                result.stderr.strip(),
            )
    except subprocess.TimeoutExpired:
        logger.warning("Auto-migration timed out after 120 seconds — continuing without migration.")
    except FileNotFoundError:
        logger.warning("Alembic binary not found — skipping auto-migration.")
    except Exception:
        logger.warning("Auto-migration failed — continuing anyway.", exc_info=True)


def generate_api_key() -> str:
    """Generate a URL-safe random API key (43 characters)."""
    return secrets.token_urlsafe(32)


def hash_api_key(api_key: str) -> str:
    """Return SHA-256 hex digest of the API key for storage."""
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def verify_api_key(provided: str, stored_hash: str) -> bool:
    """Constant-time comparison of provided API key against stored hash."""
    provided_hash = hash_api_key(provided)
    return hmac.compare_digest(provided_hash, stored_hash)


async def first_boot(
    tenant_id: str,
    settings: TiresiasSettings,
    session: AsyncSession,
) -> str | None:
    """Initialize a tenant on first boot.

    - If a license row already exists for this tenant, returns None (no-op).
    - Otherwise: generates API key, resolves KEK provider, wraps DEK, creates license row.
    - Logs the API key prominently (only time it will ever appear in logs).

    Returns the plaintext API key on first boot, None on subsequent boots.
    """
    stmt = select(TiresiasLicense).where(TiresiasLicense.tenant_id == tenant_id)
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing is not None:
        logger.debug("Tenant %s already initialized -- skipping first boot.", tenant_id)
        return None

    # Generate API key (used for API auth, and optionally for local KEK derivation)
    api_key = generate_api_key()

    # Resolve KEK provider using factory — handles all 5 provider types
    provider = resolve_kek_provider(settings, api_key=api_key)

    # Generate and wrap DEK, create license row
    envelope = EnvelopeEncryption(provider)
    await envelope.create_dek_for_tenant(tenant_id, session)

    # Update license row with API key hash and full metadata
    stmt2 = select(TiresiasLicense).where(TiresiasLicense.tenant_id == tenant_id)
    result2 = await session.execute(stmt2)
    license_row = result2.scalar_one()
    license_row.api_key_hash = hash_api_key(api_key)
    license_row.retention_days = settings.retention_days
    await session.commit()

    # Log API key prominently — this is the only time it will appear
    border = "=" * 60
    logger.info(border)
    logger.info("TIRESIAS API KEY: %s", api_key)
    logger.info("Save this key -- it will not be shown again.")
    logger.info(border)

    return api_key
