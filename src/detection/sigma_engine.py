"""
Sigma-compatible detection rule engine for SoulAuth audit events.

Supports core Sigma detection syntax:
- Field matching (exact, contains, startswith, endswith)
- Wildcards (* glob patterns)
- Logical operators (AND, OR, NOT)
- Lists (OR within a field)
- Numeric comparisons (gte, lte, gt, lt)
- Aggregation with count() and timeframe
"""

import fnmatch
import os
import re
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import structlog
import yaml

logger = structlog.get_logger(__name__)


@dataclass
class SigmaRule:
    """A Sigma-compatible detection rule."""

    id: str
    title: str
    description: str = ""
    status: str = "experimental"  # experimental | test | stable
    level: str = "medium"  # informational | low | medium | high | critical
    logsource: dict = field(default_factory=lambda: {"product": "soulauth", "service": "audit"})
    detection: dict = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)
    response_playbook: Optional[str] = None
    enabled: bool = True

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "level": self.level,
            "logsource": self.logsource,
            "detection": self.detection,
            "tags": self.tags,
            "response_playbook": self.response_playbook,
            "enabled": self.enabled,
        }

    def to_yaml(self) -> str:
        return yaml.dump(self.to_dict(), default_flow_style=False, sort_keys=False)


@dataclass
class SigmaMatch:
    """Result of a Sigma rule matching an event."""

    rule: SigmaRule
    event: dict
    matched_fields: dict = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "rule_id": self.rule.id,
            "rule_title": self.rule.title,
            "level": self.rule.level,
            "event": self.event,
            "matched_fields": self.matched_fields,
            "timestamp": self.timestamp.isoformat(),
            "response_playbook": self.rule.response_playbook,
        }


# ---------------------------------------------------------------------------
# Internal helpers for Sigma field matching
# ---------------------------------------------------------------------------


def _get_nested(data: dict, key: str) -> Any:
    """Get a value from a nested dict using dot notation."""
    parts = key.split(".")
    current = data
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
        if current is None:
            return None
    return current


def _match_value(event_value: Any, rule_value: Any) -> bool:
    """Check if an event value matches a rule value (with wildcard support)."""
    if event_value is None:
        return False

    ev_str = str(event_value)
    rv_str = str(rule_value)

    # Wildcard matching via fnmatch
    if "*" in rv_str or "?" in rv_str:
        return fnmatch.fnmatch(ev_str.lower(), rv_str.lower())

    # Case-insensitive exact match
    return ev_str.lower() == rv_str.lower()


def _match_field(event: dict, field_spec: str, rule_value: Any) -> tuple[bool, dict]:
    """
    Match a single field specification against an event.
    Supports modifiers: |contains, |startswith, |endswith, |gte, |lte, |gt, |lt.
    Returns (matched: bool, matched_details: dict).
    """
    # Parse modifier
    modifier = None
    field_name = field_spec
    if "|" in field_spec:
        field_name, modifier = field_spec.rsplit("|", 1)

    event_value = _get_nested(event, field_name)

    # List values are OR'd together
    if isinstance(rule_value, list):
        for rv in rule_value:
            matched, details = _match_single(event_value, rv, modifier, field_name)
            if matched:
                return True, details
        return False, {}

    return _match_single(event_value, rule_value, modifier, field_name)


def _match_single(
    event_value: Any, rule_value: Any, modifier: Optional[str], field_name: str
) -> tuple[bool, dict]:
    """Match a single value with optional modifier."""
    if event_value is None:
        return False, {}

    ev_str = str(event_value).lower()
    rv_str = str(rule_value).lower()

    matched = False
    if modifier is None:
        matched = _match_value(event_value, rule_value)
    elif modifier == "contains":
        matched = rv_str in ev_str
    elif modifier == "startswith":
        matched = ev_str.startswith(rv_str)
    elif modifier == "endswith":
        matched = ev_str.endswith(rv_str)
    elif modifier in ("gte", "ge"):
        try:
            matched = float(event_value) >= float(rule_value)
        except (ValueError, TypeError):
            matched = False
    elif modifier in ("lte", "le"):
        try:
            matched = float(event_value) <= float(rule_value)
        except (ValueError, TypeError):
            matched = False
    elif modifier == "gt":
        try:
            matched = float(event_value) > float(rule_value)
        except (ValueError, TypeError):
            matched = False
    elif modifier == "lt":
        try:
            matched = float(event_value) < float(rule_value)
        except (ValueError, TypeError):
            matched = False
    else:
        # Unknown modifier — treat as exact match
        matched = _match_value(event_value, rule_value)

    if matched:
        return True, {field_name: {"expected": rule_value, "actual": event_value}}
    return False, {}


