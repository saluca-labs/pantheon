"""
Audit event logging.
Implements SPEC.md section 7 — immutable audit trail with hash chain integrity.
"""

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import AuditLog

# Previous entry hash for chain integrity
_previous_hash: str = "genesis"


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
    Returns the audit record ID.
    """
    global _previous_hash

    # Compute hash chain entry for tamper detection
    chain_data = json.dumps({
        "prev": _previous_hash,
        "tenant_id": str(tenant_id),
        "event_type": event_type,
        "soulkey_id": str(soulkey_id) if soulkey_id else None,
        "persona_id": persona_id,
        "resource": resource,
        "action": action,
        "scope": scope,
        "decision": decision,
    }, sort_keys=True)
    entry_hash = hashlib.sha256(chain_data.encode()).hexdigest()

    # Include integrity hash in context
    entry_context = dict(context or {})
    entry_context["_integrity"] = {
        "hash": entry_hash,
        "prev_hash": _previous_hash,
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
    )

    db.add(audit_entry)
    await db.flush()
    await db.refresh(audit_entry)

    # Update chain for next entry
    _previous_hash = entry_hash

    # Forward to SIEM (non-blocking) if forwarder is active
    try:
        from src.integrations.forwarder import get_event_forwarder
        from src.integrations.cef import AuditEvent
        forwarder = get_event_forwarder()
        if forwarder is not None:
            forwarder.forward(AuditEvent.from_audit_log(audit_entry))
    except Exception:
        pass  # SIEM forwarding must never break audit logging

    # Run through Sigma detection engine (non-blocking)
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
