"""Sensitive data detection patterns for risk scoring.

Each pattern has a compiled regex, a human-readable name, and a severity level
used to weight its contribution to the overall risk score.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True, slots=True)
class SensitivePattern:
    """A named regex pattern with an associated severity."""

    name: str
    regex: re.Pattern[str]
    severity: str  # "low" | "medium" | "high"


# ---------------------------------------------------------------------------
# Compiled patterns
# ---------------------------------------------------------------------------

CREDIT_CARD = SensitivePattern(
    name="credit_card",
    regex=re.compile(r"\b(?:\d[ -]*?){13,19}\b"),
    severity="high",
)

SSN = SensitivePattern(
    name="ssn",
    regex=re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    severity="high",
)

API_KEY = SensitivePattern(
    name="api_key",
    regex=re.compile(
        r"(?i)\b(?:sk-[a-zA-Z0-9]{20,}|pk-[a-zA-Z0-9]{20,}"
        r"|api_[a-zA-Z0-9]{16,}|bearer\s+[a-zA-Z0-9._\-]{20,}"
        r"|token[=: ]+[a-zA-Z0-9._\-]{20,})\b"
    ),
    severity="high",
)

EMAIL = SensitivePattern(
    name="email",
    regex=re.compile(r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b"),
    severity="medium",
)

URL = SensitivePattern(
    name="url",
    regex=re.compile(r"https?://[^\s\"'<>]+"),
    severity="low",
)

# Keywords that indicate sensitive data even without a structured pattern.
PII_KEYWORDS: list[str] = [
    "password",
    "secret",
    "ssn",
    "social_security",
    "credit_card",
    "bank_account",
]

_PII_KEYWORD_RE = re.compile(
    r"(?i)\b(?:" + "|".join(re.escape(kw) for kw in PII_KEYWORDS) + r")\b"
)

# Ordered from highest to lowest severity so early exit can short-circuit.
ALL_PATTERNS: Sequence[SensitivePattern] = (
    CREDIT_CARD,
    SSN,
    API_KEY,
    EMAIL,
    URL,
)

SEVERITY_WEIGHT: dict[str, float] = {
    "high": 1.0,
    "medium": 0.6,
    "low": 0.3,
}


def scan_text(text: str) -> list[SensitivePattern]:
    """Return all patterns that match anywhere in *text*."""
    hits: list[SensitivePattern] = []
    for pat in ALL_PATTERNS:
        if pat.regex.search(text):
            hits.append(pat)
    if _PII_KEYWORD_RE.search(text):
        # Synthesize a virtual pattern for keyword hits.
        hits.append(
            SensitivePattern(name="pii_keyword", regex=_PII_KEYWORD_RE, severity="medium")
        )
    return hits
