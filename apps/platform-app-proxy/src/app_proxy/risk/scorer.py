"""Contextual risk scorer for tool calls.

Runs BEFORE Cedar policy evaluation to attach a numeric risk score and
factor breakdown that Cedar policies can reference in conditions.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Sequence

from app_proxy.risk.patterns import SEVERITY_WEIGHT, scan_text


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class RiskFactor:
    """One contributing factor to the overall risk score."""

    name: str
    weight: int        # max points this factor can contribute (0-30)
    value: float       # 0.0-1.0 activation strength
    explanation: str


@dataclass(frozen=True, slots=True)
class RiskAssessment:
    """Result of scoring a single tool call."""

    score: int                    # 0-100 composite
    level: str                    # "low" | "medium" | "high" | "critical"
    factors: list[RiskFactor]
    recommendation: str           # "allow" | "review" | "require_approval" | "block"

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "level": self.level,
            "recommendation": self.recommendation,
            "factors": [
                {
                    "name": f.name,
                    "weight": f.weight,
                    "value": round(f.value, 3),
                    "explanation": f.explanation,
                }
                for f in self.factors
            ],
        }


@dataclass
class RiskContext:
    """All inputs the scorer needs for a single tool call."""

    tool_name: str
    plugin_name: str
    agent_id: str
    tenant_id: str
    arguments: dict[str, Any]
    tool_annotations: dict[str, Any]
    hour_of_day: int          # 0-23 UTC
    agent_call_count: int     # calls made by this agent in the session


# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

_LEVEL_THRESHOLDS: list[tuple[int, str]] = [
    (76, "critical"),
    (51, "high"),
    (26, "medium"),
    (0, "low"),
]

_RECOMMENDATION_MAP: dict[str, str] = {
    "low": "allow",
    "medium": "review",
    "high": "require_approval",
    "critical": "block",
}

# Regex for external-facing tool names
_EXTERNAL_TOOL_RE = re.compile(r"(?i)(?:post|send|email|upload|publish|forward)")

# Regex for blast-radius indicators in argument values
_BLAST_RADIUS_RE = re.compile(r"(?i)(?:\ball\b|\*|wildcard|broadcast|@here|@channel|@everyone)")


# ---------------------------------------------------------------------------
# Scorer
# ---------------------------------------------------------------------------

class RiskScorer:
    """Scores tool calls with contextual risk assessment.

    Risk factors:
    - Tool destructiveness (from annotations)
    - Data sensitivity (accessing PII, credentials, financial data)
    - External exposure (sending data outside org boundary)
    - Blast radius (affects many users/channels vs single resource)
    - Time context (off-hours operations are riskier)
    - Agent history (new agent vs established agent with track record)
    - Argument analysis (contains emails, URLs, sensitive patterns)
    """

    def score(self, context: RiskContext) -> RiskAssessment:
        """Return a 0-100 risk score with factor breakdown."""
        factors: list[RiskFactor] = []

        # Flatten arguments to a single string for pattern scanning.
        args_text = self._flatten_args(context.arguments)

        # --- Factor 1: destructive tool (weight 30) ---
        factors.append(self._score_destructive(context))

        # --- Factor 2: external exposure (weight 25) ---
        factors.append(self._score_external_exposure(context, args_text))

        # --- Factor 3: sensitive data (weight 20) ---
        factors.append(self._score_sensitive_data(args_text))

        # --- Factor 4: off hours (weight 10) ---
        factors.append(self._score_off_hours(context))

        # --- Factor 5: blast radius (weight 10) ---
        factors.append(self._score_blast_radius(args_text))

        # --- Factor 6: new agent (weight 5) ---
        factors.append(self._score_new_agent(context))

        # Composite score: sum of weight * value, clamped to 0-100.
        raw = sum(f.weight * f.value for f in factors)
        score = max(0, min(100, int(round(raw))))

        level = self._level_for_score(score)
        recommendation = _RECOMMENDATION_MAP[level]

        return RiskAssessment(
            score=score,
            level=level,
            factors=factors,
            recommendation=recommendation,
        )

    # -- Individual factor scorers ------------------------------------------

    @staticmethod
    def _score_destructive(ctx: RiskContext) -> RiskFactor:
        annotations = ctx.tool_annotations
        is_destructive = bool(
            annotations.get("destructiveHint")
            or annotations.get("tiresias:approvalRequired")
        )
        value = 1.0 if is_destructive else 0.0
        return RiskFactor(
            name="destructive_tool",
            weight=30,
            value=value,
            explanation=(
                "Tool is marked destructive/approval-required"
                if is_destructive
                else "Tool is not marked destructive"
            ),
        )

    @staticmethod
    def _score_external_exposure(ctx: RiskContext, args_text: str) -> RiskFactor:
        # Tool name suggests external action?
        name_match = bool(_EXTERNAL_TOOL_RE.search(ctx.tool_name))
        # Args contain URLs or emails?
        has_external_target = bool(
            re.search(r"https?://", args_text)
            or re.search(r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b", args_text)
        )
        if name_match and has_external_target:
            value = 1.0
            explanation = "Tool sends data externally and args contain URLs/emails"
        elif name_match:
            value = 0.4
            explanation = "Tool name suggests external exposure but no external targets in args"
        elif has_external_target:
            value = 0.3
            explanation = "Args contain external targets but tool is not an outbound action"
        else:
            value = 0.0
            explanation = "No external exposure detected"

        return RiskFactor(
            name="external_exposure",
            weight=25,
            value=value,
            explanation=explanation,
        )

    @staticmethod
    def _score_sensitive_data(args_text: str) -> RiskFactor:
        if not args_text:
            return RiskFactor(
                name="sensitive_data", weight=20, value=0.0,
                explanation="No arguments to scan",
            )

        hits = scan_text(args_text)
        if not hits:
            return RiskFactor(
                name="sensitive_data", weight=20, value=0.0,
                explanation="No sensitive patterns detected in arguments",
            )

        # Take the max severity as the activation value.
        max_severity = max(SEVERITY_WEIGHT.get(h.severity, 0.3) for h in hits)
        names = sorted({h.name for h in hits})
        return RiskFactor(
            name="sensitive_data",
            weight=20,
            value=max_severity,
            explanation=f"Detected sensitive patterns: {', '.join(names)}",
        )

    @staticmethod
    def _score_off_hours(ctx: RiskContext) -> RiskFactor:
        is_off = ctx.hour_of_day < 6 or ctx.hour_of_day > 22
        return RiskFactor(
            name="off_hours",
            weight=10,
            value=1.0 if is_off else 0.0,
            explanation=(
                f"Off-hours operation (UTC hour {ctx.hour_of_day})"
                if is_off
                else f"Within business hours (UTC hour {ctx.hour_of_day})"
            ),
        )

    @staticmethod
    def _score_blast_radius(args_text: str) -> RiskFactor:
        match = bool(_BLAST_RADIUS_RE.search(args_text))
        return RiskFactor(
            name="blast_radius",
            weight=10,
            value=1.0 if match else 0.0,
            explanation=(
                "Arguments contain wildcard or broadcast indicators"
                if match
                else "No broad-scope indicators in arguments"
            ),
        )

    @staticmethod
    def _score_new_agent(ctx: RiskContext) -> RiskFactor:
        is_new = ctx.agent_call_count < 10
        return RiskFactor(
            name="new_agent",
            weight=5,
            value=1.0 if is_new else 0.0,
            explanation=(
                f"Agent is new ({ctx.agent_call_count} prior calls)"
                if is_new
                else f"Established agent ({ctx.agent_call_count} prior calls)"
            ),
        )

    # -- Helpers ------------------------------------------------------------

    @staticmethod
    def _flatten_args(arguments: dict[str, Any]) -> str:
        """Convert arguments dict to a flat string for pattern scanning."""
        if not arguments:
            return ""
        try:
            return json.dumps(arguments, default=str)
        except (TypeError, ValueError):
            return str(arguments)

    @staticmethod
    def _level_for_score(score: int) -> str:
        for threshold, level in _LEVEL_THRESHOLDS:
            if score >= threshold:
                return level
        return "low"
