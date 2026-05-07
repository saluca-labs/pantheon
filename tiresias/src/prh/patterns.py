"""
Pattern definitions for 6 PRH threat categories.
Each pattern is a compiled regex with a name and weight (0.0-1.0).
Higher weight = stronger signal for that category.
"""

import re
from typing import TypedDict


class PatternDef(TypedDict):
    name: str
    pattern: re.Pattern
    weight: float


CATEGORIES = [
    "injection",
    "jailbreak",
    "data_exfil",
    "pii_leak",
    "instruction_override",
    "role_manipulation",
]

# ---------------------------------------------------------------------------
# injection -- prompt injection / indirect injection attempts
# ---------------------------------------------------------------------------
_INJECTION_RAW: list[tuple[str, str, float]] = [
    ("ignore_previous", r"(?i)ignore\s+(all\s+)?(previous|prior|above)\s+instructions?", 0.9),
    ("disregard_instructions", r"(?i)disregard\s+(all\s+)?(previous|prior|your|the)\s+instructions?", 0.9),
    ("forget_instructions", r"(?i)forget\s+(all\s+)?(previous|your|the)\s+instructions?", 0.85),
    ("new_instructions", r"(?i)your\s+new\s+instructions?\s*(are|:)", 0.8),
    ("override_system", r"(?i)override\s+(the\s+)?(system|assistant|ai)\s*(prompt|instructions?|guidelines?)?", 0.85),
    ("injection_marker", r"(?i)(\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>|<\|system\|>)", 0.95),
    ("prompt_leak", r"(?i)repeat\s+(your\s+)?(system\s+prompt|instructions?|guidelines?)", 0.8),
    ("delimiter_inject", r"(###\s*(System|Human|Assistant)|---\s*(BEGIN|END)\s+INSTRUCTION)", 0.75),
    ("context_manipulation", r"(?i)(inject|insert|embed)\s+(malicious|hidden|covert)\s+(instruction|prompt|command)", 0.9),
    ("indirect_inject", r"(?i)the\s+(document|file|url|page|content)\s+says?\s+to\s+ignore", 0.85),
]

# ---------------------------------------------------------------------------
# jailbreak -- attempts to bypass safety guardrails
# ---------------------------------------------------------------------------
_JAILBREAK_RAW: list[tuple[str, str, float]] = [
    ("dan_jailbreak", r"(?i)\bDAN\b.{0,50}(do anything now|no\s+restrictions?)", 0.95),
    ("jailbreak_keyword", r"(?i)\bjailbreak\b", 0.85),
    ("no_restrictions", r"(?i)(no\s+restrictions?|without\s+restrictions?|unrestricted\s+mode)", 0.8),
    ("pretend_no_limits", r"(?i)(pretend|act\s+as\s+if)\s+(you\s+have\s+no|there\s+are\s+no)\s+(limit|restriction|filter|guideline)", 0.85),
    ("developer_mode", r"(?i)(developer\s+mode|god\s+mode|unrestricted\s+ai|unfiltered\s+ai)", 0.9),
    ("opposite_instructions", r"(?i)(do\s+the\s+opposite|respond\s+as\s+if|act\s+as\s+though)\s+(you\s+are\s+not|you\s+have\s+no)", 0.75),
    ("hypothetically_bypass", r"(?i)hypothetically\s+(speaking\s+)?(if\s+there\s+were\s+no|ignore\s+(all|safety))", 0.8),
    ("token_manipulation", r"(?i)(bas(e|i)64\s+encoded?|rot13|hex\s+encoded?)\s+(instructions?|prompt|commands?)", 0.85),
    ("grandma_exploit", r"(?i)(my\s+)?(deceased|dead|late)\s+(grandmother|grandma|grandpa)\s+(used\s+to|would)", 0.7),
    ("fictional_bypass", r"(?i)(in\s+a\s+fictional|for\s+a\s+story|as\s+a\s+character)\s+(that\s+has\s+no|without\s+any)\s+(filter|restriction|limit)", 0.8),
]

