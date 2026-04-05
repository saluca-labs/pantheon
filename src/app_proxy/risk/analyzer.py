"""BehavioralAnalyzer — detects suspicious cross-tool patterns from agent behavior sequences.

Maintains a sliding window of recent tool calls per agent and matches
against known threat patterns.  All in-memory, no DB queries in the
hot path.  Thread-safe via threading.Lock.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field

import structlog

logger = structlog.stdlib.get_logger("app_proxy.risk.analyzer")


def _get_patterns():
    """Lazy import to break circular dependency with patterns_behavioral."""
    from app_proxy.risk.patterns_behavioral import ALL_BEHAVIORAL_PATTERNS
    return ALL_BEHAVIORAL_PATTERNS


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class ToolEvent:
    """A single tool-call event recorded for behavioral analysis."""

    agent_id: str
    tool_name: str
    plugin_name: str
    arguments_keys: list[str]
    timestamp: float = field(default_factory=time.time)
    risk_score: int = 0
    status: str = "success"  # success | denied | pending


@dataclass(slots=True)
class BehavioralAlert:
    """An alert raised when a behavioral pattern matches."""

    pattern_name: str
    severity: str  # warning | critical
    description: str
    events: list[ToolEvent]
    recommendation: str


# ---------------------------------------------------------------------------
# Analyzer
# ---------------------------------------------------------------------------
class BehavioralAnalyzer:
    """Detects suspicious cross-tool patterns from agent behavior sequences.

    Maintains a sliding window of recent tool calls per agent and matches
    against known threat patterns.
    """

    def __init__(self, window_minutes: int = 30, max_history: int = 100) -> None:
        self._window_seconds: float = window_minutes * 60.0
        self._max_history: int = max_history
        self._history: dict[str, deque[ToolEvent]] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _prune(self, agent_id: str) -> None:
        """Remove events older than the sliding window.  Caller holds lock."""
        q = self._history.get(agent_id)
        if q is None:
            return
        cutoff = time.time() - self._window_seconds
        while q and q[0].timestamp < cutoff:
            q.popleft()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def record(self, event: ToolEvent) -> None:
        """Record a tool call event for an agent."""
        with self._lock:
            q = self._history.setdefault(event.agent_id, deque(maxlen=self._max_history))
            q.append(event)
            self._prune(event.agent_id)

    def analyze(self, agent_id: str) -> list[BehavioralAlert]:
        """Analyze recent history for the agent, return any alerts."""
        with self._lock:
            self._prune(agent_id)
            q = self._history.get(agent_id)
            if not q:
                return []
            # Snapshot under lock so pattern functions don't need to hold it.
            snapshot = deque(q)

        alerts: list[BehavioralAlert] = []
        for pattern_fn in _get_patterns():
            alert = pattern_fn(snapshot)
            if alert is not None:
                logger.warning(
                    "behavioral.alert",
                    agent_id=agent_id,
                    pattern=alert.pattern_name,
                    severity=alert.severity,
                    description=alert.description,
                )
                alerts.append(alert)
        return alerts

    def check_and_record(self, event: ToolEvent) -> list[BehavioralAlert]:
        """Record + analyze in one call (convenience)."""
        self.record(event)
        return self.analyze(event.agent_id)
