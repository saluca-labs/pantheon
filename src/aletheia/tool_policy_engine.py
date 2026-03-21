"""
Tool Policy Engine — evaluates tool invocations against ToolPolicy rules.
Follows the singleton/hot-reload pattern of cot_enforcer.py.
"""

import time
from collections import deque
from dataclasses import dataclass, field
from fnmatch import fnmatch
from typing import Optional

import structlog

from src.aletheia.tool_policy import (
    ToolPolicy,
    ToolPolicyRule,
    AgentOverride,
    RateLimitSpec,
    load_tool_policies_from_dir,
)

logger = structlog.get_logger(__name__)


@dataclass
class ToolPolicyResult:
    """Result of evaluating a tool invocation against policies."""
    verdict: str = "allow"  # "allow" | "deny" | "warn"
    rule_matched: Optional[str] = None
    reason: str = ""
    override_applied: bool = False
    rate_limited: bool = False


class ToolPolicyEngine:
    """Evaluates tool invocations against a set of ToolPolicy rules."""

    def __init__(self, policies: list[ToolPolicy]):
        self.policies = policies
        # Rate limit state: key = "agent_id:rule_name" -> deque of timestamps
        self._rate_counters: dict[str, deque] = {}

    @property
    def policy_count(self) -> int:
        return len(self.policies)

    @property
    def total_rules(self) -> int:
        return sum(len(p.rules) for p in self.policies)

    def evaluate(
        self,
        agent_id: str,
        tenant_id: str,
        command: str,
        args: list[str],
    ) -> ToolPolicyResult:
        """Evaluate a command against all active policies.

        Priority: deny > warn > allow. Agent overrides checked first.
        Rate limits can escalate allow/warn to deny.
        """
        args_str = " ".join(args)
        # For compound matching: "command arg1 arg2"
        full_command = f"{command} {args_str}".strip() if args else command

        # Collect results across all policies; deny wins
        worst_verdict = "allow"
        worst_result = ToolPolicyResult(verdict="allow", reason="no matching rule")

        for policy in self.policies:
            if not policy.enabled:
                continue

            # Check agent-level override first
            override = policy.agent_overrides.get(agent_id)
            if override:
                # Agent with default_action deny + allowed_commands whitelist
                if override.default_action == "deny" and override.allowed_commands is not None:
                    allowed = any(
                        fnmatch(command, pat) or fnmatch(full_command, pat)
                        for pat in override.allowed_commands
                    )
                    if not allowed:
                        return ToolPolicyResult(
                            verdict="deny",
                            reason=f"Agent {agent_id} not in allowed_commands whitelist",
                            override_applied=True,
                        )

                # Build override map: rule_name -> overridden action
                override_map = {
                    r["name"]: r["action"]
                    for r in override.override_rules
                    if isinstance(r, dict) and "name" in r and "action" in r
                }
            else:
                override_map = {}

            # Evaluate each rule
            for rule in policy.rules:
                if not self._matches_command(rule, command, full_command):
                    continue

                # Check args pattern if present
                if rule.match.args_pattern and rule.match._compiled_pattern:
                    if not rule.match._compiled_pattern.search(args_str):
                        continue

                # Determine effective action (override or original)
                effective_action = override_map.get(rule.name, rule.action)
                applied_override = rule.name in override_map

                # Check rate limit
                rate_limited = False
                if rule.rate_limit:
                    rl_key = f"{agent_id}:{rule.name}"
                    if self._check_rate_limit(rl_key, rule.rate_limit):
                        effective_action = "deny"
                        rate_limited = True

                result = ToolPolicyResult(
                    verdict=effective_action,
                    rule_matched=rule.name,
                    reason=rule.reason if not rate_limited else f"Rate limit exceeded for {rule.name}",
                    override_applied=applied_override,
                    rate_limited=rate_limited,
                )

                # Record invocation for rate limiting
                if rule.rate_limit:
                    rl_key = f"{agent_id}:{rule.name}"
                    self._record_invocation(rl_key)

                # Deny wins over warn, warn wins over allow
                if effective_action == "deny":
                    return result
                elif effective_action == "warn" and worst_verdict != "deny":
                    worst_verdict = "warn"
                    worst_result = result

        # If no rules matched, use the first policy default_action
        if worst_verdict == "allow" and worst_result.rule_matched is None:
            for policy in self.policies:
                if policy.enabled:
                    worst_result.verdict = policy.default_action
                    worst_result.reason = f"Default action from policy {policy.name}"
                    break

        return worst_result

    def _matches_command(self, rule: ToolPolicyRule, command: str, full_command: str) -> bool:
        """Check if command matches any of the rule match patterns using fnmatch."""
        for pattern in rule.match.commands:
            if fnmatch(command, pattern) or fnmatch(full_command, pattern):
                return True
        return False

    def _check_rate_limit(self, key: str, limit: RateLimitSpec) -> bool:
        """Check if rate limit is exceeded. Returns True if exceeded."""
        if key not in self._rate_counters:
            return False

        now = time.monotonic()
        timestamps = self._rate_counters[key]

        # Prune entries older than 1 hour
        cutoff_hour = now - 3600
        while timestamps and timestamps[0] < cutoff_hour:
            timestamps.popleft()

        # Check per-minute
        cutoff_minute = now - 60
        count_minute = sum(1 for t in timestamps if t >= cutoff_minute)
        if count_minute >= limit.max_per_minute:
            return True

        # Check per-hour
        if len(timestamps) >= limit.max_per_hour:
            return True

        return False

    def _record_invocation(self, key: str) -> None:
        """Record an invocation timestamp for rate limiting."""
        if key not in self._rate_counters:
            self._rate_counters[key] = deque()
        self._rate_counters[key].append(time.monotonic())


# === Module-level singleton for hot-reload ===

_active_engine: Optional[ToolPolicyEngine] = None


def init_tool_policy_engine(policy_dir: str = "policies/tool") -> None:
    """Load policies and initialize the engine singleton."""
    global _active_engine
    policies = load_tool_policies_from_dir(policy_dir)
    if policies:
        _active_engine = ToolPolicyEngine(policies)
        logger.info(
            "tool_policy_engine.initialized",
            policy_count=len(policies),
            total_rules=_active_engine.total_rules,
        )
    else:
        _active_engine = None
        logger.info("tool_policy_engine.no_policies")


def get_active_engine() -> Optional[ToolPolicyEngine]:
    """Get the active engine singleton (None if not initialized)."""
    return _active_engine


def reload_tool_policies(policy_dir: str = "policies/tool") -> None:
    """Hot-reload policies from disk. Thread-safe via GIL assignment."""
    init_tool_policy_engine(policy_dir)
