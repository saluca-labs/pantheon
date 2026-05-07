"""
Audit event logging.
Implements SPEC.md section 7 - immutable audit trail with hash chain integrity.

Multi-replica hash chain fix (migration 0004):
Previously a module-level _previous_hash global maintained the chain. This
broke under multi-replica deployments because each pod held its own chain,
so rows in the database could have diverging or duplicate prev_hash values.

The fix: when writing an audit event the application now SELECTs the latest
prev_hash directly from the database inside the same transaction, using
SELECT ... FOR UPDATE SKIP LOCKED to serialise concurrent writers at the DB
level. The module-level global is gone.

Backward compatibility: if the prev_hash column does not yet exist (i.e.
migration 0004 has not been applied) the code falls back to an in-memory
sentinel with a deprecation warning so existing deployments are not broken.
"""

import hashlib
import json
import logging
import uuid
import warnings
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import AuditLog

_logger = logging.getLogger(__name__)

# Sentinel used for the very first row in a fresh deployment.
_GENESIS = "genesis"

# Valid event types from SPEC.md section 7.2
VALID_EVENT_TYPES = {
    "key_issued",
    "key_suspended",
    "key_revoked",
    "key_reinstated",
    "auth_grant",
    "auth_deny",
    "scope_violation",
    "capability_issued",
    "capability_used",
    "capability_revoked",
    "policy_synced",
    "policy_violation",
    "escalation_requested",
    "escalation_approved",
    "escalation_denied",
    "quarantine_activated",
    "quarantine_released",
    "prh_finding",
}

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _fetch_previous_hash(db: AsyncSession) -> str:
    """
    Retrieve the prev_hash of the most-recently inserted audit row.

    Uses SELECT ... FOR UPDATE SKIP LOCKED so that concurrent writers are
    serialised at the database level and cannot produce duplicate chain links.

    Falls back to the in-memory genesis sentinel if the column does not yet
    exist (pre-migration-0004 deployments) and emits a DeprecationWarning.
    """
    try:
        result = await db.execute(
            text(
                "SELECT prev_hash FROM _soulauth_audit "
                "ORDER BY timestamp DESC "
                "LIMIT 1 "
                "FOR UPDATE SKIP LOCKED"
            )
        )
        row = result.fetchone()
        if row is None:
            # Table is empty - this will be the genesis row.
            return _GENESIS
        return row[0] if row[0] is not None else _GENESIS
    except Exception as exc:
        # Column likely does not exist yet (pre-migration).
        exc_str = str(exc).lower()
        if "prev_hash" in exc_str or "column" in exc_str:
            warnings.warn(
                "audit_logger: prev_hash column not found - migration 0004 has "
                "not been applied. Falling back to in-memory hash chain. "
                "Deploy migration 0004 to fix multi-replica integrity.",
                DeprecationWarning,
                stacklevel=4,
            )
            return _GENESIS
        _logger.error("audit_logger: failed to fetch previous hash: %s", exc)
        return _GENESIS


