"""
SoulAuth Detection Engine — Sigma-compatible rule engine and response playbooks.
Enterprise SOC teams write Sigma YAML rules against SoulAuth audit events.
Matching rules trigger automated response playbooks.
"""

from src.detection.sigma_engine import SigmaRule, SigmaMatch, SigmaEngine
from src.detection.playbooks import (
    PlaybookAction,
    ResponsePlaybook,
    PlaybookResult,
    ActionResult,
    PlaybookEngine,
)

__all__ = [
    "SigmaRule",
    "SigmaMatch",
    "SigmaEngine",
    "PlaybookAction",
    "ResponsePlaybook",
    "PlaybookResult",
    "ActionResult",
    "PlaybookEngine",
]
