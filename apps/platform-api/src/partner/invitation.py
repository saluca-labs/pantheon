"""
Partner invitation token system.
Admin creates invitation -> one-time code sent to approved partner.
Partner uses code to complete onboarding -> Stripe Connect Express.
"""

import os
import hashlib
import uuid
import structlog
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)


def generate_referral_code(partner_name: str) -> str:
    """Generate a unique referral code from partner name."""
    slug = partner_name.lower().replace(" ", "-")[:20]
    suffix = os.urandom(4).hex()
    return f"{slug}-{suffix}"


async def create_invitation(
    db: AsyncSession,
    partner_name: str,
    contact_email: str,
    created_by: str,
    commission_rate: float = 0.40,
    parent_partner_id: Optional[uuid.UUID] = None,
    ttl_days: int = 30,
) -> dict:
    """Create a one-time partner invitation token."""
    raw_token = f"pinv_{os.urandom(32).hex()}"
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    token_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=ttl_days)

    await db.execute(text("""
        INSERT INTO _partner_invitations
            (id, token_hash, partner_name, contact_email, commission_rate,
             parent_partner_id, created_by, expires_at, status, created_at)
        VALUES (:id, :hash, :name, :email, :rate, :parent, :by, :expires, 'active', :now)
    """), {
        "id": token_id,
        "hash": token_hash,
        "name": partner_name,
        "email": contact_email,
        "rate": commission_rate,
        "parent": str(parent_partner_id) if parent_partner_id else None,
        "by": created_by,
        "expires": expires_at,
        "now": now,
    })
    await db.commit()

    logger.info("partner.invitation_created", token_id=token_id, partner_name=partner_name)

    return {
        "token": raw_token,
        "token_id": token_id,
        "partner_name": partner_name,
        "contact_email": contact_email,
        "commission_rate": commission_rate,
        "expires_at": expires_at.isoformat(),
    }


async def validate_and_consume_invitation(
    db: AsyncSession,
    raw_token: str,
) -> Optional[dict]:
    """Validate and consume a partner invitation token. Returns invitation data or None."""
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    now = datetime.now(timezone.utc)

    result = await db.execute(text("""
        SELECT id, partner_name, contact_email, commission_rate,
               parent_partner_id, expires_at, status
        FROM _partner_invitations
        WHERE token_hash = :hash AND status = 'active'
    """), {"hash": token_hash})
    row = result.first()

    if not row:
        return None

    token_id, name, email, rate, parent_id, expires_at, status = row

    if now > expires_at:
        await db.execute(text(
            "UPDATE _partner_invitations SET status = 'expired' WHERE id = :id"
        ), {"id": token_id})
        await db.commit()
        return None

    # Consume
    await db.execute(text(
        "UPDATE _partner_invitations SET status = 'consumed', consumed_at = :now WHERE id = :id"
    ), {"id": token_id, "now": now})
    await db.commit()

    return {
        "token_id": token_id,
        "partner_name": name,
        "contact_email": email,
        "commission_rate": rate,
        "parent_partner_id": str(parent_id) if parent_id else None,
    }