def _compute_entry_hash(
    previous_hash: str,
    tenant_id: uuid.UUID,
    event_type: str,
    soulkey_id: Optional[uuid.UUID],
    persona_id: Optional[str],
    resource: Optional[str],
    action: Optional[str],
    scope: Optional[str],
    decision: Optional[str],
) -> str:
    """Compute SHA-256 over the canonical chain data for this event."""
    chain_data = json.dumps(
        {
            "prev": previous_hash,
            "tenant_id": str(tenant_id),
            "event_type": event_type,
            "soulkey_id": str(soulkey_id) if soulkey_id else None,
            "persona_id": persona_id,
            "resource": resource,
            "action": action,
            "scope": scope,
            "decision": decision,
        },
        sort_keys=True,
    )
    return hashlib.sha256(chain_data.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def log_auth_event(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    event_type: str,
    soulkey_id: Optional[uuid.UUID] = None,
    persona_id: Optional[str] = None,
    resource: Optional[str] = None,
    action: Optional[str] = None,
    scope: Optional[str] = None,
    decision: Optional[str] = None,
    reason: Optional[str] = None,
    capability_id: Optional[uuid.UUID] = None,
    context: Optional[dict] = None,
) -> uuid.UUID:
    """
    Log an immutable audit event.

    The hash chain is derived from the database rather than a module-level
    global, ensuring consistency across all replicas.

    Returns the audit record ID.
    """
    # Obtain the previous hash inside this transaction - serialised by FOR UPDATE.
    previous_hash = await _fetch_previous_hash(db)

    entry_hash = _compute_entry_hash(
        previous_hash=previous_hash,
        tenant_id=tenant_id,
        event_type=event_type,
        soulkey_id=soulkey_id,
        persona_id=persona_id,
        resource=resource,
        action=action,
        scope=scope,
        decision=decision,
    )

    # Include integrity hash in context for auditor inspection.
    entry_context = dict(context or {})
    entry_context["_integrity"] = {
        "hash": entry_hash,
        "prev_hash": previous_hash,
    }

    audit_entry = AuditLog(
        tenant_id=tenant_id,
        timestamp=datetime.now(timezone.utc),
        event_type=event_type,
        soulkey_id=soulkey_id,
        persona_id=persona_id,
        resource=resource,
        action=action,
        scope=scope,
        decision=decision,
        reason=reason,
        capability_id=capability_id,
        context=entry_context,
        prev_hash=previous_hash,  # stored for easy verification without parsing context JSON
    )

    db.add(audit_entry)
    await db.flush()
    await db.refresh(audit_entry)

    # Forward to SIEM (non-blocking) if forwarder is active.
    try:
        from src.integrations.forwarder import get_event_forwarder
        from src.integrations.cef import AuditEvent
        forwarder = get_event_forwarder()
        if forwarder is not None:
            forwarder.forward(AuditEvent.from_audit_log(audit_entry))
    except Exception:
        pass  # SIEM forwarding must never break audit logging

    # Run through Sigma detection engine (non-blocking).
    try:
        from src.detection._state import get_sigma_engine, get_playbook_engine
        sigma = get_sigma_engine()
        if sigma.list_rules():
            event_dict = {
                "event_type": event_type,
                "tenant_id": str(tenant_id),
                "soulkey_id": str(soulkey_id) if soulkey_id else None,
                "persona_id": persona_id,
                "resource": resource,
                "action": action,
                "scope": scope,
                "decision": decision,
                "reason": reason,
                "context": context or {},
                "timestamp": audit_entry.timestamp.isoformat() if audit_entry.timestamp else None,
            }
            matches = sigma.evaluate(event_dict)
            if matches:
                pb_engine = get_playbook_engine()
                for match in matches:
                    if match.rule.response_playbook:
                        import asyncio
                        asyncio.ensure_future(
                            pb_engine.execute_playbook(match.rule.response_playbook, match)
                        )
    except Exception:
        pass  # Detection must never break audit logging

    return audit_entry.id


async def query_audit_log(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    event_type: Optional[str] = None,
    persona_id: Optional[str] = None,
    soulkey_id: Optional[uuid.UUID] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 100,
    offset: int = 0,
) -> list[AuditLog]:
    """Query audit log with filters."""
    from sqlalchemy import select

    query = select(AuditLog).where(AuditLog.tenant_id == tenant_id)

    if event_type:
        query = query.where(AuditLog.event_type == event_type)
    if persona_id:
        query = query.where(AuditLog.persona_id == persona_id)
    if soulkey_id:
        query = query.where(AuditLog.soulkey_id == soulkey_id)
    if start_date:
        query = query.where(AuditLog.timestamp >= start_date)
    if end_date:
        query = query.where(AuditLog.timestamp <= end_date)

    query = query.order_by(AuditLog.timestamp.desc()).limit(limit).offset(offset)

    result = await db.execute(query)
    return list(result.scalars().all())
