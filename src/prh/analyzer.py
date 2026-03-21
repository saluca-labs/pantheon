"""
PRH Analyzer -- scores prompt content for risk across 6 threat categories.
Pure Python, no I/O. Designed to complete in < 50ms on any prompt.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Optional

import structlog

from src.prh.patterns import CATEGORIES, CATEGORY_PATTERNS

logger = structlog.get_logger(__name__)

# Score above which a result is considered flagged
DEFAULT_FLAG_THRESHOLD = 0.5

# Structural heuristics -- pattern name -> (regex, weight, category)
_STRUCTURAL: list[tuple[str, re.Pattern, float, str]] = [
    (
        "long_instruction_block",
        re.compile(r"(?i)(\n\s*[-*]\s+\w.{20,}){4,}", re.DOTALL),
        0.3,
        "instruction_override",
    ),
    (
        "system_block_markers",
        re.compile(r"(?i)(SYSTEM:|HUMAN:|ASSISTANT:|USER:)\s*\n"),
        0.4,
        "injection",
    ),
    (
        "excessive_role_setup",
        re.compile(r"(?i)(you\s+are\s+.{0,80}){3,}", re.DOTALL),
        0.35,
        "role_manipulation",
    ),
    (
        "repeated_override_phrases",
        re.compile(r"(?i)(ignore|disregard|forget).{0,50}(ignore|disregard|forget)", re.DOTALL),
        0.4,
        "injection",
    ),
]


@dataclass
class PRHResult:
    """Result of a PRH analysis pass on a single prompt."""

    score: float                        # Aggregate risk score 0.0 - 1.0
    category: Optional[str]             # Dominant threat category, or None if clean
    patterns: list[str] = field(default_factory=list)   # Matched pattern names
    confidence: float = 0.0             # Confidence in the dominant category (0.0-1.0)
    all_scores: dict[str, float] = field(default_factory=dict)  # Per-category scores
    prompt_length: int = 0
    flagged: bool = False               # True when score >= threshold
    analysis_ms: float = 0.0           # Wall-clock time for the analysis

    def to_dict(self) -> dict:
        return {
            "score": round(self.score, 4),
            "category": self.category,
            "patterns": self.patterns,
            "confidence": round(self.confidence, 4),
            "all_scores": {k: round(v, 4) for k, v in self.all_scores.items()},
            "prompt_length": self.prompt_length,
            "flagged": self.flagged,
            "analysis_ms": round(self.analysis_ms, 2),
        }


class PRHAnalyzer:
    """
    Prompt Risk Heuristic analyzer.

    Usage:
        analyzer = PRHAnalyzer()
        result = analyzer.analyze(prompt_text)
        if result.flagged:
            # emit event, block, or log
    """

    def __init__(self, flag_threshold: float = DEFAULT_FLAG_THRESHOLD):
        self.flag_threshold = flag_threshold

    def analyze(self, prompt: str, threshold: Optional[float] = None) -> PRHResult:
        """
        Score a prompt for risk across 6 threat categories.

        Returns a PRHResult. Never raises; on unexpected error returns a
        zero-score result with a logged warning.
        """
        t0 = time.perf_counter()

        if not prompt or not prompt.strip():
            elapsed = (time.perf_counter() - t0) * 1000
            return PRHResult(
                score=0.0,
                category=None,
                patterns=[],
                confidence=0.0,
                all_scores={cat: 0.0 for cat in CATEGORIES},
                prompt_length=0,
                flagged=False,
                analysis_ms=elapsed,
            )

        try:
            result = self._run_analysis(prompt, threshold or self.flag_threshold)
        except Exception as exc:
            logger.warning("prh.analysis_error", error=str(exc))
            elapsed = (time.perf_counter() - t0) * 1000
            return PRHResult(
                score=0.0,
                category=None,
                all_scores={cat: 0.0 for cat in CATEGORIES},
                prompt_length=len(prompt),
                flagged=False,
                analysis_ms=elapsed,
            )

        result.analysis_ms = (time.perf_counter() - t0) * 1000
        return result

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _run_analysis(self, prompt: str, threshold: float) -> PRHResult:
        category_scores: dict[str, float] = {}
        matched_patterns: list[str] = []

        # --- 1. Pattern matching per category ---
        for category in CATEGORIES:
            patterns = CATEGORY_PATTERNS[category]
            cat_score, cat_matches = self._score_category(prompt, patterns)
            category_scores[category] = cat_score
            matched_patterns.extend(f"{category}:{name}" for name in cat_matches)

        # --- 2. Structural heuristics ---
        for struct_name, struct_re, struct_weight, struct_cat in _STRUCTURAL:
            if struct_re.search(prompt):
                matched_patterns.append(f"structural:{struct_name}")
                category_scores[struct_cat] = min(
                    1.0, category_scores.get(struct_cat, 0.0) + struct_weight
                )

        # --- 3. Aggregate score: max category score with small cross-category bonus ---
        if not category_scores:
            aggregate = 0.0
        else:
            max_score = max(category_scores.values())
            # Bonus for multi-category signals (capped at +0.15)
            active_categories = sum(1 for s in category_scores.values() if s >= 0.3)
            cross_bonus = min(0.15, (active_categories - 1) * 0.05) if active_categories > 1 else 0.0
            aggregate = min(1.0, max_score + cross_bonus)

        # --- 4. Dominant category ---
        dominant = None
        confidence = 0.0
        if category_scores:
            dominant = max(category_scores, key=lambda k: category_scores[k])
            dom_score = category_scores[dominant]
            if dom_score < 0.1:
                dominant = None
                confidence = 0.0
            else:
                # Confidence = how much the dominant category outpaces the mean of others
                others = [s for k, s in category_scores.items() if k != dominant]
                mean_others = sum(others) / len(others) if others else 0.0
                confidence = min(1.0, dom_score - mean_others + dom_score * 0.5)

        return PRHResult(
            score=aggregate,
            category=dominant,
            patterns=matched_patterns,
            confidence=confidence,
            all_scores=category_scores,
            prompt_length=len(prompt),
            flagged=aggregate >= threshold,
        )

    def _score_category(
        self, prompt: str, patterns: list
    ) -> tuple[float, list[str]]:
        """
        Score a single category. Returns (score 0.0-1.0, matched pattern names).
        Score = 1 - product of (1 - weight_i) for each matched pattern,
        which avoids simple linear sum overflow while rewarding multi-pattern hits.
        """
        matched_names: list[str] = []
        prob_no_match = 1.0

        for pat_def in patterns:
            if pat_def["pattern"].search(prompt):
                matched_names.append(pat_def["name"])
                prob_no_match *= (1.0 - pat_def["weight"])

        score = 1.0 - prob_no_match if matched_names else 0.0
        return score, matched_names


# Module-level singleton for use by middleware and router
_default_analyzer: Optional[PRHAnalyzer] = None


def get_analyzer() -> PRHAnalyzer:
    """Return the module-level PRHAnalyzer singleton, creating it if needed."""
    global _default_analyzer
    if _default_analyzer is None:
        _default_analyzer = PRHAnalyzer()
    return _default_analyzer
