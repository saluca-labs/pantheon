"""Tiresias Incident Controller — Alert correlator.

Maintains a sliding window of recent alerts and matches them against
YAML-defined correlation rules to determine incident type and severity.
"""

import logging
import re
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import yaml

from src.detector.alert_receiver import Alert
from src.models.incident import IncidentType, Severity

logger = logging.getLogger("tiresias.detector.correlator")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_DURATION_RE = re.compile(r"(\d+)\s*(s|m|h)")

def _parse_duration(text: str) -> timedelta:
    """Parse a human duration string like '5m' or '120s' into a timedelta."""
    match = _DURATION_RE.search(text)
    if not match:
        return timedelta(minutes=5)
    value, unit = int(match.group(1)), match.group(2)
    if unit == "s":
        return timedelta(seconds=value)
    if unit == "m":
        return timedelta(minutes=value)
    return timedelta(hours=value)


def _alert_matches_condition(alert: Alert, condition: dict) -> bool:
    """Check whether a single alert satisfies a condition dict.

    A condition may specify:
    - ``alertname``: must match the alert's ``alertname`` label.
    - ``labels``: dict of key/value pairs that must all be present.
    - ``status``: must match the alert status.
    - ``threshold``: string like ``"> 50"`` compared against the first
      value in ``alert.values``.
    """
    if "alertname" in condition:
        if alert.labels.get("alertname") != condition["alertname"]:
            return False

    if "labels" in condition:
        for key, value in condition["labels"].items():
            if alert.labels.get(key) != value:
                return False

    if "status" in condition:
        if alert.status != condition["status"]:
            return False

    if "threshold" in condition:
        threshold_str = str(condition["threshold"]).strip()
        try:
            # Extract operator and numeric value
            if threshold_str.startswith(">"):
                threshold_val = float(threshold_str.lstrip("> "))
                alert_val = next(iter(alert.values.values()), None) if alert.values else None
                if alert_val is None or float(alert_val) <= threshold_val:
                    return False
            elif threshold_str.startswith("<"):
                threshold_val = float(threshold_str.lstrip("< "))
                alert_val = next(iter(alert.values.values()), None) if alert.values else None
                if alert_val is None or float(alert_val) >= threshold_val:
                    return False
        except (ValueError, TypeError, StopIteration):
            return False

    return True


# ---------------------------------------------------------------------------
# Correlator
# ---------------------------------------------------------------------------

class Correlator:
    """Matches alerts against YAML correlation rules within a sliding window."""

    def __init__(self, rules_path: str, window_minutes: int = 10) -> None:
        self._rules: list[dict] = []
        self._window = timedelta(minutes=window_minutes)
        self._buffer: deque[Alert] = deque()
        self._load_rules(rules_path)

    # ------------------------------------------------------------------
    # Rule loading
    # ------------------------------------------------------------------

    def _load_rules(self, rules_path: str) -> None:
        path = Path(rules_path)
        if not path.exists():
            logger.warning("correlation_rules_not_found", extra={"path": str(path)})
            return
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        self._rules = data.get("rules", data.get("correlations", []))
        logger.info(
            "correlation_rules_loaded",
            extra={"path": str(path), "rule_count": len(self._rules)},
        )

    # ------------------------------------------------------------------
    # Sliding window management
    # ------------------------------------------------------------------

    def _prune_window(self) -> None:
        """Remove alerts older than the window from the buffer."""
        cutoff = datetime.utcnow() - self._window
        while self._buffer and (self._buffer[0].starts_at or datetime.min) < cutoff:
            self._buffer.popleft()

    def _add_to_buffer(self, alerts: list[Alert]) -> None:
        for alert in alerts:
            if alert.starts_at is None:
                alert.starts_at = datetime.utcnow()
            self._buffer.append(alert)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def correlate(self, alerts: list[Alert]) -> Optional[tuple[IncidentType, Severity]]:
        """Match incoming alerts against correlation rules.

        Returns the ``(IncidentType, Severity)`` of the first matching rule,
        or ``None`` if no rule matches.
        """
        self._add_to_buffer(alerts)
        self._prune_window()

        buffered = list(self._buffer)

        for rule in self._rules:
            if self._evaluate_rule(rule, buffered):
                try:
                    incident_type = IncidentType(rule["incident_type"])
                    severity = Severity(rule["severity"])
                except (KeyError, ValueError) as exc:
                    logger.error(
                        "invalid_rule_mapping",
                        extra={"rule": rule.get("name", "?"), "error": str(exc)},
                    )
                    continue

                logger.info(
                    "correlation_matched",
                    extra={
                        "rule": rule.get("name", "unnamed"),
                        "incident_type": incident_type.value,
                        "severity": severity.value,
                        "buffer_size": len(buffered),
                    },
                )
                return incident_type, severity

        return None

    # ------------------------------------------------------------------
    # Rule evaluation
    # ------------------------------------------------------------------

    def _evaluate_rule(self, rule: dict, buffered: list[Alert]) -> bool:
        """Evaluate a single correlation rule against the alert buffer."""
        mode = rule.get("mode", "all_of")
        conditions: list[dict] = rule.get("conditions", [])
        rule_window = _parse_duration(rule.get("window", "10m"))

        if not conditions:
            return False

        # Filter buffer to the rule-specific window
        cutoff = datetime.utcnow() - rule_window
        window_alerts = [
            a for a in buffered
            if (a.starts_at or datetime.min) >= cutoff
        ]

        if mode == "all_of":
            return self._match_all_of(conditions, window_alerts)
        if mode == "any_of":
            return self._match_any_of(conditions, window_alerts)

        logger.warning("unknown_rule_mode", extra={"mode": mode})
        return False

    def _match_all_of(self, conditions: list[dict], alerts: list[Alert]) -> bool:
        """All conditions must be satisfied by at least one alert each."""
        for condition in conditions:
            count_threshold = condition.get("count", 1)
            matching = sum(1 for a in alerts if _alert_matches_condition(a, condition))
            if matching < count_threshold:
                return False
        return True

    def _match_any_of(self, conditions: list[dict], alerts: list[Alert]) -> bool:
        """Any single condition matching is sufficient."""
        for condition in conditions:
            count_threshold = condition.get("count", 1)
            matching = sum(1 for a in alerts if _alert_matches_condition(a, condition))
            if matching >= count_threshold:
                return True
        return False
