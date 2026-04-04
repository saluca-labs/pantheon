"""
Trial self-service registration system.
Implements SPEC.md section 16 — trial provisioning with anti-abuse.
"""

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import Trial, SoulTenant, Soulkey
from src.auth.soulkey import issue_soulkey
from src.middleware.tenant import create_tenant

logger = structlog.get_logger(__name__)

# Trial configuration
TRIAL_DURATION_DAYS = 14
MAX_TRIALS_PER_DOMAIN = 3
MAX_TRIALS_PER_EMAIL = 1
VERIFICATION_TOKEN_LENGTH = 32


def normalize_email(email: str) -> str:
    """Normalize email: lowercase, strip +alias for gmail/googlemail."""
    email = email.strip().lower()
    local, _, domain = email.partition("@")
    if domain in ("gmail.com", "googlemail.com"):
        local = local.split("+")[0]
        local = local.replace(".", "")
    else:
        local = local.split("+")[0]
    return f"{local}@{domain}"


async def register_trial(
    db: AsyncSession,
    contact_name: str,
    contact_email: str,
    company_name: str,
    company_domain: str,
    use_case: Optional[str] = None,
) -> tuple[Trial, str]:
    """
    Register a new trial.
    Returns (trial_record, verification_token).
    Implements anti-abuse checks per SPEC.md section 16.4.
    """
    # Normalize email to prevent +alias abuse
    normalized_email = normalize_email(contact_email)

    # Anti-abuse: check email uniqueness (exact email match only)
    email_count = await db.execute(
        select(func.count(Trial.id)).where(
            Trial.contact_email == normalized_email,
            Trial.status.in_(["pending", "active", "verified"]),
        )
    )
    if (email_count.scalar() or 0) >= MAX_TRIALS_PER_EMAIL:
        raise ValueError(f"A trial already exists for {normalized_email}")

    # Generate verification token
    verification_token = secrets.token_urlsafe(VERIFICATION_TOKEN_LENGTH)

    trial = Trial(
        contact_name=contact_name,
        contact_email=normalized_email,
        company_name=company_name,
        company_domain=company_domain,
        use_case=use_case,
        verification_token=verification_token,
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(days=TRIAL_DURATION_DAYS),
    )
    db.add(trial)
    await db.flush()
    await db.refresh(trial)

    logger.info(
        "trial.registered",
        trial_id=str(trial.id),
        company=company_name,
        domain=company_domain,
    )

    return trial, verification_token


async def verify_and_activate_trial(
    db: AsyncSession, trial_id: uuid.UUID, token: str
) -> Optional[dict]:
    """
    Verify trial email and activate atomically within a single transaction.
    Clears verification_token after use to prevent replay.
    Returns activation details including the raw soulkey, or None on failure.
    """
    # Lock the trial row for update to prevent race conditions
    result = await db.execute(
        select(Trial).where(
            Trial.id == trial_id,
            Trial.verification_token == token,
            Trial.status == "pending",  # Must be exactly "pending"
        ).with_for_update()
    )
    trial = result.scalar_one_or_none()
    if not trial:
        return None

    # Check verification token expiry (24 hours from creation)
    if trial.created_at:
        created = trial.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > created + timedelta(hours=24):
            logger.warning("trial.token_expired", trial_id=str(trial_id))
            return None

    # Clear the verification token immediately to prevent reuse
    trial.verification_token = None
    trial.email_verified = True

    # Create tenant for the trial
    slug = trial.company_domain.replace(".", "-").lower()[:60]
    slug = "".join(c if c.isalnum() or c == "-" else "-" for c in slug)
    slug = slug.strip("-") or "trial"
    if len(slug) < 3:
        slug = f"trial-{slug}"

    tenant = await create_tenant(
        db=db,
        name=trial.company_name,
        slug=slug,
        tier="trial",
        metadata={
            "trial_id": str(trial.id),
            "contact_email": trial.contact_email,
            "use_case": trial.use_case,
        },
    )

    # Eagerly provision DEK for envelope encryption
    from src.middleware.tenant import provision_tenant_encryption
    await provision_tenant_encryption(db, str(tenant.id), tier=tenant.tier)

    # Issue a soulkey for the trial admin persona
    raw_key, soulkey = await issue_soulkey(
        db=db,
        tenant_id=tenant.id,
        persona_id="trial-admin",
        tenant_short=slug[:3],
        label=f"Trial admin key for {trial.company_name}",
        expires_at=trial.expires_at,
        metadata={"trial_id": str(trial.id)},
    )

    # Update trial with tenant and soulkey references
    trial.tenant_id = tenant.id
    trial.soulkey_id = soulkey.id
    trial.status = "active"
    trial.activated_at = datetime.now(timezone.utc)
    await db.flush()

    logger.info(
        "trial.activated",
        trial_id=str(trial_id),
        tenant_id=str(tenant.id),
        tenant_slug=slug,
    )

    return {
        "trial_id": trial.id,
        "tenant_id": tenant.id,
        "soulkey_id": soulkey.id,
        "raw_key": raw_key,
        "status": "active",
        "expires_at": trial.expires_at,
        "contact_name": trial.contact_name,
        "contact_email": trial.contact_email,
    }


