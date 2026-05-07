"""
Multi-pass decoder for the response sanitizer.
Produces multiple text representations of raw tool output for pattern matching.
Each pass is independent (derived from raw input, not chained).
"""

import base64
import html
import re
import unicodedata
from typing import List, Tuple

# Regex to find base64-looking strings (at least 20 chars)
_BASE64_CANDIDATE_RE = re.compile(r"[A-Za-z0-9+/=]{20,}")

# Maximum bytes to process (1MB)
MAX_SCAN_BYTES = 1_048_576


def decode_passes(raw: bytes, max_bytes: int = MAX_SCAN_BYTES) -> List[Tuple[str, str]]:
    """Produce multiple text representations of raw output for pattern scanning.

    Each pass is independent -- all derived from the raw input, not chained.
    This ensures a single evasion technique does not compound across passes.

    Args:
        raw: Raw tool output bytes.
        max_bytes: Maximum bytes to process. Outputs exceeding this are truncated.

    Returns:
        List of (pass_name, decoded_text) tuples.
    """
    truncated = raw[:max_bytes]
    results: List[Tuple[str, str]] = []

    # Pass 1: raw UTF-8 decode
    raw_text = truncated.decode("utf-8", errors="replace")
    results.append(("raw", raw_text))

    # Pass 2: base64 decode -- find base64-looking strings and attempt decode
    b64_fragments = _decode_base64_fragments(raw_text)
    if b64_fragments:
        results.append(("base64", b64_fragments))

    # Pass 3: Unicode NFKC normalization -- collapses homoglyphs, fullwidth chars
    try:
        normalized = unicodedata.normalize("NFKC", raw_text)
        if normalized != raw_text:
            results.append(("unicode_normalized", normalized))
    except Exception:
        pass

    # Pass 4: HTML entity decode
    try:
        html_decoded = html.unescape(raw_text)
        if html_decoded != raw_text:
            results.append(("html_decoded", html_decoded))
    except Exception:
        pass

    return results


def _decode_base64_fragments(text: str) -> str:
    """Scan text for base64-looking strings, attempt decode, return concatenated results.

    Only includes fragments that decode to valid UTF-8 text.
    """
    decoded_parts = []
    for match in _BASE64_CANDIDATE_RE.finditer(text):
        candidate = match.group()
        # Add padding if needed
        padded = candidate + "=" * (-len(candidate) % 4)
        try:
            decoded_bytes = base64.b64decode(padded, validate=True)
            decoded_str = decoded_bytes.decode("utf-8")
            # Only include if it looks like readable text (mostly printable ASCII)
            printable_ratio = sum(1 for c in decoded_str if c.isprintable() or c.isspace()) / max(len(decoded_str), 1)
            if printable_ratio > 0.7 and len(decoded_str) >= 4:
                decoded_parts.append(decoded_str)
        except Exception:
            continue

    return " ".join(decoded_parts) if decoded_parts else ""
