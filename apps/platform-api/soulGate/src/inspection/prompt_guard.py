"""
Prompt injection detection engine.
40+ regex patterns covering OWASP LLM Top 10 categories with risk scoring model.
"""

import re
from dataclasses import dataclass, field
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Severity weights for risk scoring
# ---------------------------------------------------------------------------

SEVERITY_WEIGHTS: dict[str, float] = {
    "low": 0.05,
    "medium": 0.15,
    "high": 0.25,
    "critical": 0.40,
}

# Risk score thresholds
THRESHOLD_WARN = 0.3
THRESHOLD_BLOCK = 0.7


@dataclass
class ThreatMatch:
    """A matched threat pattern."""
    pattern_name: str
    severity: str  # low, medium, high, critical
    action: str  # block, flag, sanitize
    matched_text: str
    category: str = ""  # OWASP category

    def to_dict(self) -> dict:
        return {
            "pattern_name": self.pattern_name,
            "severity": self.severity,
            "action": self.action,
            "matched_text": self.matched_text[:200],  # Truncate for logging
            "category": self.category,
        }


@dataclass
class InjectionScanResult:
    """Result of a prompt injection scan with risk scoring."""
    matches: list[ThreatMatch] = field(default_factory=list)
    risk_score: float = 0.0
    decision: str = "allow"  # allow, warn, block
    details: str = ""

    @property
    def is_blocked(self) -> bool:
        return self.decision == "block"

    @property
    def is_warned(self) -> bool:
        return self.decision == "warn"

    def to_dict(self) -> dict:
        return {
            "risk_score": round(self.risk_score, 3),
            "decision": self.decision,
            "match_count": len(self.matches),
            "matches": [m.to_dict() for m in self.matches],
            "details": self.details,
        }


# ---------------------------------------------------------------------------
# Built-in prompt injection patterns (40+ covering OWASP LLM Top 10)
# ---------------------------------------------------------------------------

