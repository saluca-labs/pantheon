"""ComplianceMapper — maps audit events to compliance framework controls.

Given an audit record, determines which controls it satisfies, partially
satisfies, or has gaps in, producing evidence suitable for a CISO or auditor.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass
class AuditEvent:
    """Mirrors the key fields of an AppProxyAuditLog record."""

    tool_name: str
    plugin_name: str
    agent_id: str
    tenant_id: str
    policy_decision: str  # grant | deny | queue_for_approval
    risk_score: int = 0
    risk_level: str = "low"  # low | medium | high | critical
    behavioral_alerts: list[str] = field(default_factory=list)
    has_approval: bool = False
    approval_status: Optional[str] = None  # pending | approved | denied
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ComplianceMapping:
    """One audit event mapped to one compliance control."""

    framework: str
    control_id: str
    control_name: str
    evidence_type: str  # policy_enforcement | audit_trail | risk_assessment | human_oversight | access_control
    status: str  # satisfied | partial | gap
    notes: str


@dataclass
class ComplianceReport:
    """Aggregate compliance report for a given framework and time window."""

    framework: str
    generated_at: datetime
    tenant_id: str
    period_start: datetime
    period_end: datetime
    total_events: int
    controls_satisfied: int
    controls_partial: int
    controls_gap: int
    mappings: list[ComplianceMapping] = field(default_factory=list)
    summary: str = ""


# ---------------------------------------------------------------------------
# Mapper
# ---------------------------------------------------------------------------
class ComplianceMapper:
    """Maps audit events to compliance framework controls.

    Given an audit record, returns which controls it satisfies or partially
    satisfies.  Aggregates multiple events into a compliance report.
    """

    # ------------------------------------------------------------------
    # Single-event mapping
    # ------------------------------------------------------------------
    def map_event(self, event: AuditEvent) -> list[ComplianceMapping]:
        """Map a single audit event to all applicable compliance controls."""
        mappings: list[ComplianceMapping] = []
        mappings.extend(self._map_soc2(event))
        mappings.extend(self._map_nist_ai_rmf(event))
        mappings.extend(self._map_eu_ai_act(event))
        return mappings

    # ------------------------------------------------------------------
    # Report generation
    # ------------------------------------------------------------------
    def generate_report(
        self,
        events: list[AuditEvent],
        framework: str,
        *,
        tenant_id: str = "",
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
    ) -> ComplianceReport:
        """Generate a compliance report for a specific framework.

        Evaluates every event, then rolls up per-control status.  A control
        is *satisfied* if at least one event fully evidences it, *partial* if
        some events partially evidence it, and a *gap* if no event provides
        any evidence.
        """
        now = datetime.now(timezone.utc)
        p_start = period_start or (min((e.timestamp for e in events), default=now))
        p_end = period_end or (max((e.timestamp for e in events), default=now))

        # Collect all mappings filtered to requested framework
        all_mappings: list[ComplianceMapping] = []
        for ev in events:
            for m in self.map_event(ev):
                if m.framework == framework:
                    all_mappings.append(m)

        # Roll up per control — best status wins
        control_best: dict[str, str] = {}
        for m in all_mappings:
            prev = control_best.get(m.control_id, "gap")
            control_best[m.control_id] = self._best_status(prev, m.status)

        # Check for controls with no evidence at all
        from app_proxy.compliance.frameworks import FRAMEWORKS

        for ctrl in FRAMEWORKS.get(framework, []):
            if ctrl.id not in control_best:
                control_best[ctrl.id] = "gap"
                all_mappings.append(
                    ComplianceMapping(
                        framework=framework,
                        control_id=ctrl.id,
                        control_name=ctrl.name,
                        evidence_type="audit_trail",
                        status="gap",
                        notes="No audit events provide evidence for this control.",
                    )
                )

        satisfied = sum(1 for s in control_best.values() if s == "satisfied")
        partial = sum(1 for s in control_best.values() if s == "partial")
        gap = sum(1 for s in control_best.values() if s == "gap")
        total_controls = satisfied + partial + gap

        summary = (
            f"Compliance report for {framework.upper().replace('_', ' ')}: "
            f"{satisfied}/{total_controls} controls satisfied, "
            f"{partial} partially satisfied, {gap} gaps identified. "
            f"Period: {p_start.date()} to {p_end.date()}. "
            f"Based on {len(events)} audit events."
        )

        return ComplianceReport(
            framework=framework,
            generated_at=now,
            tenant_id=tenant_id or (events[0].tenant_id if events else ""),
            period_start=p_start,
            period_end=p_end,
            total_events=len(events),
            controls_satisfied=satisfied,
            controls_partial=partial,
            controls_gap=gap,
            mappings=all_mappings,
            summary=summary,
        )

    # ------------------------------------------------------------------
    # SOC 2 Type II mapping rules
    # ------------------------------------------------------------------
    def _map_soc2(self, ev: AuditEvent) -> list[ComplianceMapping]:
        mappings: list[ComplianceMapping] = []

        # CC6.1 — every event with a policy decision evidences logical access
        if ev.policy_decision in ("grant", "deny", "queue_for_approval"):
            mappings.append(ComplianceMapping(
                framework="soc2",
                control_id="CC6.1",
                control_name="Logical Access Security",
                evidence_type="policy_enforcement",
                status="satisfied",
                notes=(
                    f"Cedar policy evaluated for tool '{ev.tool_name}' — "
                    f"decision: {ev.policy_decision}."
                ),
            ))

        # CC6.2 — approval queue proves prior authorization
        if ev.has_approval and ev.approval_status == "approved":
            mappings.append(ComplianceMapping(
                framework="soc2",
                control_id="CC6.2",
                control_name="Prior Authorization for Access",
                evidence_type="human_oversight",
                status="satisfied",
                notes=(
                    f"Action on '{ev.tool_name}' was queued and approved "
                    f"before execution."
                ),
            ))
        elif ev.policy_decision == "queue_for_approval":
            mappings.append(ComplianceMapping(
                framework="soc2",
                control_id="CC6.2",
                control_name="Prior Authorization for Access",
                evidence_type="human_oversight",
                status="partial",
                notes=(
                    f"Action queued for approval but status is "
                    f"'{ev.approval_status or 'pending'}'."
                ),
            ))

        # CC6.3 — RBAC evidenced by agent_id + tenant_id in policy context
        if ev.agent_id and ev.tenant_id:
            mappings.append(ComplianceMapping(
                framework="soc2",
                control_id="CC6.3",
                control_name="Role-Based Access",
                evidence_type="access_control",
                status="satisfied",
                notes=(
                    f"Agent '{ev.agent_id}' in tenant '{ev.tenant_id}' — "
                    f"Cedar RBAC enforced."
                ),
            ))

        # CC6.6 — behavioral alerts prove operational monitoring
        if ev.behavioral_alerts:
            mappings.append(ComplianceMapping(
                framework="soc2",
                control_id="CC6.6",
                control_name="System Operation Monitoring",
                evidence_type="risk_assessment",
                status="satisfied",
                notes=(
                    f"Behavioral analyzer raised {len(ev.behavioral_alerts)} "
                    f"alert(s): {', '.join(ev.behavioral_alerts[:3])}."
                ),
            ))
        elif ev.risk_score > 0:
            mappings.append(ComplianceMapping(
                framework="soc2",
                control_id="CC6.6",
                control_name="System Operation Monitoring",
                evidence_type="risk_assessment",
                status="satisfied",
                notes=f"Risk score {ev.risk_score} computed — monitoring active.",
            ))

        # CC7.1 — high risk scores prove detection capability
        if ev.risk_score >= 50:
            mappings.append(ComplianceMapping(
                framework="soc2",
                control_id="CC7.1",
                control_name="Detection of Unauthorized Activity",
                evidence_type="risk_assessment",
                status="satisfied",
                notes=(
                    f"Risk score {ev.risk_score} ({ev.risk_level}) detected "
                    f"for '{ev.tool_name}' — threshold-based alerting active."
                ),
            ))
        elif ev.risk_score > 0:
            mappings.append(ComplianceMapping(
                framework="soc2",
                control_id="CC7.1",
                control_name="Detection of Unauthorized Activity",
                evidence_type="risk_assessment",
                status="partial",
                notes=(
                    f"Risk scoring active (score={ev.risk_score}) but no "
                    f"high-risk events detected in this record."
                ),
            ))

        # CC7.2 — exfiltration/escalation-specific alerts
        incident_alerts = [
            a for a in ev.behavioral_alerts
            if any(kw in a.lower() for kw in (
                "exfiltration", "escalation", "anomal", "spike", "unusual",
            ))
        ]
        if incident_alerts:
            mappings.append(ComplianceMapping(
                framework="soc2",
                control_id="CC7.2",
                control_name="Incident Detection Monitoring",
                evidence_type="risk_assessment",
                status="satisfied",
                notes=(
                    f"Incident-class alerts detected: "
                    f"{', '.join(incident_alerts[:3])}."
                ),
            ))

        # CC8.1 — policy decision itself proves change management pipeline is active
        if ev.policy_decision in ("grant", "deny", "queue_for_approval"):
            mappings.append(ComplianceMapping(
                framework="soc2",
                control_id="CC8.1",
                control_name="Change Management",
                evidence_type="policy_enforcement",
                status="partial",
                notes=(
                    "Cedar policy evaluated — policies are version-controlled "
                    "and validated on hot-reload. Full evidence requires "
                    "Git audit trail of policy changes."
                ),
            ))

        return mappings

    # ------------------------------------------------------------------
    # NIST AI RMF mapping rules
    # ------------------------------------------------------------------
    def _map_nist_ai_rmf(self, ev: AuditEvent) -> list[ComplianceMapping]:
        mappings: list[ComplianceMapping] = []

        # MAP 1.1 — plugin + tool identity proves intended purpose documented
        if ev.plugin_name and ev.tool_name:
            mappings.append(ComplianceMapping(
                framework="nist_ai_rmf",
                control_id="MAP 1.1",
                control_name="Intended Purpose Documented",
                evidence_type="audit_trail",
                status="satisfied",
                notes=(
                    f"Plugin '{ev.plugin_name}' with tool '{ev.tool_name}' — "
                    f"manifest declares capabilities and intended use."
                ),
            ))

        # MAP 1.5 — risk score proves risk assessment
        if ev.risk_score > 0:
            mappings.append(ComplianceMapping(
                framework="nist_ai_rmf",
                control_id="MAP 1.5",
                control_name="Risk Assessment",
                evidence_type="risk_assessment",
                status="satisfied",
                notes=(
                    f"Risk score {ev.risk_score}/100 (level: {ev.risk_level}) "
                    f"assessed for this action."
                ),
            ))
        else:
            mappings.append(ComplianceMapping(
                framework="nist_ai_rmf",
                control_id="MAP 1.5",
                control_name="Risk Assessment",
                evidence_type="risk_assessment",
                status="partial",
                notes="Risk scorer active but returned score of 0 for this event.",
            ))

        # MEASURE 2.6 — audit trail existence
        mappings.append(ComplianceMapping(
            framework="nist_ai_rmf",
            control_id="MEASURE 2.6",
            control_name="AI System Monitoring",
            evidence_type="audit_trail",
            status="satisfied",
            notes=(
                f"Immutable audit record captured for "
                f"'{ev.plugin_name}/{ev.tool_name}' at {ev.timestamp.isoformat()}."
            ),
        ))

        # MANAGE 1.1 — auto-deny on critical risk
        if ev.risk_level == "critical" and ev.policy_decision == "deny":
            mappings.append(ComplianceMapping(
                framework="nist_ai_rmf",
                control_id="MANAGE 1.1",
                control_name="Risk Response",
                evidence_type="policy_enforcement",
                status="satisfied",
                notes=(
                    f"Critical risk action (score={ev.risk_score}) auto-denied — "
                    f"risk response process active."
                ),
            ))
        elif ev.risk_level in ("high", "critical"):
            mappings.append(ComplianceMapping(
                framework="nist_ai_rmf",
                control_id="MANAGE 1.1",
                control_name="Risk Response",
                evidence_type="policy_enforcement",
                status="partial",
                notes=(
                    f"High-risk action (level={ev.risk_level}, score={ev.risk_score}) "
                    f"detected. Decision: {ev.policy_decision}. "
                    f"Full satisfaction requires deny on critical."
                ),
            ))

        # MANAGE 2.2 — human oversight via approval queue
        if ev.has_approval:
            mappings.append(ComplianceMapping(
                framework="nist_ai_rmf",
                control_id="MANAGE 2.2",
                control_name="Human Oversight",
                evidence_type="human_oversight",
                status="satisfied" if ev.approval_status == "approved" else "partial",
                notes=(
                    f"Human-in-the-loop review — approval status: "
                    f"{ev.approval_status or 'pending'}."
                ),
            ))

        # GOVERN 1.1 — policy evaluation proves governance
        if ev.policy_decision in ("grant", "deny", "queue_for_approval"):
            mappings.append(ComplianceMapping(
                framework="nist_ai_rmf",
                control_id="GOVERN 1.1",
                control_name="Policies and Processes",
                evidence_type="policy_enforcement",
                status="satisfied",
                notes=(
                    f"Cedar policy evaluated — decision '{ev.policy_decision}' "
                    f"logged for auditability."
                ),
            ))

        return mappings

    # ------------------------------------------------------------------
    # EU AI Act Article 14 mapping rules
    # ------------------------------------------------------------------
    def _map_eu_ai_act(self, ev: AuditEvent) -> list[ComplianceMapping]:
        mappings: list[ComplianceMapping] = []

        # Art 14.1 — approval queue proves human oversight capability
        if ev.has_approval or ev.policy_decision == "queue_for_approval":
            mappings.append(ComplianceMapping(
                framework="eu_ai_act",
                control_id="Art 14.1",
                control_name="Human Oversight Capability",
                evidence_type="human_oversight",
                status="satisfied",
                notes=(
                    f"Action queued for human review — oversight mechanism "
                    f"active for '{ev.tool_name}'."
                ),
            ))

        # Art 14.2 — admin deny proves ability to intervene
        if ev.has_approval and ev.approval_status == "denied":
            mappings.append(ComplianceMapping(
                framework="eu_ai_act",
                control_id="Art 14.2",
                control_name="Ability to Intervene",
                evidence_type="human_oversight",
                status="satisfied",
                notes=(
                    f"Human reviewer denied action on '{ev.tool_name}' — "
                    f"intervention capability demonstrated."
                ),
            ))
        elif ev.has_approval:
            mappings.append(ComplianceMapping(
                framework="eu_ai_act",
                control_id="Art 14.2",
                control_name="Ability to Intervene",
                evidence_type="human_oversight",
                status="partial",
                notes=(
                    "Approval queue exists (intervention possible) but no "
                    "denial recorded in this event."
                ),
            ))

        # Art 14.3 — risk breakdown proves system understanding
        if ev.risk_score > 0 or ev.behavioral_alerts:
            notes_parts = []
            if ev.risk_score > 0:
                notes_parts.append(
                    f"risk score {ev.risk_score} ({ev.risk_level}) provided"
                )
            if ev.behavioral_alerts:
                notes_parts.append(
                    f"{len(ev.behavioral_alerts)} behavioral alert(s) explain system state"
                )
            mappings.append(ComplianceMapping(
                framework="eu_ai_act",
                control_id="Art 14.3",
                control_name="Understanding of System",
                evidence_type="risk_assessment",
                status="satisfied",
                notes=(
                    f"Interpretability aids present: {'; '.join(notes_parts)}."
                ),
            ))

        # Art 14.4 — deny-all / plugin unload capability
        # This is a system-level capability, not per-event.
        # We mark partial for every event (capability exists) and satisfied
        # when a deny is actually exercised.
        if ev.policy_decision == "deny":
            mappings.append(ComplianceMapping(
                framework="eu_ai_act",
                control_id="Art 14.4",
                control_name="Ability to Stop",
                evidence_type="policy_enforcement",
                status="satisfied",
                notes=(
                    f"System exercised stop capability — '{ev.tool_name}' "
                    f"denied by Cedar policy."
                ),
            ))
        else:
            mappings.append(ComplianceMapping(
                framework="eu_ai_act",
                control_id="Art 14.4",
                control_name="Ability to Stop",
                evidence_type="policy_enforcement",
                status="partial",
                notes=(
                    "Stop capability exists (Cedar deny-all, plugin unload, "
                    "schedule pause) but was not exercised in this event."
                ),
            ))

        return mappings

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _best_status(a: str, b: str) -> str:
        """Return the better of two statuses (satisfied > partial > gap)."""
        rank = {"satisfied": 2, "partial": 1, "gap": 0}
        return a if rank.get(a, 0) >= rank.get(b, 0) else b
