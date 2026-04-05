"""Plugin config loader — reads config.yaml + optional manifest.json."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import structlog
import yaml

from app_proxy.plugins.registry import PluginConfig, PolicyRule, ToolDef

logger = structlog.stdlib.get_logger("app_proxy.plugins.loader")


def _expand_env(value: str) -> str:
    """Expand ``${VAR}`` references in a string from the environment."""
    if not isinstance(value, str):
        return value
    if value.startswith("${") and value.endswith("}"):
        env_var = value[2:-1]
        return os.environ.get(env_var, value)
    return value


def _parse_tools_from_manifest(plugin_dir: Path) -> list[ToolDef]:
    """Read manifest.json for tool schemas if present."""
    manifest_path = plugin_dir / "manifest.json"
    if not manifest_path.exists():
        return []

    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    tools: list[ToolDef] = []
    for entry in data.get("tools", []):
        tools.append(
            ToolDef(
                name=entry["name"],
                description=entry.get("description", ""),
                input_schema=entry.get("inputSchema", {}),
                annotations=entry.get("annotations", {}),
            )
        )
    return tools


def _parse_tools_from_yaml(raw_tools: list[dict[str, Any]]) -> list[ToolDef]:
    """Parse inline tool definitions from config.yaml ``tools:`` key."""
    tools: list[ToolDef] = []
    for entry in raw_tools:
        tools.append(
            ToolDef(
                name=entry["name"],
                description=entry.get("description", ""),
                input_schema=entry.get("inputSchema", entry.get("input_schema", {})),
                annotations=entry.get("annotations", {}),
            )
        )
    return tools


def _parse_policy_rules(raw_rules: list[dict[str, Any]]) -> list[PolicyRule]:
    """Parse per-tool policy rules from config.yaml."""
    rules: list[PolicyRule] = []
    for entry in raw_rules:
        rules.append(
            PolicyRule(
                tool=entry["tool"],
                requires_approval=entry.get("requires_approval", False),
                rate_limit=entry.get("rate_limit"),
            )
        )
    return rules


def load_plugin_config(plugin_dir: Path) -> PluginConfig:
    """Load and validate a plugin configuration from *plugin_dir*.

    Expects ``config.yaml`` to exist. Tool schemas come from either
    ``manifest.json`` (preferred) or inline ``tools:`` in the YAML.

    Raises ``ValueError`` on missing required fields.
    """
    config_path = plugin_dir / "config.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        raw: dict[str, Any] = yaml.safe_load(f) or {}

    # ---- required fields ----
    name = raw.get("name")
    if not name:
        raise ValueError(f"Plugin at {plugin_dir} missing required 'name' field")

    version = raw.get("version", "0.0.0")

    # ---- MCP server config ----
    mcp_raw = raw.get("mcp_server", {})
    mcp_type = mcp_raw.get("type", "stdio")
    mcp_command = mcp_raw.get("command", [])
    mcp_url = mcp_raw.get("url")
    timeout = mcp_raw.get("timeout_seconds", 30)

    # Expand environment variable references in env block
    env_raw: dict[str, str] = mcp_raw.get("env", {})
    env = {k: _expand_env(v) for k, v in env_raw.items()}

    # ---- tools ----
    # Prefer manifest.json; fall back to inline YAML tools
    tools = _parse_tools_from_manifest(plugin_dir)
    if not tools and "tools" in raw:
        tools = _parse_tools_from_yaml(raw["tools"])

    # ---- policies ----
    policies_raw = raw.get("policies", {})
    policy_rules = _parse_policy_rules(policies_raw.get("rules", []))

    # ---- ACL ----
    acl = raw.get("acl", {})

    logger.debug(
        "plugin.config.parsed",
        name=name,
        version=version,
        mcp_type=mcp_type,
        tools=len(tools),
    )

    return PluginConfig(
        name=name,
        version=version,
        mcp_server_type=mcp_type,
        mcp_server_command=mcp_command,
        mcp_server_url=mcp_url,
        env=env,
        timeout_seconds=timeout,
        tools=tools,
        policies=policies_raw,
        policy_rules=policy_rules,
        acl=acl,
    )