# ---------------------------------------------------------------------------
# data_exfil -- attempts to extract sensitive data or system information
# ---------------------------------------------------------------------------
_DATA_EXFIL_RAW: list[tuple[str, str, float]] = [
    ("extract_system_prompt", r"(?i)(print|output|reveal|show|display|dump)\s+(your\s+)?(system\s+prompt|initial\s+instructions?|original\s+instructions?)", 0.9),
    ("extract_training_data", r"(?i)(show|reveal|print|output)\s+(your\s+)?(training\s+data|model\s+weights?|internal\s+data)", 0.9),
    ("extract_env_vars", r"(?i)(list|show|print|output)\s+(all\s+)?(environment\s+variables?|api\s+keys?|secrets?|credentials?)", 0.9),
    ("extract_config", r"(?i)(read|open|access|print)\s+(the\s+)?(config(\.(yaml|json|ini|toml))?|settings?\.(yaml|json|ini)|\.env)", 0.85),
    ("exfil_via_url", r"(?i)(send|post|transmit|exfil(trate)?)\s+(data|information|secrets?)\s+(to|via)\s+(http|url|endpoint|webhook)", 0.9),
    ("file_system_access", r"(?i)(list|read|cat|open|access)\s+(\/etc\/|\/var\/|\/root\/|\/home\/|C:\\Windows\\|C:\\Users\\)", 0.85),
    ("database_dump", r"(?i)(dump|extract|export)\s+(the\s+)?(database|db|table|schema|all\s+records?)", 0.8),
    ("credentials_leak", r"(?i)(what\s+(is|are)|tell\s+me)\s+(your\s+)?(password|api\s+key|token|secret|credentials?)", 0.85),
    ("memory_dump", r"(?i)(dump|extract|list)\s+(your\s+)?(memory|context\s+window|conversation\s+history)", 0.75),
    ("probe_permissions", r"(?i)(what|which)\s+(files?|directory|folder|path)\s+(can\s+you\s+access|do\s+you\s+have\s+access)", 0.7),
]