def _evaluate_selection(event: dict, selection: dict) -> tuple[bool, dict]:
    """
    Evaluate a Sigma selection block against an event.
    All fields in a selection must match (implicit AND).
    """
    all_details: dict = {}
    for field_spec, rule_value in selection.items():
        matched, details = _match_field(event, field_spec, rule_value)
        if not matched:
            return False, {}
        all_details.update(details)
    return True, all_details


def _parse_timeframe(tf_str: str) -> Optional[timedelta]:
    """Parse a Sigma timeframe string like '5m', '1h', '30s'."""
    if not tf_str:
        return None
    match = re.match(r"^(\d+)\s*([smhd])$", tf_str.strip())
    if not match:
        return None
    value = int(match.group(1))
    unit = match.group(2)
    if unit == "s":
        return timedelta(seconds=value)
    elif unit == "m":
        return timedelta(minutes=value)
    elif unit == "h":
        return timedelta(hours=value)
    elif unit == "d":
        return timedelta(days=value)
    return None


# ---------------------------------------------------------------------------
# Aggregation state tracker
# ---------------------------------------------------------------------------


@dataclass
class _AggregationState:
    """Tracks events for aggregation-based conditions."""
    events: deque = field(default_factory=lambda: deque(maxlen=10000))

    def add_event(self, event: dict, timestamp: datetime):
        self.events.append((timestamp, event))

    def count_in_window(self, window: timedelta, now: datetime) -> int:
        cutoff = now - window
        count = 0
        for ts, _ in self.events:
            if ts >= cutoff:
                count += 1
        return count

    def prune(self, window: timedelta, now: datetime):
        cutoff = now - window
        while self.events and self.events[0][0] < cutoff:
            self.events.popleft()


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class SigmaEngine:
    """
    Sigma-compatible detection rule engine.
    Evaluates SoulAuth audit events against loaded Sigma rules.
    """

    def __init__(self):
        self._rules: dict[str, SigmaRule] = {}
        # Aggregation state per rule_id per grouping key
        self._agg_state: dict[str, dict[str, _AggregationState]] = {}
        # Recent matches ring buffer
        self._recent_matches: deque[SigmaMatch] = deque(maxlen=5000)

    # ---- Rule management ----

    def load_rules(self, rules_dir: str) -> int:
        """Load all .yml/.yaml Sigma rules from a directory. Returns count loaded."""
        rules_path = Path(rules_dir)
        if not rules_path.is_dir():
            logger.warning("sigma.rules_dir_not_found", path=rules_dir)
            return 0

        count = 0
        for fpath in sorted(rules_path.glob("*.yml")):
            try:
                rule = self.load_rule(fpath.read_text())
                self._rules[rule.id] = rule
                count += 1
            except Exception as e:
                logger.warning("sigma.rule_load_failed", file=str(fpath), error=str(e))

        for fpath in sorted(rules_path.glob("*.yaml")):
            try:
                rule = self.load_rule(fpath.read_text())
                self._rules[rule.id] = rule
                count += 1
            except Exception as e:
                logger.warning("sigma.rule_load_failed", file=str(fpath), error=str(e))

        logger.info("sigma.rules_loaded", count=count, directory=rules_dir)
        return count

    def load_rule(self, yaml_str: str) -> SigmaRule:
        """Parse a single Sigma rule from YAML string."""
        data = yaml.safe_load(yaml_str)
        if not isinstance(data, dict):
            raise ValueError("Sigma rule must be a YAML mapping")

        rule_id = data.get("id", str(uuid.uuid4()))
        title = data.get("title", "Untitled Rule")
        description = data.get("description", "")
        status = data.get("status", "experimental")
        level = data.get("level", "medium")
        logsource = data.get("logsource", {"product": "soulauth", "service": "audit"})
        detection = data.get("detection", {})
        tags = data.get("tags", [])
        response_playbook = data.get("response_playbook")
        enabled = data.get("enabled", True)

        return SigmaRule(
            id=rule_id,
            title=title,
            description=description,
            status=status,
            level=level,
            logsource=logsource,
            detection=detection,
            tags=tags,
            response_playbook=response_playbook,
            enabled=enabled,
        )

    def add_rule(self, rule: SigmaRule):
        """Add or replace a rule at runtime."""
        self._rules[rule.id] = rule
        logger.info("sigma.rule_added", rule_id=rule.id, title=rule.title)

    def remove_rule(self, rule_id: str) -> bool:
        """Remove a rule by ID. Returns True if found and removed."""
        if rule_id in self._rules:
            del self._rules[rule_id]
            self._agg_state.pop(rule_id, None)
            logger.info("sigma.rule_removed", rule_id=rule_id)
            return True
        return False

    def list_rules(self) -> list[SigmaRule]:
        """List all loaded rules."""
        return list(self._rules.values())

    def get_rule(self, rule_id: str) -> Optional[SigmaRule]:
        """Get a specific rule by ID."""
        return self._rules.get(rule_id)

    # ---- Evaluation ----

    def evaluate(self, event: dict) -> list[SigmaMatch]:
        """
        Evaluate an event against all active rules.
        Returns list of SigmaMatch for every rule that matched.
        """
        matches: list[SigmaMatch] = []
        now = datetime.now(timezone.utc)

        for rule in self._rules.values():
            if not rule.enabled:
                continue

            match = self._evaluate_rule(rule, event, now)
            if match:
                matches.append(match)
                self._recent_matches.append(match)

        return matches

    def get_recent_matches(
        self,
        limit: int = 100,
        rule_id: Optional[str] = None,
        level: Optional[str] = None,
        since: Optional[datetime] = None,
    ) -> list[SigmaMatch]:
        """Retrieve recent matches with optional filters."""
        results = list(self._recent_matches)
        results.reverse()

        if rule_id:
            results = [m for m in results if m.rule.id == rule_id]
        if level:
            results = [m for m in results if m.rule.level == level]
        if since:
            results = [m for m in results if m.timestamp >= since]

        return results[:limit]

    def get_status(self) -> dict:
        """Engine status summary."""
        now = datetime.now(timezone.utc)
        one_hour_ago = now - timedelta(hours=1)
        recent_count = sum(1 for m in self._recent_matches if m.timestamp >= one_hour_ago)

        by_level = {}
        for rule in self._rules.values():
            by_level[rule.level] = by_level.get(rule.level, 0) + 1

        return {
            "rules_loaded": len(self._rules),
            "rules_enabled": sum(1 for r in self._rules.values() if r.enabled),
            "rules_by_level": by_level,
            "matches_last_hour": recent_count,
            "total_matches_buffered": len(self._recent_matches),
        }

    # ---- Internal evaluation logic ----

    def _evaluate_rule(self, rule: SigmaRule, event: dict, now: datetime) -> Optional[SigmaMatch]:
        """Evaluate a single rule against an event."""
        detection = rule.detection
        if not detection:
            return None

        condition_str = detection.get("condition", "")
        timeframe_str = detection.get("timeframe")
        timeframe = _parse_timeframe(timeframe_str) if timeframe_str else None

        # Gather named selections (everything in detection except 'condition' and 'timeframe')
        selections: dict[str, dict] = {}
        for key, value in detection.items():
            if key in ("condition", "timeframe"):
                continue
            if isinstance(value, dict):
                selections[key] = value

        if not condition_str:
            # No condition — if there's a single selection, use it
            if len(selections) == 1:
                sel_name = list(selections.keys())[0]
                matched, details = _evaluate_selection(event, selections[sel_name])
                if matched:
                    return SigmaMatch(rule=rule, event=event, matched_fields=details, timestamp=now)
            return None

        # Check for aggregation condition: "selection | count() > N"
        agg_match = re.match(
            r"^\s*(\w+)\s*\|\s*count\(\)\s*([><=!]+)\s*(\d+)\s*$", condition_str
        )
        if agg_match:
            return self._evaluate_aggregation(
                rule, event, now, agg_match, selections, timeframe
            )

        # Parse logical condition
        matched, details = self._evaluate_condition(condition_str, event, selections)
        if matched:
            return SigmaMatch(rule=rule, event=event, matched_fields=details, timestamp=now)

        return None

    def _evaluate_condition(
        self, condition: str, event: dict, selections: dict[str, dict]
    ) -> tuple[bool, dict]:
        """
        Evaluate a Sigma condition expression.
        Supports: selection1 AND selection2, selection1 OR selection2, NOT selection, parentheses.
        """
        condition = condition.strip()

        # Handle NOT
        not_match = re.match(r"^NOT\s+(.+)$", condition, re.IGNORECASE)
        if not_match:
            inner_matched, _ = self._evaluate_condition(not_match.group(1), event, selections)
            return (not inner_matched, {})

        # Handle AND (split on ' AND ')
        if " AND " in condition.upper():
            parts = re.split(r"\s+AND\s+", condition, flags=re.IGNORECASE)
            all_details: dict = {}
            for part in parts:
                matched, details = self._evaluate_condition(part.strip(), event, selections)
                if not matched:
                    return False, {}
                all_details.update(details)
            return True, all_details

        # Handle OR (split on ' OR ')
        if " OR " in condition.upper():
            parts = re.split(r"\s+OR\s+", condition, flags=re.IGNORECASE)
            for part in parts:
                matched, details = self._evaluate_condition(part.strip(), event, selections)
                if matched:
                    return True, details
            return False, {}

        # Base case: a named selection reference
        sel_name = condition.strip()
        if sel_name in selections:
            return _evaluate_selection(event, selections[sel_name])

        return False, {}

    def _evaluate_aggregation(
        self,
        rule: SigmaRule,
        event: dict,
        now: datetime,
        agg_match: re.Match,
        selections: dict[str, dict],
        timeframe: Optional[timedelta],
    ) -> Optional[SigmaMatch]:
        """Evaluate an aggregation condition like 'selection | count() > 5'."""
        sel_name = agg_match.group(1)
        operator = agg_match.group(2)
        threshold = int(agg_match.group(3))

        if sel_name not in selections:
            return None

        # Check if current event matches the selection
        matched, details = _evaluate_selection(event, selections[sel_name])
        if not matched:
            return None

        # Build grouping key from event (use soulkey_id or persona_id or source_ip)
        group_key = (
            str(event.get("soulkey_id", ""))
            or str(event.get("persona_id", ""))
            or str(event.get("context", {}).get("source_ip", ""))
            or "global"
        )

        # Track in aggregation state
        if rule.id not in self._agg_state:
            self._agg_state[rule.id] = {}
        if group_key not in self._agg_state[rule.id]:
            self._agg_state[rule.id][group_key] = _AggregationState()

        state = self._agg_state[rule.id][group_key]
        state.add_event(event, now)

        # Apply timeframe window
        window = timeframe or timedelta(minutes=5)
        state.prune(window, now)
        count = state.count_in_window(window, now)

        # Evaluate comparison
        triggered = False
        if operator == ">":
            triggered = count > threshold
        elif operator == ">=":
            triggered = count >= threshold
        elif operator == "<":
            triggered = count < threshold
        elif operator == "<=":
            triggered = count <= threshold
        elif operator == "==":
            triggered = count == threshold
        elif operator == "!=":
            triggered = count != threshold

        if triggered:
            details["_aggregation"] = {
                "count": count,
                "threshold": threshold,
                "operator": operator,
                "window": str(window),
                "group_key": group_key,
            }
            return SigmaMatch(rule=rule, event=event, matched_fields=details, timestamp=now)

        return None
