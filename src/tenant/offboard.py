"""
Tenant offboarding cascade — secure DEK destruction and data cleanup.

Offboard sequence:
1. Revoke all soulkeys for the tenant
2. Destroy wrapped DEK (zero-fill then NULL)
3. NULL all encrypted prompt/completion fields
4. Set tenant status to 'deactivated'
5. Audit-log the entire cascade

After retention period, hard-delete is handled by retention.py.
"""

import uuid
import structlog
from datetime import datetime, timezone

from sqlalchemy import text, update, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import SoulTenant, Soulkey

logger = structlog.get_logger(__name__)


async def offboard_tenant(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    offboarded_by: str = "admin",
    purge_dek: bool = True,
) -> dict:
    """
    Execute the full tenant offboarding cascade.

    Args:
        db: Async DB session
        tenant_id: Tenant to offboard
        offboarded_by: Identity performing the offboard (for audit)
        purge_dek: If True, destroy the wrapped DEK (crypto-shred)

    Returns:
        Dict with counts of affected resources
    """
    now = datetime.now(timezone.utc)
    results = {
        "tenant_id": str(tenant_id),
        "soulkeys_revoked": 0,
        "dek_destroyed": False,
        "records_scrubbed": 0,
        "status": "deactivated",
    }

    # Step 1: Revoke all active soulkeys
    revoke_result = await db.execute(text("""
        UPDATE _soulkeys
        SET status = 'revoked',
            revoked_at = :now,
            revoked_by = :by,
            revocation_reason = 'tenant_offboarded'
        WHERE tenant_id = :tid AND status IN ('active', 'suspended')
    """), {"tid": str(tenant_id), "now": now, "by": offboarded_by})
    results["soulkeys_revoked"] = revoke_result.rowcount

    # Step 2: Destroy wrapped DEK (crypto-shred)
    if purge_dek:
        # Zero-fill the wrapped_dek column before NULLing
        # This ensures the key material is overwritten even if the DB page is cached
        await db.execute(text("""
            UPDATE tiresias_licenses
            SET wrapped_dek = decode(repeat('00', length(wrapped_dek)), 'hex')
            WHERE tenant_id = :tid AND wrapped_dek IS NOT NULL
        """), {"tid": str(tenant_id)})
        await db.execute(text("""
            UPDATE tiresias_licenses
            SET wrapped_dek = NULL
            WHERE tenant_id = :tid
        """), {"tid": str(tenant_id)})
        results["dek_destroyed"] = True

    # Step 3: NULL encrypted fields in audit log (immediate scrub, don't wait for retention)
    scrub_result = await db.execute(text("""
        UPDATE tiresias_audit_log
        SET encrypted_prompt = NULL,
            encrypted_completion = NULL,
            deleted_at = :now
        WHERE tenant_id = :tid
          AND deleted_at IS NULL
    """), {"tid": str(tenant_id), "now": now})
    results["records_scrubbed"] = scrub_result.rowcount

    # Step 4: Deactivate tenant
    await db.execute(text("""
        UPDATE _soul_tenants
        SET status = 'deactivated',
            updated_at = :now
        WHERE id = :tid
    """), {"tid": str(tenant_id), "now": now})

    await db.commit()

    # Step 5: Audit log
    try:
        from src.audit.logger import log_auth_event
        await log_auth_event(
            db=db,
            tenant_id=tenant_id,
            event_type="tenant_offboarded",
            soulkey_id=None,
            persona_id="system",
            resource="tenant",
            action="offboard",
            scope="system",
            decision="allow",
            reason=f"Offboarded by {offboarded_by}",
            context={
                "soulkeys_revoked": results["soulkeys_revoked"],
                "dek_destroyed": results["dek_destroyed"],
                "records_scrubbed": results["records_scrubbed"],
            },
        )
    except Exception as e:
        logger.warning("offboard.audit_failed", error=str(e))

    logger.info(
        "tenant.offboarded",
        tenant_id=str(tenant_id),
        soulkeys_revoked=results["soulkeys_revoked"],
        dek_destroyed=results["dek_destroyed"],
        records_scrubbed=results["records_scrubbed"],
    )

    return results
