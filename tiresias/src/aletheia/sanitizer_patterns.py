"""
Sanitizer pattern definitions for tool output scanning.
Extends PRH pattern structure with 5 categories specific to tool output threats:
tool_injection, indirect_injection, credential_exposure, encoding_evasion, exfil_directive.
~25 compiled regex patterns across all categories.
"""

import re
from typing import TypedDict


class PatternDef(TypedDict):
    name: str
    pattern: re.Pattern
    weight: float


def _compile(raw: list[tuple[str, str, float]]) -> list[PatternDef]:
    """Compile a list of (name, regex_str, weight) tuples into PatternDef dicts."""
    return [
        PatternDef(name=name, pattern=re.compile(regex, re.IGNORECASE | re.DOTALL), weight=weight)
        for name, regex, weight in raw
    ]


# ---------------------------------------------------------------------------
# tool_injection -- direct injection patterns found in tool output
# Adapted from top PRH injection patterns + tool-output-specific additions.
# ---------------------------------------------------------------------------
_TOOL_INJECTION_RAW: list[tuple[str, str, float]] = [
    ("ignore_previous", r"(?i)ignore\s+(all\s+)?(previous|prior|above)\s+instructions?", 0.9),
    ("disregard_instructions", r"(?i)disregard\s+(all\s+)?(previous|prior|your|the)\s+instructions?", 0.9),
    ("new_instructions", r"(?i)your\s+new\s+instructions?\s*(are|:)", 0.8),
    ("override_system", r"(?i)override\s+(the\s+)?(system|assistant|ai)\s*(prompt|instructions?|guidelines?)?", 0.85),
    ("injection_marker", r"(?i)(\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>|<\|system\|>)", 0.95),
    ("hidden_instruction", r"(?i)(you\s+must|you\s+should|please\s+now)\s+(ignore|disregard|forget|override)", 0.85),
    ("embedded_system_prompt", r"(?i)<\|?(system|im_start|INST)\|?>.*?(ignore|override|disregard)", 0.9),
    ("tool_output_directive", r"(?i)(IMPORTANT|NOTE|ATTENTION):\s*(ignore|disregard|override|forget)\s+(all\s+)?(previous|prior)", 0.9),
]

# ---------------------------------------------------------------------------
# indirect_injection -- hidden instructions in document/tool output content
# ---------------------------------------------------------------------------
_INDIRECT_INJECTION_RAW: list[tuple[str, str, float]] = [
    ("zero_width_encoded", r"[\u200b\u200c\u200d\ufeff]{4,}", 0.8),
    ("invisible_text_block", r"[\u200b-\u200f\u2028-\u202f\ufeff\u00ad]{10,}", 0.7),
    ("rtl_override_trick", r"[\u202e\u2066-\u2069]", 0.75),
    ("homoglyph_substitution", r"(?i)\b(?=[\w]*[\u0400-\u04ff])(?=[\w]*[a-z])[\w]+\b", 0.6),
]

# ---------------------------------------------------------------------------
# credential_exposure -- secrets/keys/tokens found in tool output
# ---------------------------------------------------------------------------
_CREDENTIAL_EXPOSURE_RAW: list[tuple[str, str, float]] = [
    ("aws_key", r"AKIA[0-9A-Z]{16}", 0.95),
    ("github_token", r"(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}", 0.95),
    ("generic_api_key", r"(?i)(api[_\-]?key|apikey|secret[_\-]?key)\s*[:=]\s*['\"]?[A-Za-z0-9\-_]{20,}", 0.85),
    ("jwt_token", r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+", 0.8),
    ("private_key_block", r"-----BEGIN\s+(RSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY-----", 0.95),
    ("connection_string", r"(?i)(postgres|mysql|mongodb|redis)://[^\s]+:[^\s]+@", 0.9),
    ("password_in_output", r"(?i)(password|passwd|pwd)\s*[:=]\s*\S{4,}", 0.7),
]

# ---------------------------------------------------------------------------
# encoding_evasion -- encoded payloads that may decode to injection
# ---------------------------------------------------------------------------
_ENCODING_EVASION_RAW: list[tuple[str, str, float]] = [
    ("hex_encoded_payload", r"(?i)(\\x[0-9a-f]{2}){8,}", 0.7),
    ("unicode_escape_sequence", r"(\\u[0-9a-fA-F]{4}){4,}", 0.7),
    ("html_entity_chain", r"(&#x?[0-9a-fA-F]+;){4,}", 0.7),
    ("rot13_marker", r"(?i)(rot13|ebg13|decode\s+this)", 0.6),
]

# ---------------------------------------------------------------------------
# exfil_directive -- instructions in tool output to exfiltrate data
# ---------------------------------------------------------------------------
_EXFIL_DIRECTIVE_RAW: list[tuple[str, str, float]] = [
    ("send_data_instruction", r"(?i)(send|post|transmit|upload|exfiltrate?)\s+(this|the|all)\s+(data|content|output|response)\s+to\s+", 0.85),
    ("curl_exfil", r"(?i)curl\s+(-X\s+POST\s+)?https?://[^\s]+", 0.7),
    ("exfil_via_url", r"(?i)(send|post|transmit|exfil(trate)?)\s+(data|information|secrets?)\s+(to|via)\s+(http|url|endpoint|webhook)", 0.9),
    ("extract_env_vars", r"(?i)(list|show|print|output)\s+(all\s+)?(environment\s+variables?|api\s+keys?|secrets?|credentials?)", 0.9),
]


SANITIZER_CATEGORIES: dict[str, list[PatternDef]] = {
    "tool_injection": _compile(_TOOL_INJECTION_RAW),
    "indirect_injection": _compile(_INDIRECT_INJECTION_RAW),
    "credential_exposure": _compile(_CREDENTIAL_EXPOSURE_RAW),
    "encoding_evasion": _compile(_ENCODING_EVASION_RAW),
    "exfil_directive": _compile(_EXFIL_DIRECTIVE_RAW),
}

# Flat list of all patterns for quick iteration
ALL_SANITIZER_PATTERNS: list[PatternDef] = [
    p for category_patterns in SANITIZER_CATEGORIES.values() for p in category_patterns
]
