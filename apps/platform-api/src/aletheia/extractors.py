"""
Provider-specific CoT (Chain-of-Thought) extractors.
Extracts reasoning traces from Anthropic thinking blocks, OpenAI reasoning tokens,
Gemini thinking parts, and local model <thinking> tags.
"""

import re
from dataclasses import dataclass

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class CotExtraction:
    """Result of extracting CoT reasoning from an LLM response."""
    provider: str           # "anthropic" | "openai" | "gemini" | "local"
    reasoning_text: str | None  # Full reasoning content (None for OpenAI)
    token_count: int        # Reasoning token count
    byte_count: int         # Byte length of reasoning text (0 if unavailable)
    model: str              # Model identifier from response
    has_reasoning: bool     # Whether reasoning was detected


def extract_anthropic(body: dict) -> CotExtraction | None:
    """Extract thinking blocks from Anthropic Claude responses.

    Looks for content array entries where type == "thinking".
    Token count from usage.cache_creation_input_tokens or estimate len(text)//4.
    """
    content = body.get("content")
    if not isinstance(content, list):
        return None

    thinking_parts = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "thinking":
            text = block.get("thinking", "")
            if text:
                thinking_parts.append(text)

    if not thinking_parts:
        return None

    reasoning_text = "\n".join(thinking_parts)
    byte_count = len(reasoning_text.encode("utf-8"))

    # Token count: prefer usage stats, else estimate
    usage = body.get("usage", {})
    token_count = usage.get("cache_creation_input_tokens", 0)
    if not token_count:
        token_count = len(reasoning_text) // 4

    model = body.get("model", "unknown")

    return CotExtraction(
        provider="anthropic",
        reasoning_text=reasoning_text,
        token_count=token_count,
        byte_count=byte_count,
        model=model,
        has_reasoning=True,
    )


def extract_openai(body: dict) -> CotExtraction | None:
    """Extract reasoning token count from OpenAI o-series responses.

    OpenAI does not expose reasoning content, only token counts.
    """
    usage = body.get("usage", {})
    completion_details = usage.get("completion_tokens_details", {})
    if not isinstance(completion_details, dict):
        return None

    reasoning_tokens = completion_details.get("reasoning_tokens", 0)
    if not reasoning_tokens or reasoning_tokens <= 0:
        return None

    model = body.get("model", "unknown")

    return CotExtraction(
        provider="openai",
        reasoning_text=None,
        token_count=reasoning_tokens,
        byte_count=0,
        model=model,
        has_reasoning=True,
    )


def extract_gemini(body: dict) -> CotExtraction | None:
    """Extract thinking parts from Gemini responses.

    Looks for candidates[0].content.parts where thought == True.
    """
    candidates = body.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return None

    content = candidates[0].get("content", {})
    parts = content.get("parts", [])
    if not isinstance(parts, list):
        return None

    thinking_parts = []
    for part in parts:
        if isinstance(part, dict) and part.get("thought") is True:
            text = part.get("text", "")
            if text:
                thinking_parts.append(text)

    if not thinking_parts:
        return None

    reasoning_text = "\n".join(thinking_parts)
    byte_count = len(reasoning_text.encode("utf-8"))
    token_count = len(reasoning_text) // 4  # estimate

    model = body.get("modelVersion", body.get("model", "unknown"))

    return CotExtraction(
        provider="gemini",
        reasoning_text=reasoning_text,
        token_count=token_count,
        byte_count=byte_count,
        model=model,
        has_reasoning=True,
    )


def extract_local(body: dict) -> CotExtraction | None:
    """Extract <thinking> tags from local model responses (best-effort).

    Searches all text content for <thinking>...</thinking> blocks.
    """
    # Try common response shapes
    text = ""
    # OpenAI-compatible format
    choices = body.get("choices", [])
    if isinstance(choices, list):
        for choice in choices:
            msg = choice.get("message", {})
            if isinstance(msg, dict):
                text += msg.get("content", "") or ""

    # Direct content field
    if not text:
        content = body.get("content", "")
        if isinstance(content, str):
            text = content

    if not text:
        return None

    matches = re.findall(r"<thinking>(.*?)</thinking>", text, re.DOTALL)
    if not matches:
        return None

    reasoning_text = "\n".join(matches)
    byte_count = len(reasoning_text.encode("utf-8"))
    token_count = len(reasoning_text) // 4

    model = body.get("model", "local")

    return CotExtraction(
        provider="local",
        reasoning_text=reasoning_text,
        token_count=token_count,
        byte_count=byte_count,
        model=model,
        has_reasoning=True,
    )


def detect_provider(upstream_name: str) -> str:
    """Normalize an upstream name to a known provider identifier.

    Returns one of: "anthropic", "openai", "gemini", "local".
    """
    name_lower = upstream_name.lower()
    if "anthropic" in name_lower or "claude" in name_lower:
        return "anthropic"
    if "openai" in name_lower or "gpt" in name_lower or "o1" in name_lower or "o3" in name_lower:
        return "openai"
    if "gemini" in name_lower or "google" in name_lower:
        return "gemini"
    return "local"


def extract_cot(provider: str, body: dict) -> CotExtraction | None:
    """Dispatch to the correct provider extractor.

    Returns None on any error (never raises).
    """
    extractors = {
        "anthropic": extract_anthropic,
        "openai": extract_openai,
        "gemini": extract_gemini,
        "local": extract_local,
    }

    try:
        extractor = extractors.get(provider, extract_local)
        return extractor(body)
    except Exception:
        logger.warning("cot_extract.failed", provider=provider, exc_info=True)
        return None
