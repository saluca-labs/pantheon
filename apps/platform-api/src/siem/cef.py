"""
CEF formatter for Tiresias SIEM connectors.
Serializes detection events (SigmaMatch), anomalies (Anomaly),
and quarantine records (QuarantineRecord) into CEF strings.

Reuses escape helpers from src.integrations.cef to stay DRY.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from src.integrations.cef import (
    CEF_VERSION,
    CEF_VENDOR,
    CEF_PRODUCT,
    CEF_PRODUCT_VERSION,
    _escape_cef_header,
    _escape_cef_extension,
)


class EventKind(str, Enum):
    DETECTION = "detection"
    ANOMALY = "anomaly"
    QUARANTINE = "quarantine"


@dataclass
class DetectionEvent:
    """
    Unified detection event for SIEM forwarding.
    Created from SigmaMatch, Anomaly, or QuarantineRecord objects.
    """
    kind: EventKind
    event_id: str
    tenant_id: str
    timestamp: str           # ISO 8601
    sig_id: str              # rule_id / anomaly_type / "quarantine"
    name: str                # human-readable title
    severity_label: str      # "low" | "medium" | "high" | "critical"
    soulkey_id: Optional[str] = None
    persona_id: Optional[str] = None
    description: str = ""
    evidence: dict = field(default_factory=dict)
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "kind": self.kind.value,
            "event_id": self.event_id,
            "tenant_id": self.tenant_id,
            "timestamp": self.timestamp,
            "sig_id": self.sig_id,
            "name": self.name,
            "severity_label": self.severity_label,
            "soulkey_id": self.soulkey_id,
            "persona_id": self.persona_id,
            "description": self.description,
            "evidence": self.evidence,
            "extra": self.extra,
        }


# CEF integer severity mapping (ArcSight scale 0-10)
_SEVERITY_INT: dict[str, int] = {
    "low": 3,
    "medium": 5,
    "high": 7,
    "critical": 10,
    "informational": 1,
}


def _severity_int(label: str) -> int:
    return _SEVERITY_INT.get(label.lower(), 5)


class CEFFormatter:
    """
    Converts DetectionEvent objects to CEF-formatted strings.

    CEF format:
        CEF:0|Saluca|Tiresias SoulAuth|1.0|sigId|name|severity|extensions
    """

    def format(self, event: DetectionEvent) -> str:
        """Serialize a DetectionEvent to a CEF string."""
        sig_id = _escape_cef_header(event.sig_id)
        name = _escape_cef_header(event.name)
        sev = _severity_int(event.severity_label)

        header = (
            f"CEF:{CEF_VERSION}"
            f"|{_escape_cef_header(CEF_VENDOR)}"
            f"|{_escape_cef_header(CEF_PRODUCT)}"
            f"|{_escape_cef_header(CEF_PRODUCT_VERSION)}"
            f"|{sig_id}"
            f"|{name}"
            f"|{sev}"
        )

        ext: list[str] = []
        ext.append(f"externalId={_escape_cef_extension(event.event_id)}")
        ext.append(f"rt={_escape_cef_extension(event.timestamp)}")

        if event.soulkey_id:
            ext.append(f"cs1={_escape_cef_extension(event.soulkey_id)}")
            ext.append("cs1Label=soulkeyId")
        if event.tenant_id:
            ext.append(f"cs2={_escape_cef_extension(event.tenant_id)}")
            ext.append("cs2Label=tenantId")
        if event.persona_id:
            ext.append(f"suser={_escape_cef_extension(event.persona_id)}")
        if event.description:
            ext.append(f"msg={_escape_cef_extension(event.description)}")
        if event.kind:
            ext.append(f"cs3={_escape_cef_extension(event.kind.value)}")
            ext.append("cs3Label=eventKind")

        # Flatten evidence dict as cs4
        if event.evidence:
            import json as _json
            ev_str = _json.dumps(event.evidence, default=str)
            ext.append(f"cs4={_escape_cef_extension(ev_str)}")
            ext.append("cs4Label=evidence")

        return f"{header}|{' '.join(ext)}"

    # ------------------------------------------------------------------
    # Factory helpers — convert native detection objects to DetectionEvent
    # ------------------------------------------------------------------

    @staticmethod
    def from_sigma_match(match: Any, tenant_id: str) -> "DetectionEvent":
        """Create DetectionEvent from a SigmaMatch instance."""
        return DetectionEvent(
            kind=EventKind.DETECTION,
            event_id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            timestamp=match.timestamp.isoformat() if hasattr(match, "timestamp") else datetime.now(timezone.utc).isoformat(),
            sig_id=match.rule.id,
            name=match.rule.title,
            severity_label=match.rule.level,
            soulkey_id=match.event.get("soulkey_id"),
            persona_id=match.event.get("persona_id"),
            description=f"Sigma rule matched: {match.rule.title}",
            evidence=match.matched_fields,
            extra={"event": match.event},
        )

    @staticmethod
    def from_anomaly(anomaly: Any, tenant_id: str) -> "DetectionEvent":
        """Create DetectionEvent from an Anomaly instance."""
        return DetectionEvent(
            kind=EventKind.ANOMALY,
            event_id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            timestamp=anomaly.timestamp.isoformat() if hasattr(anomaly, "timestamp") else datetime.now(timezone.utc).isoformat(),
            sig_id=anomaly.type.value if hasattr(anomaly.type, "value") else str(anomaly.type),
            name=f"Anomaly: {anomaly.type.value if hasattr(anomaly.type, 'value') else anomaly.type}",
            severity_label=anomaly.severity,
            soulkey_id=str(anomaly.soulkey_id),
            description=anomaly.description,
            evidence=anomaly.evidence,
        )

    @staticmethod
    def from_quarantine(record: Any, tenant_id: str) -> "DetectionEvent":
        """Create DetectionEvent from a QuarantineRecord instance."""
        return DetectionEvent(
            kind=EventKind.QUARANTINE,
            event_id=str(record.id),
            tenant_id=tenant_id,
            timestamp=record.quarantined_at.isoformat() if hasattr(record, "quarantined_at") else datetime.now(timezone.utc).isoformat(),
            sig_id="quarantine",
            name="Agent Quarantined",
            severity_label="high",
            soulkey_id=str(record.soulkey_id),
            persona_id=record.persona_id,
            description=record.reason,
            evidence={
                "triggered_by_type": record.triggered_by_type,
                "actions_taken": [a.value if hasattr(a, "value") else str(a) for a in record.actions_taken],
                "status": record.status.value if hasattr(record.status, "value") else str(record.status),
            },
        )