_PATTERNS: list[tuple[str, str, str, str, str]] = [
    # (name, regex_pattern, severity, action, owasp_category)

    # === CATEGORY: Direct Injection (OWASP LLM01) ===
    ("ignore_previous_instructions", r"ignore\s+(all\s+)?previous\s+instructions", "critical", "block", "direct_injection"),
    ("ignore_above_instructions", r"ignore\s+(everything|all|the)\s+(above|before)", "critical", "block", "direct_injection"),
    ("disregard_instructions", r"disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|guidelines)", "critical", "block", "direct_injection"),
    ("forget_instructions", r"forget\s+(all\s+)?(previous|prior|your)\s+(instructions|training|rules)", "critical", "block", "direct_injection"),
    ("override_instructions", r"override\s+(your|all|previous)\s+instructions", "critical", "block", "direct_injection"),
    ("new_instructions", r"new\s+instructions?\s*[:;]", "high", "block", "direct_injection"),
    ("new_system_prompt", r"(?:new|updated|revised)\s+system\s+prompt", "critical", "block", "direct_injection"),
    ("from_now_on", r"from\s+now\s+on\s*[,:]?\s*(?:you|your|ignore|forget|disregard)", "high", "block", "direct_injection"),
    ("stop_being", r"stop\s+being\s+(?:a|an|the)?\s*\w+\s+(?:and|to)\s+", "high", "block", "direct_injection"),

    # === CATEGORY: Indirect Injection (OWASP LLM01) ===
    ("when_user_asks", r"when\s+(?:the\s+)?(?:user|human|person)\s+(?:asks|says|types|mentions)", "high", "block", "indirect_injection"),
    ("if_asked_about", r"if\s+(?:asked|prompted|questioned)\s+about", "high", "block", "indirect_injection"),
    ("hidden_instruction", r"(?:HIDDEN|INVISIBLE|SECRET)\s+(?:INSTRUCTION|COMMAND|DIRECTIVE)", "critical", "block", "indirect_injection"),
    ("ai_instruction_marker", r"\[(?:INST|SYSTEM|ADMIN|TOOL_CALL)\]", "high", "block", "indirect_injection"),
    ("prompt_injection_marker", r"(?:PROMPT\s*INJECTION|INJECT\s*PROMPT)", "critical", "block", "indirect_injection"),
    ("embedded_instruction", r"(?:IMPORTANT|NOTE|ATTENTION)\s*:\s*(?:ignore|disregard|override|forget)", "critical", "block", "indirect_injection"),

    # === CATEGORY: Jailbreak (OWASP LLM01) ===
    ("dan_mode", r"(?:DAN|D\.A\.N\.?)\s*(?:mode|prompt|jailbreak)?", "critical", "block", "jailbreak"),
    ("developer_mode_enable", r"(?:enable|enter|activate|unlock)\s+(?:developer|debug|admin|root|god)\s+mode", "critical", "block", "jailbreak"),
    ("do_anything_now", r"(?:do|can)\s+anything\s+now", "critical", "block", "jailbreak"),
    ("pretend_to_be", r"pretend\s+(?:to\s+be|you\s+are|you\s+have|that\s+you)", "high", "block", "jailbreak"),
    ("you_are_now", r"you\s+are\s+now\s+(?:a|an|the|free|unbound|unrestricted)", "critical", "block", "jailbreak"),
    ("act_as", r"(?:act|behave|function|operate)\s+as\s+(?:a|an|if|though)", "high", "block", "jailbreak"),
    ("roleplay_as", r"(?:roleplay|role-play|role\s+play)\s+as", "high", "block", "jailbreak"),
    ("assume_role", r"assume\s+the\s+(?:role|identity|persona)\s+of", "high", "block", "jailbreak"),
    ("switch_to_mode", r"switch\s+to\s+(?:\w+\s+)?mode", "medium", "flag", "jailbreak"),
    ("no_ethical_guidelines", r"(?:without|no|ignore)\s+(?:ethical|moral|safety)\s+(?:guidelines|constraints|rules|boundaries)", "critical", "block", "jailbreak"),
    ("hypothetical_scenario", r"(?:hypothetically|in\s+a\s+hypothetical|imagine\s+(?:you|a\s+scenario))\s+(?:where|in\s+which)\s+(?:you|there)", "medium", "flag", "jailbreak"),

    # === CATEGORY: System Prompt Extraction (OWASP LLM01) ===
    ("system_prompt_extraction", r"(?:show|reveal|display|print|output|give|tell|repeat|recite)\s+(?:me\s+)?(?:your\s+)?system\s+prompt", "critical", "block", "prompt_extraction"),
    ("reveal_instructions", r"(?:reveal|show|display|print|tell|leak|expose)\s+(?:me\s+)?(?:your|the)\s+(?:instructions|rules|guidelines|prompt|configuration)", "high", "block", "prompt_extraction"),
    ("what_are_instructions", r"what\s+(?:are|were)\s+your\s+(?:original\s+)?(?:instructions|rules|directives|guidelines)", "high", "block", "prompt_extraction"),
    ("repeat_above", r"repeat\s+(?:the\s+)?(?:text|words|instructions|everything)\s+above", "high", "block", "prompt_extraction"),
    ("initial_prompt", r"(?:initial|original|first|starting)\s+(?:system\s+)?prompt", "medium", "flag", "prompt_extraction"),

    # === CATEGORY: Delimiter/Context Escape (OWASP LLM01) ===
    ("triple_backtick_escape", r"```\s*(?:system|assistant|user|end|tool)", "high", "block", "context_escape"),
    ("xml_tag_injection", r"<\/?(?:system|assistant|user|prompt|instruction|message|tool_call|function_call)>", "high", "block", "context_escape"),
    ("special_token_injection", r"<\|(?:system|im_start|im_end|endoftext|pad|sep)\|>", "critical", "block", "context_escape"),
    ("markdown_heading_inject", r"#+\s*(?:SYSTEM|INSTRUCTIONS|PROMPT|OVERRIDE)", "medium", "flag", "context_escape"),
    ("separator_injection", r"(?:-{5,}|={5,}|\*{5,})\s*(?:END|BEGIN|SYSTEM|NEW|OVERRIDE)", "medium", "flag", "context_escape"),

    # === CATEGORY: Encoding Evasion (OWASP LLM01) ===
    ("base64_instruction", r"(?:decode|base64|atob)\s*\(", "medium", "flag", "encoding_evasion"),
    ("base64_decode_request", r"(?:base64|b64)\s*(?:decode|decrypt|decipher)\s*(?:this|the\s+following|:)", "high", "block", "encoding_evasion"),
    ("hex_escape_sequence", r"\\x[0-9a-fA-F]{2}(?:\\x[0-9a-fA-F]{2}){3,}", "medium", "flag", "encoding_evasion"),
    ("unicode_escape", r"\\u[0-9a-fA-F]{4}(?:\\u[0-9a-fA-F]{4}){3,}", "medium", "flag", "encoding_evasion"),
    ("html_entity_sequence", r"&#(?:x[0-9a-fA-F]+|\d+);(?:&#(?:x[0-9a-fA-F]+|\d+);){3,}", "medium", "flag", "encoding_evasion"),
    ("rot13_reference", r"(?:rot13|caesar\s*cipher|decode\s+this)", "low", "flag", "encoding_evasion"),

    # === CATEGORY: Data Exfiltration (OWASP LLM02/LLM06) ===
    ("fetch_external_url", r"(?:fetch|curl|wget|request|load|get|access)\s+(?:data\s+)?(?:from\s+)?(?:https?://|ftp://)\S+", "high", "block", "data_exfiltration"),
    ("send_to_url", r"(?:send|post|transmit|forward|upload|exfiltrate)\s+(?:data|info|information|response|output|the\s+\w+)\s+to\s+", "high", "block", "data_exfiltration"),
    ("exfil_webhook", r"(?:webhook|callback)\s*(?:url|endpoint)\s*[:=]", "medium", "flag", "data_exfiltration"),
    ("make_http_request", r"(?:make|send|issue)\s+(?:a\s+)?(?:GET|POST|PUT|DELETE|PATCH|HTTP)\s+(?:request|call)", "medium", "flag", "data_exfiltration"),
    ("api_key_extraction", r"(?:api[_\-\s]?key|password|secret|token|credential)\s*[:=]\s*\S+", "high", "block", "data_exfiltration"),

    # === CATEGORY: Privilege Escalation (OWASP LLM01) ===
    ("sudo_admin", r"(?:sudo|admin|root|superuser)\s+(?:access|privilege|permission|rights)", "high", "block", "privilege_escalation"),
    ("bypass_safety", r"(?:bypass|disable|turn\s+off|ignore|circumvent|skip)\s+(?:safety|security|filter|guardrail|content\s+filter|moderation)", "critical", "block", "privilege_escalation"),
    ("remove_restrictions", r"(?:remove|lift|disable|eliminate)\s+(?:all\s+)?(?:restrictions|limitations|constraints|boundaries|safeguards)", "critical", "block", "privilege_escalation"),
    ("unlock_capabilities", r"(?:unlock|enable|activate)\s+(?:all\s+)?(?:hidden|restricted|locked|advanced)\s+(?:capabilities|features|functions|abilities)", "high", "block", "privilege_escalation"),
]

