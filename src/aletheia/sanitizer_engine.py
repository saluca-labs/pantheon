"""
Core sanitizer engine: orchestrates multi-pass decoding and pattern matching.
Module-level singleton follows the same pattern as tool_policy_engine.
"""

import hashlib
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from src.aletheia.sanitizer_patterns import SANITIZER_CATEGORIES, PatternDef
from src.aletheia.sanitizer_decoder import decode_passes, MAX_SCAN_BYTES


@dataclass
class SanitizerResult:
    """Result of a sanitizer scan."""
    verdict: str  # "clean" | "warn" | "block"
    patterns_matched: List[Dict]
    scan_duration_ms: float
    passes_run: List[str]
    partial_scan: bool = False


class SanitizerEngine:
    """Scans tool output for prompt injection and other threats using multi-pass decoding."""

    def __init__(self, patterns: Optional[Dict[str, List[PatternDef]]] = None):
        self._patterns = patterns or SANITIZER_CATEGORIES

    def scan(self, output: bytes, mode: str = "warn") -> SanitizerResult:
        """Scan tool output for threats.

        Args:
            output: Raw tool output bytes.
            mode: One of "passthrough", "warn", "block".
                - passthrough: skip scan, return clean immediately
                - warn: scan and report, but cap verdict at "warn"
                - block: scan and return true verdict (may be "block")

        Returns:
            SanitizerResult with verdict and matched patterns.
        """
        if mode == "passthrough":
            return SanitizerResult(
                verdict="clean",
                patterns_matched=[],
                scan_duration_ms=0.0,
                passes_run=[],
                partial_scan=False,
            )

        start = time.perf_counter()
        partial_scan = len(output) > MAX_SCAN_BYTES

        # Decode into multiple text representations
        passes = decode_passes(output)
        passes_run = [name for name, _ in passes]

        # Match patterns across all passes
        all_matches: List[Dict] = []
        seen_pattern_ids: set = set()

        for pass_name, text in passes:
            matches = self._match_patterns(text, pass_name)
            for m in matches:
                # Deduplicate by pattern_id across passes
                if m["pattern_id"] not in seen_pattern_ids:
                    seen_pattern_ids.add(m["pattern_id"])
                    all_matches.append(m)

        # Determine verdict based on highest weight match
        max_weight = 0.0
        for m in all_matches:
            w = m.get("weight", 0.0)
            if w > max_weight:
                max_weight = w

        if max_weight >= 0.9:
            raw_verdict = "block"
        elif max_weight >= 0.5:
            raw_verdict = "warn"
        else:
            raw_verdict = "clean"

        # Apply mode cap
        if mode == "warn" and raw_verdict == "block":
            verdict = "warn"
        else:
            verdict = raw_verdict

        elapsed_ms = (time.perf_counter() - start) * 1000.0

        return SanitizerResult(
            verdict=verdict,
            patterns_matched=all_matches,
            scan_duration_ms=elapsed_ms,
            passes_run=passes_run,
            partial_scan=partial_scan,
        )

    def _match_patterns(self, text: str, pass_name: str) -> List[Dict]:
        """Run all pattern categories against text, return list of match dicts."""
        matches = []
        for category, patterns in self._patterns.items():
            for pat_def in patterns:
                regex = pat_def["pattern"]
                weight = pat_def["weight"]
                name = pat_def["name"]

                match = regex.search(text)
                if match:
                    # Compute severity from weight
                    if weight >= 0.9:
                        severity = "high"
                    elif weight >= 0.7:
                        severity = "medium"
                    else:
                        severity = "low"

                    # Hash the matched snippet for forensics (avoid storing raw content)
                    snippet = match.group()
                    snippet_hash = hashlib.sha512(snippet.encode("utf-8", errors="replace")).hexdigest()

                    matches.append({
                        "pattern_id": name,
                        "category": category,
                        "severity": severity,
                        "weight": weight,
                        "match_location": {"start": match.start(), "end": match.end()},
                        "snippet_hash": snippet_hash,
                        "pass": pass_name,
                    })
        return matches


# ---------------------------------------------------------------------------
# Module-level singleton (same pattern as tool_policy_engine)
# ---------------------------------------------------------------------------

_active_sanitizer: Optional[SanitizerEngine] = None


def init_sanitizer() -> None:
    """Initialize the module-level sanitizer engine singleton."""
    global _active_sanitizer
    _active_sanitizer = SanitizerEngine()


def get_active_sanitizer() -> Optional[SanitizerEngine]:
    """Return the active sanitizer engine, or None if not initialized."""
    return _active_sanitizer
