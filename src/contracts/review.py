"""
AI-assisted contract review engine.
Uses negotiation policy to classify proposed changes as:
- auto_accept: minor clarifications, formatting
- flag_review: liability caps, SLA modifications, indemnification
- auto_reject: unlimited liability, audit right removal, data sovereignty violations

Produces: risk score, counter-proposal suggestions, flagged clauses.
"""

import structlog
from typing import Optional

logger = structlog.get_logger(__name__)

# Negotiation policy — defines Saluca's boundaries
NEGOTIATION_POLICY = {
    "auto_accept": [
        "formatting changes",
        "company name corrections",
        "address updates",
        "minor clarifications that don't change obligations",
        "adding standard governing law for customer's jurisdiction",
    ],
    "flag_review": [
        "liability cap modifications",
        "indemnification scope changes",
        "SLA uptime percentage changes",
        "data retention period modifications",
        "insurance requirement changes",
        "payment term changes beyond net-60",
        "termination notice period changes",
    ],
    "auto_reject": [
        "unlimited liability for vendor",
        "removal of limitation of liability",
        "removal of audit rights",
        "data sovereignty restrictions that conflict with service architecture",
        "non-compete clauses",
        "exclusive dealing requirements",
        "assignment of intellectual property",
        "most favored customer pricing clauses",
    ],
    "risk_weights": {
        "liability": 0.3,
        "indemnification": 0.25,
        "sla": 0.15,
        "data_handling": 0.15,
        "payment": 0.10,
        "termination": 0.05,
    },
}


async def review_contract_delta(
    standard_content: str,
    proposed_content: str,
    contract_type: str = "msa",
) -> dict:
    """
    Review proposed contract changes against negotiation policy.

    In production, this calls the Tiresias proxy with the contract-review persona.
    For now, returns a structured review based on keyword analysis.

    Returns:
        review_status: "auto_accept" | "needs_review" | "auto_reject"
        risk_score: 0.0-1.0
        flagged_clauses: list of concerns
        suggestions: list of counter-proposal suggestions
    """
    flagged = []
    risk_score = 0.0

    proposed_lower = proposed_content.lower()

    # Check auto-reject patterns
    reject_patterns = {
        "unlimited liability": ("auto_reject", 0.9, "Unlimited liability clause detected"),
        "no limitation of liability": ("auto_reject", 0.9, "Removal of liability limitation"),
        "waive audit": ("auto_reject", 0.8, "Audit right waiver detected"),
        "waive right to audit": ("auto_reject", 0.8, "Audit right waiver detected"),
        "non-compete": ("auto_reject", 0.7, "Non-compete clause detected"),
        "exclusive dealing": ("auto_reject", 0.7, "Exclusive dealing requirement"),
        "assign all intellectual property": ("auto_reject", 0.9, "IP assignment clause"),
        "most favored": ("auto_reject", 0.6, "Most favored customer pricing clause"),
    }

    for pattern, (status, weight, description) in reject_patterns.items():
        if pattern in proposed_lower:
            flagged.append({"clause": pattern, "status": status, "description": description, "risk": weight})
            risk_score = max(risk_score, weight)

    # Check flag-for-review patterns
    review_patterns = {
        "liability cap": ("needs_review", 0.5, "Liability cap modification"),
        "limitation of liability": ("needs_review", 0.5, "Liability limitation change"),
        "indemnif": ("needs_review", 0.5, "Indemnification scope change"),
        "uptime": ("needs_review", 0.3, "SLA uptime modification"),
        "data retention": ("needs_review", 0.3, "Data retention period change"),
        "insurance": ("needs_review", 0.3, "Insurance requirement change"),
        "net-90": ("needs_review", 0.4, "Extended payment terms (net-90)"),
        "termination": ("needs_review", 0.2, "Termination clause modification"),
    }

    for pattern, (status, weight, description) in review_patterns.items():
        if pattern in proposed_lower and not any(f["clause"] == pattern for f in flagged):
            flagged.append({"clause": pattern, "status": status, "description": description, "risk": weight})
            risk_score = max(risk_score, weight)

    # Determine overall status
    if any(f["status"] == "auto_reject" for f in flagged):
        review_status = "auto_reject"
    elif any(f["status"] == "needs_review" for f in flagged):
        review_status = "needs_review"
    elif len(proposed_content) != len(standard_content):
        review_status = "needs_review"
        risk_score = max(risk_score, 0.1)
    else:
        review_status = "auto_accept"

    suggestions = []
    if review_status == "auto_reject":
        suggestions.append("Consider removing flagged clauses and resubmitting")
    elif review_status == "needs_review":
        suggestions.append("Flagged items require Saluca review before proceeding")

    return {
        "review_status": review_status,
        "risk_score": round(risk_score, 2),
        "flagged_clauses": flagged,
        "suggestions": suggestions,
        "policy_version": "1.0",
    }