# Compile patterns
_COMPILED_PATTERNS: list[tuple[str, re.Pattern, str, str, str]] = [
    (name, re.compile(pattern, re.IGNORECASE | re.MULTILINE), severity, action, category)
    for name, pattern, severity, action, category in _PATTERNS
]


def get_pattern_count() -> int:
    """Return the number of built-in detection patterns."""
    return len(_PATTERNS)


def scan_for_injection(
    text: str,
    custom_patterns: Optional[list[tuple[str, str, str, str]]] = None,
) -> list[ThreatMatch]:
    """
    Scan text for prompt injection patterns.
    Returns list of ThreatMatch objects for all matches found.
    """
    if not text:
        return []

    matches: list[ThreatMatch] = []

    # Check built-in patterns
    for name, compiled, severity, action, category in _COMPILED_PATTERNS:
        match = compiled.search(text)
        if match:
            matches.append(ThreatMatch(
                pattern_name=name,
                severity=severity,
                action=action,
                matched_text=match.group(0),
                category=category,
            ))

    # Check custom patterns
    if custom_patterns:
        for name, pattern, severity, action in custom_patterns:
            try:
                compiled_custom = re.compile(pattern, re.IGNORECASE | re.MULTILINE)
                match = compiled_custom.search(text)
                if match:
                    matches.append(ThreatMatch(
                        pattern_name=name,
                        severity=severity,
                        action=action,
                        matched_text=match.group(0),
                        category="custom",
                    ))
            except re.error:
                logger.warning("prompt_guard.invalid_pattern", name=name, pattern=pattern)

    if matches:
        logger.warning(
            "prompt_guard.threats_detected",
            count=len(matches),
            patterns=[m.pattern_name for m in matches],
            severities=[m.severity for m in matches],
        )

    return matches


def compute_risk_score(matches: list[ThreatMatch]) -> float:
    """
    Compute a risk score from 0.0 to 1.0 based on matched patterns.
    Each match contributes its severity weight. Score is capped at 1.0.
    """
    if not matches:
        return 0.0
    score = sum(SEVERITY_WEIGHTS.get(m.severity, 0.1) for m in matches)
    return min(score, 1.0)


def scan_and_score(
    text: str,
    custom_patterns: Optional[list[tuple[str, str, str, str]]] = None,
    warn_threshold: float = THRESHOLD_WARN,
    block_threshold: float = THRESHOLD_BLOCK,
) -> InjectionScanResult:
    """
    Scan text for prompt injection and compute risk score with decision.

    Returns InjectionScanResult with:
    - matches: list of ThreatMatch objects
    - risk_score: float 0.0-1.0
    - decision: "allow", "warn", or "block"
    """
    matches = scan_for_injection(text, custom_patterns)
    risk_score = compute_risk_score(matches)

    # Check if any match has action="block" explicitly
    has_block_action = any(m.action == "block" for m in matches)

    if risk_score >= block_threshold or has_block_action:
        decision = "block"
        details = f"Risk score {risk_score:.3f} >= block threshold {block_threshold}"
    elif risk_score >= warn_threshold:
        decision = "warn"
        details = f"Risk score {risk_score:.3f} >= warn threshold {warn_threshold}"
    else:
        decision = "allow"
        details = f"Risk score {risk_score:.3f} below thresholds"

    return InjectionScanResult(
        matches=matches,
        risk_score=risk_score,
        decision=decision,
        details=details,
    )
