"""Compliance framework control definitions.

Each control specifies what audit evidence proves compliance and how to
evaluate whether a given audit event satisfies it.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ControlDefinition:
    """A single compliance control that can be evidenced by audit data."""

    id: str
    name: str
    framework: str
    description: str
    evidence_criteria: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# SOC 2 Type II — Trust Services Criteria (Common Criteria)
# ---------------------------------------------------------------------------
SOC2_CONTROLS: list[ControlDefinition] = [
    ControlDefinition(
        id="CC6.1",
        name="Logical Access Security",
        framework="soc2",
        description=(
            "The entity implements logical access security software, "
            "infrastructure, and architectures over protected information "
            "assets to protect them from security events."
        ),
        evidence_criteria=[
            "policy_decision present on every tool call",
            "Cedar policy evaluated before dispatch",
        ],
    ),
    ControlDefinition(
        id="CC6.2",
        name="Prior Authorization for Access",
        framework="soc2",
        description=(
            "Prior to issuing system credentials and granting system access, "
            "the entity registers and authorizes new internal and external users."
        ),
        evidence_criteria=[
            "approval_status == approved for queued actions",
            "human reviewer identity recorded",
        ],
    ),
    ControlDefinition(
        id="CC6.3",
        name="Role-Based Access",
        framework="soc2",
        description=(
            "The entity authorizes, modifies, or removes access to data, "
            "software, functions, and other protected information assets "
            "based on roles."
        ),
        evidence_criteria=[
            "agent_id and tenant_id present in policy context",
            "Cedar RBAC policies enforce per-agent/tenant permissions",
        ],
    ),
    ControlDefinition(
        id="CC6.6",
        name="System Operation Monitoring",
        framework="soc2",
        description=(
            "The entity implements controls to prevent or detect and act "
            "upon the introduction of unauthorized or malicious software."
        ),
        evidence_criteria=[
            "behavioral_alerts generated when anomalous patterns detected",
            "risk_score computed per action",
        ],
    ),
    ControlDefinition(
        id="CC7.1",
        name="Detection of Unauthorized Activity",
        framework="soc2",
        description=(
            "To meet its objectives, the entity uses detection and "
            "monitoring procedures to identify changes to configurations "
            "that result in the introduction of new vulnerabilities, and "
            "susceptibilities to newly discovered vulnerabilities."
        ),
        evidence_criteria=[
            "risk_score above threshold triggers alert",
            "behavioral patterns detect privilege escalation",
        ],
    ),
    ControlDefinition(
        id="CC7.2",
        name="Incident Detection Monitoring",
        framework="soc2",
        description=(
            "The entity monitors system components and the operation of "
            "those components for anomalies indicative of malicious acts, "
            "natural disasters, and errors."
        ),
        evidence_criteria=[
            "exfiltration pattern detection",
            "privilege escalation detection",
            "abnormal tool-call frequency detection",
        ],
    ),
    ControlDefinition(
        id="CC8.1",
        name="Change Management",
        framework="soc2",
        description=(
            "The entity authorizes, designs, develops or acquires, "
            "configures, documents, tests, approves, and implements "
            "changes to infrastructure, data, software, and procedures."
        ),
        evidence_criteria=[
            "Cedar policy files are version-controlled",
            "policy hot-reload validates before applying",
        ],
    ),
]


# ---------------------------------------------------------------------------
# NIST AI RMF 1.0 — Selected subcategories
# ---------------------------------------------------------------------------
NIST_AI_RMF_CONTROLS: list[ControlDefinition] = [
    ControlDefinition(
        id="MAP 1.1",
        name="Intended Purpose Documented",
        framework="nist_ai_rmf",
        description=(
            "The intended purpose, context of use, and potential benefits "
            "and costs of the AI system are documented."
        ),
        evidence_criteria=[
            "plugin_name present — maps to manifest with declared capabilities",
            "tool_name present — identifies specific operation",
        ],
    ),
    ControlDefinition(
        id="MAP 1.5",
        name="Risk Assessment",
        framework="nist_ai_rmf",
        description=(
            "Organizational risk tolerances are determined and documented, "
            "and the AI system is assessed against them."
        ),
        evidence_criteria=[
            "risk_score (0-100) computed per action",
            "risk_level classification (low/medium/high/critical)",
        ],
    ),
    ControlDefinition(
        id="MEASURE 2.6",
        name="AI System Monitoring",
        framework="nist_ai_rmf",
        description=(
            "The AI system is monitored for performance and behavior "
            "using measurable metrics."
        ),
        evidence_criteria=[
            "audit trail with immutable records for every tool call",
            "behavioral analyzer tracks patterns over time",
        ],
    ),
    ControlDefinition(
        id="MANAGE 1.1",
        name="Risk Response",
        framework="nist_ai_rmf",
        description=(
            "A process is implemented to respond to identified risks "
            "based on assessed risk levels."
        ),
        evidence_criteria=[
            "policy_decision == deny when risk_level is critical",
            "automatic deny on critical risk score",
        ],
    ),
    ControlDefinition(
        id="MANAGE 2.2",
        name="Human Oversight",
        framework="nist_ai_rmf",
        description=(
            "Mechanisms are in place for human oversight and intervention "
            "in AI system decisions."
        ),
        evidence_criteria=[
            "approval queue with human-in-the-loop for high-risk actions",
            "approval_status and resolved_by recorded",
        ],
    ),
    ControlDefinition(
        id="GOVERN 1.1",
        name="Policies and Processes",
        framework="nist_ai_rmf",
        description=(
            "Policies and processes are in place and enforced to govern "
            "the AI system throughout its lifecycle."
        ),
        evidence_criteria=[
            "Cedar policy files are auditable and version-controlled",
            "policy evaluation logged for every action",
        ],
    ),
]


# ---------------------------------------------------------------------------
# EU AI Act — Article 14 (Human Oversight)
# ---------------------------------------------------------------------------
EU_AI_ACT_CONTROLS: list[ControlDefinition] = [
    ControlDefinition(
        id="Art 14.1",
        name="Human Oversight Capability",
        framework="eu_ai_act",
        description=(
            "High-risk AI systems shall be designed and developed in such "
            "a way that they can be effectively overseen by natural persons "
            "during the period in which the AI system is in use."
        ),
        evidence_criteria=[
            "approval queue exists for destructive/high-risk actions",
            "human reviewer can approve or deny before execution",
        ],
    ),
    ControlDefinition(
        id="Art 14.2",
        name="Ability to Intervene",
        framework="eu_ai_act",
        description=(
            "Human oversight shall include the ability to intervene in the "
            "operation of the high-risk AI system or interrupt it."
        ),
        evidence_criteria=[
            "admin deny endpoint available to reject pending actions",
            "approval_status == denied recorded when admin intervenes",
        ],
    ),
    ControlDefinition(
        id="Art 14.3",
        name="Understanding of System",
        framework="eu_ai_act",
        description=(
            "Persons assigned to human oversight shall be enabled to "
            "correctly interpret the high-risk AI system's output."
        ),
        evidence_criteria=[
            "risk factor breakdown returned in responses",
            "policy_reason explains why decision was made",
            "behavioral_alerts provide human-readable descriptions",
        ],
    ),
    ControlDefinition(
        id="Art 14.4",
        name="Ability to Stop",
        framework="eu_ai_act",
        description=(
            "Persons assigned to human oversight shall be able to decide "
            "not to use the high-risk AI system or to otherwise disregard, "
            "override, or reverse its output."
        ),
        evidence_criteria=[
            "plugin unload capability",
            "schedule pause capability",
            "Cedar deny-all policy can halt all operations",
        ],
    ),
]


# ---------------------------------------------------------------------------
# Unified registry
# ---------------------------------------------------------------------------
FRAMEWORKS: dict[str, list[ControlDefinition]] = {
    "soc2": SOC2_CONTROLS,
    "nist_ai_rmf": NIST_AI_RMF_CONTROLS,
    "eu_ai_act": EU_AI_ACT_CONTROLS,
}
