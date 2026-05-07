"""
Common Event Format (CEF) helper for SoulWatch SIEM integration.
Converts audit events to CEF strings per the ArcSight CEF standard.
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional


@dataclass
class AuditEvent:
    """Normalized audit event for SIEM forwarding."""
    event_id: str
    tenant_id: str
    timestamp: str
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
    def from_dict(cls, data: dict) -> "AuditEvent":
        return cls(
            event_id=str(data.get("id", "")),
            tenant_id=str(data.get("tenant_id", "")),
            timestamp=str(data.get("timestamp", datetime.now(timezone.utc).isoformat())),
            event_type=data.get("event_type", ""),
            soulkey_id=str(data.get("soulkey_id")) if data.get("soulkey_id") else None,
            persona_id=data.get("persona_id"),
            resource=data.get("resource"),
            action=data.get("action"),
            scope=data.get("scope"),
            decision=data.get("decision"),
            reason=data.get("reason"),
            capability_id=str(data.get("capability_id")) if data.get("capability_id") else None,
            context=data.get("context") or {},
        )


SEVERITY_MAP: dict[str, int] = {
    "auth_grant": 3, "auth_deny": 5, "key_issued": 3,
    "key_suspended": 6, "key_revoked": 7, "key_reinstated": 4,
    "scope_violation": 7, "capability_issued": 2, "capability_used": 2,
    "capability_revoked": 5, "policy_synced": 1, "policy_violation": 8,
    "escalation_requested": 4, "escalation_approved": 4, "escalation_denied": 5,
    "tool_invocation": 3,
}

EVENT_NAMES: dict[str, str] = {
    "auth_grant": "Authorization Granted", "auth_deny": "Authorization Denied",
    "key_issued": "SoulKey Issued", "key_suspended": "SoulKey Suspended",
    "key_revoked": "SoulKey Revoked", "key_reinstated": "SoulKey Reinstated",
    "scope_violation": "Scope Violation Detected",
    "capability_issued": "Capability Token Issued", "capability_used": "Capability Token Used",
    "capability_revoked": "Capability Token Revoked", "policy_synced": "Policy Synchronized",
    "policy_violation": "Policy Violation Detected",
    "escalation_requested": "Escalation Requested",
    "escalation_approved": "Escalation Approved", "escalation_denied": "Escalation Denied",
    "tool_invocation": "Tool Invocation",
}

CEF_VERSION = "0"
CEF_VENDOR = "Saluca"
CEF_PRODUCT = "Tiresias SoulWatch"
CEF_PRODUCT_VERSION = "1.0"


def _escape_cef_header(value: str) -> str:
    return value.replace("\\", "\\\\").replace("|", "\\|")


def _escape_cef_extension(value: str) -> str:
    return value.replace("\\", "\\\\").replace("=", "\\=").replace("\n", "\\n").replace("\r", "\\r")


def format_cef(event: AuditEvent) -> str:
    """Convert an AuditEvent to a CEF-formatted string."""
    sig_id = _escape_cef_header(event.event_type)
    name = _escape_cef_header(EVENT_NAMES.get(event.event_type, event.event_type))
    severity = SEVERITY_MAP.get(event.event_type, 5)

    header = (
        f"CEF:{CEF_VERSION}|{_escape_cef_header(CEF_VENDOR)}"
        f"|{_escape_cef_header(CEF_PRODUCT)}"
        f"|{_escape_cef_header(CEF_PRODUCT_VERSION)}"
        f"|{sig_id}|{name}|{severity}"
    )

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

    # Tool invocation specific extensions
    if event.event_type == "tool_invocation":
        ctx = event.context or {}
        if ctx.get("command"):
            extensions.append(f"cs3={_escape_cef_extension(str(ctx['command']))}")
            extensions.append("cs3Label=command")
        if ctx.get("agent_id"):
            extensions.append(f"cs4={_escape_cef_extension(str(ctx['agent_id']))}")
            extensions.append("cs4Label=agentId")
        if ctx.get("policy_verdict"):
            extensions.append(f"cs5={_escape_cef_extension(str(ctx['policy_verdict']))}")
            extensions.append("cs5Label=policyVerdict")
        if ctx.get("sanitizer_verdict"):
            extensions.append(f"cs6={_escape_cef_extension(str(ctx['sanitizer_verdict']))}")
            extensions.append("cs6Label=sanitizerVerdict")
        if ctx.get("exit_code") is not None:
            extensions.append(f"cn1={ctx['exit_code']}")
            extensions.append("cn1Label=exitCode")
        if ctx.get("duration_ms") is not None:
            extensions.append(f"cn2={ctx['duration_ms']}")
            extensions.append("cn2Label=durationMs")

    return f"{header}|{' '.join(extensions)}" 
