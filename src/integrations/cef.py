"""
Common Event Format (CEF) helper for SIEM integration.
Converts SoulAuth audit events to CEF strings per the ArcSight CEF standard.

CEF format:
  CEF:0|Vendor|Product|Version|SignatureID|Name|Severity|Extension
"""

import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional


@dataclass
class AuditEvent:
    """
    Normalized audit event for SIEM forwarding.
    Created from AuditLog DB records or inline during auth decisions.
    """
    event_id: str
    tenant_id: str
    timestamp: str  # ISO 8601
    event_type: str
    soulkey_id: Optional[str] = None
    persona_id: Optional[str] = None
    resource: Optional[str] = None
    action: Optional[str] = None
    scope: Optional[str] = None
    decision: Optional[str] = None
    reason: Optional[str] = None
    capability_id: Optional[str] = None
    context: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_audit_log(cls, record) -> "AuditEvent":
        """Create AuditEvent from an AuditLog ORM instance."""
        return cls(
            event_id=str(record.id),
            tenant_id=str(record.tenant_id),
            timestamp=(
                record.timestamp.isoformat()
                if record.timestamp
                else datetime.now(timezone.utc).isoformat()
            ),
            event_type=record.event_type,
            soulkey_id=str(record.soulkey_id) if record.soulkey_id else None,
            persona_id=record.persona_id,
            resource=record.resource,
            action=record.action,
            scope=record.scope,
            decision=record.decision,
            reason=record.reason,
            capability_id=str(record.capability_id) if record.capability_id else None,
            context=record.context or {},
        )


# CEF severity mapping — higher values = more critical
SEVERITY_MAP: dict[str, int] = {
    "auth_grant": 3,
    "auth_deny": 5,
    "key_issued": 3,
    "key_suspended": 6,
    "key_revoked": 7,
    "key_reinstated": 4,
    "scope_violation": 7,
    "capability_issued": 2,
    "capability_used": 2,
    "capability_revoked": 5,
    "policy_synced": 1,
    "policy_violation": 8,
    "escalation_requested": 4,
    "escalation_approved": 4,
    "escalation_denied": 5,
}

# Human-readable event names for the CEF Name field
EVENT_NAMES: dict[str, str] = {
    "auth_grant": "Authorization Granted",
    "auth_deny": "Authorization Denied",
    "key_issued": "SoulKey Issued",
    "key_suspended": "SoulKey Suspended",
    "key_revoked": "SoulKey Revoked",
    "key_reinstated": "SoulKey Reinstated",
    "scope_violation": "Scope Violation Detected",
    "capability_issued": "Capability Token Issued",
    "capability_used": "Capability Token Used",
    "capability_revoked": "Capability Token Revoked",
    "policy_synced": "Policy Synchronized",
    "policy_violation": "Policy Violation Detected",
    "escalation_requested": "Escalation Requested",
    "escalation_approved": "Escalation Approved",
    "escalation_denied": "Escalation Denied",
}

# CEF vendor/product constants
CEF_VERSION = "0"
CEF_VENDOR = "Saluca"
CEF_PRODUCT = "Tiresias SoulAuth"
CEF_PRODUCT_VERSION = "1.0"


def _escape_cef_header(value: str) -> str:
    """Escape pipe and backslash characters in CEF header fields."""
    return value.replace("\\", "\\\\").replace("|", "\\|")


def _escape_cef_extension(value: str) -> str:
    """Escape backslash, equals, and newline in CEF extension values."""
    return (
        value.replace("\\", "\\\\")
        .replace("=", "\\=")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )


def format_cef(event: AuditEvent) -> str:
    """
    Convert an AuditEvent to a CEF-formatted string.

    Format: CEF:0|Saluca|Tiresias SoulAuth|1.0|event_type|event_name|severity|extensions

    Extension fields follow standard CEF key names:
      - rt: receipt time (epoch ms)
      - suser: source user (persona_id)
      - act: action performed
      - outcome: decision result
      - reason: denial or action reason
      - cs1/cs1Label: tenant_id
      - cs2/cs2Label: soulkey_id
      - cs3/cs3Label: resource
      - cs4/cs4Label: scope
      - cs5/cs5Label: capability_id
      - externalId: event_id
    """
    sig_id = _escape_cef_header(event.event_type)
    name = _escape_cef_header(EVENT_NAMES.get(event.event_type, event.event_type))
    severity = SEVERITY_MAP.get(event.event_type, 5)

    header = (
        f"CEF:{CEF_VERSION}|{_escape_cef_header(CEF_VENDOR)}"
        f"|{_escape_cef_header(CEF_PRODUCT)}"
        f"|{_escape_cef_header(CEF_PRODUCT_VERSION)}"
        f"|{sig_id}|{name}|{severity}"
    )

    # Build extension key=value pairs
    extensions: list[str] = []

    extensions.append(f"externalId={_escape_cef_extension(event.event_id)}")
    extensions.append(f"rt={_escape_cef_extension(event.timestamp)}")

    if event.persona_id:
        extensions.append(f"suser={_escape_cef_extension(event.persona_id)}")
    if event.action:
        extensions.append(f"act={_escape_cef_extension(event.action)}")
    if event.decision:
        extensions.append(f"outcome={_escape_cef_extension(event.decision)}")
    if event.reason:
        extensions.append(f"reason={_escape_cef_extension(event.reason)}")

    # Custom string fields
    extensions.append(f"cs1={_escape_cef_extension(event.tenant_id)}")
    extensions.append("cs1Label=tenantId")

    if event.soulkey_id:
        extensions.append(f"cs2={_escape_cef_extension(event.soulkey_id)}")
        extensions.append("cs2Label=soulkeyId")

    if event.resource:
        extensions.append(f"cs3={_escape_cef_extension(event.resource)}")
        extensions.append("cs3Label=resource")

    if event.scope:
        extensions.append(f"cs4={_escape_cef_extension(event.scope)}")
        extensions.append("cs4Label=scope")

    if event.capability_id:
        extensions.append(f"cs5={_escape_cef_extension(event.capability_id)}")
        extensions.append("cs5Label=capabilityId")

    ext_str = " ".join(extensions)
    return f"{header}|{ext_str}"