async def verify_trial(
    db: AsyncSession, trial_id: uuid.UUID, token: str
) -> Optional[Trial]:
    """
    Verify trial email with token.
    Clears verification_token after use to prevent replay.
    Returns updated trial or None if verification fails.
    """
    result = await db.execute(
        select(Trial).where(
            Trial.id == trial_id,
            Trial.verification_token == token,
            Trial.status == "pending",
        ).with_for_update()
    )
    trial = result.scalar_one_or_none()
    if not trial:
        return None

    # Check verification token expiry (24 hours from creation)
    if trial.created_at:
        created = trial.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > created + timedelta(hours=24):
            logger.warning("trial.token_expired", trial_id=str(trial_id))
            return None

    # Clear verification token to prevent reuse
    trial.verification_token = None
    trial.email_verified = True
    trial.status = "verified"
    await db.flush()

    logger.info("trial.verified", trial_id=str(trial_id))
    return trial


async def activate_trial(
    db: AsyncSession, trial_id: uuid.UUID
) -> Optional[dict]:
    """
    Activate a verified trial -- provisions tenant and soulkey.
    Returns activation details including the raw soulkey.
    """
    result = await db.execute(
        select(Trial).where(
            Trial.id == trial_id,
            Trial.status == "verified",
            Trial.email_verified == True,
        ).with_for_update()
    )
    trial = result.scalar_one_or_none()
    if not trial:
        return None

    # Create tenant for the trial
    slug = trial.company_domain.replace(".", "-").lower()[:60]
    slug = "".join(c if c.isalnum() or c == "-" else "-" for c in slug)
    slug = slug.strip("-") or "trial"
    if len(slug) < 3:
        slug = f"trial-{slug}"

    tenant = await create_tenant(
        db=db,
        name=trial.company_name,
        slug=slug,
        tier="trial",
        metadata={
            "trial_id": str(trial.id),
            "contact_email": trial.contact_email,
            "use_case": trial.use_case,
        },
    )

    # Eagerly provision DEK for envelope encryption
    from src.middleware.tenant import provision_tenant_encryption
    await provision_tenant_encryption(db, str(tenant.id), tier=tenant.tier)

    # Issue a soulkey for the trial admin persona
    raw_key, soulkey = await issue_soulkey(
        db=db,
        tenant_id=tenant.id,
        persona_id="trial-admin",
        tenant_short=slug[:3],
        label=f"Trial admin key for {trial.company_name}",
        expires_at=trial.expires_at,
        metadata={"trial_id": str(trial.id)},
    )

    # Update trial with tenant and soulkey references
    trial.tenant_id = tenant.id
    trial.soulkey_id = soulkey.id
    trial.status = "active"
    trial.activated_at = datetime.now(timezone.utc)
    await db.flush()

    logger.info(
        "trial.activated",
        trial_id=str(trial_id),
        tenant_id=str(tenant.id),
        tenant_slug=slug,
    )

    return {
        "trial_id": trial.id,
        "tenant_id": tenant.id,
        "soulkey_id": soulkey.id,
        "raw_key": raw_key,
        "status": "active",
        "expires_at": trial.expires_at,
    }


async def expire_trials(db: AsyncSession) -> int:
    """Expire trials that have passed their expiration date. Returns count."""
    from sqlalchemy import update

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Trial).where(
            Trial.status == "active",
            Trial.expires_at < now,
        )
    )
    expired_trials = list(result.scalars().all())

    for trial in expired_trials:
        trial.status = "expired"
        # Revoke the trial soulkey (terminal state - cannot be reinstated)
        if trial.soulkey_id:
            from src.auth.soulkey import revoke_soulkey
            await revoke_soulkey(db, trial.soulkey_id, "system:expiry", "Trial expired")

    await db.flush()

    if expired_trials:
        logger.info("trial.expired_batch", count=len(expired_trials))

    return len(expired_trials)
