"""Tiresias Incident Controller — Core domain models.

Pydantic models for incident lifecycle management, forensic evidence,
and automated response action tracking.
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class Severity(str, Enum):
    """Incident severity levels (SEV-0 most critical)."""
    SEV0 = "SEV-0"  # Critical — Active Breach
    SEV1 = "SEV-1"  # Critical — Service Down
    SEV2 = "SEV-2"  # High — Degraded
    SEV3 = "SEV-3"  # Medium — Anomaly
    SEV4 = "SEV-4"  # Low — Informational


class IncidentStatus(str, Enum):
    """Lifecycle states for an incident."""
    ACTIVE = "active"
    RESPONDING = "responding"
    RECOVERING = "recovering"
    RESOLVED = "resolved"
    CLOSED = "closed"


class IncidentType(str, Enum):
    """Canonical incident type codes."""
    # Security
    SEC_WAF_BYPASS = "INC-SEC-001"
    SEC_UNAUTH_ACCESS = "INC-SEC-002"
    SEC_DATA_EXFIL = "INC-SEC-003"
    SEC_KEY_COMPROMISE = "INC-SEC-004"
    # Service
    SVC_TOTAL_OUTAGE = "INC-SVC-001"
    SVC_PARTIAL_DEGRADATION = "INC-SVC-002"
    SVC_DB_UNREACHABLE = "INC-SVC-003"
    SVC_CERT_EXPIRY = "INC-SVC-004"
    # Infrastructure
    INF_NODE_FAILURE = "INC-INF-001"
    INF_DISK_FULL = "INC-INF-002"
    INF_MEMORY_EXHAUSTION = "INC-INF-003"
    INF_NETWORK_PARTITION = "INC-INF-004"


# ---------------------------------------------------------------------------
# Supporting models
# ---------------------------------------------------------------------------

class ActionRecord(BaseModel):
    """A single automated or manual remediation action."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    action_type: str  # e.g. "apply_network_policy", "scale_deployment"
    target: str  # what was acted on
    status: str = "pending"  # pending, executing, completed, failed, rolled_back
    details: dict = Field(default_factory=dict)
    error: Optional[str] = None
    rollback_action: Optional[str] = None
    duration_ms: Optional[int] = None


class TimelineEntry(BaseModel):
    """A single event in the incident timeline."""
    timestamp: datetime
    source: str  # e.g. "soulauth_audit", "cloud_armor", "prometheus", "incident_controller"
    event_type: str
    description: str
    details: dict = Field(default_factory=dict)
    severity: Optional[str] = None


class ForensicSnapshot(BaseModel):
    """Immutable forensic evidence bundle for an incident."""
    id: str
    incident_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    storage_uri: str  # gs://saluca-incident-forensics/{incident_id}/
    artifacts: list[dict] = Field(default_factory=list)  # {type, path, hash_sha256, size_bytes}
    chain_of_custody: list[dict] = Field(default_factory=list)
    complete: bool = False


# ---------------------------------------------------------------------------
# Primary model
# ---------------------------------------------------------------------------

class Incident(BaseModel):
    """Root aggregate for a single incident."""
    id: str  # INC-YYYYMMDD-HHMMSS-TYPE
    type: IncidentType
    severity: Severity
    title: str
    description: str = ""
    detected_at: datetime = Field(default_factory=datetime.utcnow)
    source_alerts: list[dict] = Field(default_factory=list)
    status: IncidentStatus = IncidentStatus.ACTIVE
    playbook: Optional[str] = None
    actions_taken: list[ActionRecord] = Field(default_factory=list)
    forensic_snapshot_id: Optional[str] = None
    rca_report_path: Optional[str] = None
    timeline: list[TimelineEntry] = Field(default_factory=list)
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None  # "auto" or persona_id
    metadata: dict = Field(default_factory=dict)

    # ------------------------------------------------------------------
    # Factory helpers
    # ------------------------------------------------------------------

    @staticmethod
    def generate_id(incident_type: IncidentType) -> str:
        """Generate a deterministic incident ID from the current UTC time and type."""
        now = datetime.utcnow()
        type_suffix = incident_type.value.replace("INC-", "").replace("-", "")
        return f"INC-{now.strftime('%Y%m%d-%H%M%S')}-{type_suffix}"

    # ------------------------------------------------------------------
    # Mutation helpers
    # ------------------------------------------------------------------

    def add_timeline_entry(
        self,
        source: str,
        event_type: str,
        description: str,
        **kwargs,
    ) -> None:
        """Append a new event to the incident timeline."""
        self.timeline.append(
            TimelineEntry(
                timestamp=datetime.utcnow(),
                source=source,
                event_type=event_type,
                description=description,
                **kwargs,
            )
        )

    def add_action(
        self,
        action_type: str,
        target: str,
        **kwargs,
    ) -> ActionRecord:
        """Register and return a new remediation action."""
        action = ActionRecord(action_type=action_type, target=target, **kwargs)
        self.actions_taken.append(action)
        return action
