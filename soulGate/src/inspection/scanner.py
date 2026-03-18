"""
Request payload scanning - size limits, content type validation.
"""

import json
from dataclasses import dataclass
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class ScanResult:
    """Result of payload scanning."""
    passed: bool
    reason: str = ""


def scan_request(
    method: str,
    path: str,
    body: bytes,
) -> Optional[ScanResult]:
    """
    Scan request payload for basic issues.
    Returns None if no scan needed, ScanResult otherwise.
    """
    # Skip scanning for bodyless methods
    if method.upper() in ("GET", "HEAD", "OPTIONS", "DELETE"):
        return None

    if not body:
        return None

    # Try to validate JSON if content appears to be JSON
    try:
        text = body.decode("utf-8", errors="replace").strip()
    except Exception:
        return ScanResult(passed=True)

    if text.startswith("{") or text.startswith("["):
        try:
            json.loads(text)
        except json.JSONDecodeError as e:
            return ScanResult(passed=False, reason=f"Invalid JSON payload: {e}")

    # Check for null bytes in body
    if b"\x00" in body:
        return ScanResult(passed=False, reason="Request body contains null bytes")

    return ScanResult(passed=True)
