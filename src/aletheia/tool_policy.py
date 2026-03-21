"""
Tool Policy schema and YAML loader.
Loads ToolPolicy definitions from YAML files in the policies/tool/ directory.
Supports hot-reload via reload from disk.
Follows the exact pattern of cot_policy.py.
"""

import os
import re
from dataclasses import dataclass, field
from fnmatch import fnmatch
from pathlib import Path
from typing import Any, Optional

import structlog
import yaml

logger = structlog.get_logger(__name__)


@dataclass
class RateLimitSpec:
    """Rate limit configuration for a tool policy rule."""
    max_per_minute: int = 60
    max_per_hour: int = 500


@dataclass
class MatchSpec:
    """Command matching specification. Supports glob patterns and regex args."""
    commands: list[str] = field(default_factory=list)
    args_pattern: Optional[str] = None
    _compiled_pattern: Optional[re.Pattern] = field(default=None, repr=False, compare=False)


@dataclass
class ToolPolicyRule:
    """A single rule within a ToolPolicy."""
    name: str
    match: MatchSpec
    action: str = "allow"  # "allow" | "deny" | "warn"
    reason: str = ""
    rate_limit: Optional[RateLimitSpec] = None


@dataclass
class AgentOverride:
    """Per-agent overrides for tool policy rules."""
    override_rules: list[dict] = field(default_factory=list)  # [{"name": ..., "action": ...}]
    default_action: Optional[str] = None
    allowed_commands: Optional[list[str]] = None


@dataclass
class ToolPolicy:
    """A tool policy defining command access control for agents."""
    name: str
    default_action: str = "allow"
    rules: list[ToolPolicyRule] = field(default_factory=list)
    agent_overrides: dict[str, AgentOverride] = field(default_factory=dict)
    enabled: bool = True


def load_tool_policy(policy_path: str) -> Optional[ToolPolicy]:
    """Parse a single YAML policy file into a ToolPolicy.

    Validates apiVersion and kind fields before parsing.
    Returns None if file is invalid or not a ToolPolicy.
    """
    try:
        with open(policy_path, "r") as f:
            doc = yaml.safe_load(f)

        if not isinstance(doc, dict):
            logger.warning("tool_policy.invalid_document", path=policy_path)
            return None

        if doc.get("apiVersion") != "tiresias/v1":
            logger.warning("tool_policy.wrong_api_version", path=policy_path, version=doc.get("apiVersion"))
            return None

        if doc.get("kind") != "ToolPolicy":
            logger.warning("tool_policy.wrong_kind", path=policy_path, kind=doc.get("kind"))
            return None

        metadata = doc.get("metadata", {})
        spec = doc.get("spec", {})

        # Parse rules
        rules: list[ToolPolicyRule] = []
        for rule_cfg in spec.get("rules", []):
            if not isinstance(rule_cfg, dict):
                continue

            match_cfg = rule_cfg.get("match", {})
            args_pattern = match_cfg.get("args_pattern")
            compiled = None
            if args_pattern:
                try:
                    compiled = re.compile(args_pattern)
                except re.error as e:
                    logger.warning(
                        "tool_policy.invalid_args_pattern",
                        path=policy_path,
                        rule=rule_cfg.get("name"),
                        pattern=args_pattern,
                        error=str(e),
                    )
                    continue

            match_spec = MatchSpec(
                commands=match_cfg.get("commands", []),
                args_pattern=args_pattern,
                _compiled_pattern=compiled,
            )

            rate_limit = None
            rl_cfg = rule_cfg.get("rate_limit")
            if isinstance(rl_cfg, dict):
                rate_limit = RateLimitSpec(
                    max_per_minute=rl_cfg.get("max_per_minute", 60),
                    max_per_hour=rl_cfg.get("max_per_hour", 500),
                )

            rules.append(ToolPolicyRule(
                name=rule_cfg.get("name", "unnamed"),
                match=match_spec,
                action=rule_cfg.get("action", "allow"),
                reason=rule_cfg.get("reason", ""),
                rate_limit=rate_limit,
            ))

        # Parse agent overrides
        agent_overrides: dict[str, AgentOverride] = {}
        for agent_id, override_cfg in spec.get("agent_overrides", {}).items():
            if not isinstance(override_cfg, dict):
                continue
            agent_overrides[agent_id] = AgentOverride(
                override_rules=override_cfg.get("override_rules", []),
                default_action=override_cfg.get("default_action"),
                allowed_commands=override_cfg.get("allowed_commands"),
            )

        return ToolPolicy(
            name=metadata.get("name", Path(policy_path).stem),
            default_action=spec.get("default_action", "allow"),
            rules=rules,
            agent_overrides=agent_overrides,
            enabled=spec.get("enabled", True),
        )

    except Exception as e:
        logger.error("tool_policy.load_error", path=policy_path, error=str(e))
        return None


def load_tool_policies_from_dir(dir_path: str = "policies/tool") -> list[ToolPolicy]:
    """Load all enabled ToolPolicy YAML files from a directory.

    Returns list of enabled policies. Skips invalid or disabled ones.
    """
    policies: list[ToolPolicy] = []
    policy_dir = Path(dir_path)

    if not policy_dir.is_dir():
        logger.info("tool_policy.dir_not_found", dir=dir_path)
        return policies

    for yaml_file in sorted(policy_dir.glob("*.yaml")):
        policy = load_tool_policy(str(yaml_file))
        if policy and policy.enabled:
            policies.append(policy)
            logger.debug("tool_policy.loaded", name=policy.name, rules=len(policy.rules))

    logger.info("tool_policy.loaded_all", count=len(policies), dir=dir_path)
    return policies