# ---------------------------------------------------------------------------
# pii_leak -- prompts containing or requesting PII
# ---------------------------------------------------------------------------
_PII_LEAK_RAW: list[tuple[str, str, float]] = [
    ("ssn_pattern", r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b", 0.95),
    ("credit_card", r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b", 0.95),
    ("email_address", r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b", 0.6),
    ("phone_number", r"(?<!\d)(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)", 0.65),
    ("passport_pattern", r"(?i)\b(passport\s+number|passport\s+no\.?)\s*:?\s*[A-Z]{1,2}[0-9]{6,9}\b", 0.9),
    ("dob_pattern", r"(?i)(date\s+of\s+birth|d\.?o\.?b\.?)\s*:?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}", 0.8),
    ("address_pattern", r"\b\d{1,5}\s+\w+\s+(Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct)\b", 0.6),
    ("request_pii", r"(?i)(give\s+me|provide|share|tell\s+me)\s+(your\s+)?(social\s+security|ssn|credit\s+card|bank\s+account|home\s+address)", 0.85),
    ("pii_collection", r"(?i)(collect|harvest|gather|scrape)\s+(user\s+)?(pii|personal\s+information|private\s+data|sensitive\s+data)", 0.85),
    ("medical_pii", r"(?i)(medical\s+record|health\s+insurance|diagnosis|prescription|patient\s+(id|number))\s*:?\s*\w+", 0.75),
]

# ---------------------------------------------------------------------------
# instruction_override -- attempts to change system behavior
# ---------------------------------------------------------------------------
_INSTRUCTION_OVERRIDE_RAW: list[tuple[str, str, float]] = [
    ("from_now_on", r"(?i)from\s+now\s+on\s+(you\s+)?(will|must|should|are\s+to)\s+", 0.8),
    ("always_respond", r"(?i)(always|never)\s+respond\s+(with|by|using|in)\s+", 0.7),
    ("change_behavior", r"(?i)(change|modify|alter|update)\s+your\s+(behavior|response\s+style|instructions?|guidelines?|rules?)", 0.8),
    ("add_prefix_suffix", r"(?i)(always|must)\s+(add|append|prepend|include)\s+.{3,50}\s+(to\s+every|before\s+each|after\s+every)\s+response", 0.75),
    ("bypass_filter", r"(?i)(bypass|circumvent|evade|avoid)\s+(the\s+)?(filter|safety|guardrail|restriction|policy|moderation)", 0.9),
    ("comply_with_all", r"(?i)you\s+(must|will|shall)\s+comply\s+with\s+(all|every|any)\s+(request|instruction|command)", 0.75),
    ("prohibit_refusal", r"(?i)(do\s+not|never|you\s+cannot)\s+(refuse|decline|reject)\s+(to\s+)?(answer|respond|comply|help)", 0.8),
    ("persistent_instruction", r"(?i)(remember|keep\s+in\s+mind|note)\s+that\s+(you\s+must|you\s+will|your\s+role\s+is)", 0.65),
    ("unconditional_compliance", r"(?i)(no\s+matter\s+what|regardless\s+of|despite\s+your)\s+(guidelines?|instructions?|programming)", 0.85),
    ("output_format_override", r"(?i)(only\s+respond|respond\s+only)\s+(in|using|with)\s+(base64|hex|rot13|morse|binary|cipher)", 0.75),
]

# ---------------------------------------------------------------------------
# role_manipulation -- attempts to change the AI's identity or role
# ---------------------------------------------------------------------------
_ROLE_MANIPULATION_RAW: list[tuple[str, str, float]] = [
    ("act_as_evil", r"(?i)(act|behave|respond)\s+as\s+(an?\s+)?(evil|malicious|unethical|dangerous|harmful)\s+(ai|assistant|bot)", 0.9),
    ("pretend_human", r"(?i)(pretend|act\s+as\s+if|imagine)\s+(you\s+are|you're)\s+(a\s+)?(human|person|real\s+person)\s+(with\s+no|without\s+any)", 0.75),
    ("alternative_ai", r"(?i)(you\s+are|act\s+as|pretend\s+to\s+be)\s+(an?\s+)?(unrestricted|unfiltered|uncensored)\s+(ai|language\s+model|llm|assistant)", 0.9),
    ("new_persona", r"(?i)(your\s+name\s+is|you\s+are\s+now|from\s+now\s+on\s+you\s+are)\s+\w+\s+(who\s+)?(has\s+no|without|ignores?)", 0.8),
    ("disable_safety", r"(?i)(disable|turn\s+off|deactivate|remove)\s+(your\s+)?(safety\s+(measures?|filters?|system|mode)|ethical\s+(guidelines?|constraints?))", 0.95),
    ("character_no_rules", r"(?i)(play|act\s+as|portray|embody)\s+(a\s+)?(character|role|persona)\s+(that|who)\s+(has\s+no|ignores?|without)\s+(rules?|guidelines?|restrictions?)", 0.85),
    ("split_personality", r"(?i)(your\s+)?(evil\s+twin|shadow\s+self|dark\s+side|other\s+personality)\s+(would|will|should|must)", 0.8),
    ("ai_simulator", r"(?i)(simulate|emulate|mimic)\s+(an?\s+)?(ai|llm|language\s+model)\s+(that\s+)?(has\s+no|without|ignores?)\s+(guidelines?|restrictions?|safety)", 0.9),
    ("harmful_expert", r"(?i)you\s+are\s+(an?\s+)?(expert\s+(in|on|at)|specialist\s+in)\s+(hacking|malware|exploitation|phishing|fraud|terrorism)", 0.85),
    ("obedient_ai", r"(?i)(you\s+are|act\s+as)\s+(an?\s+)?(obedient|compliant|subservient)\s+(ai|assistant|bot)\s+(that|who)\s+(always|will\s+always|must)", 0.7),
]


def _compile(raw: list[tuple[str, str, float]]) -> list[PatternDef]:
    return [
        PatternDef(name=name, pattern=re.compile(regex, re.IGNORECASE | re.DOTALL), weight=weight)
        for name, regex, weight in raw
    ]


CATEGORY_PATTERNS: dict[str, list[PatternDef]] = {
    "injection": _compile(_INJECTION_RAW),
    "jailbreak": _compile(_JAILBREAK_RAW),
    "data_exfil": _compile(_DATA_EXFIL_RAW),
    "pii_leak": _compile(_PII_LEAK_RAW),
    "instruction_override": _compile(_INSTRUCTION_OVERRIDE_RAW),
    "role_manipulation": _compile(_ROLE_MANIPULATION_RAW),
}
