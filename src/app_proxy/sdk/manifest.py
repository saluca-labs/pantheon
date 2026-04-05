"""Manifest generator for Tiresias plugins.

Generates a ``tiresias.plugin.json`` manifest from a plugin instance. The
manifest is consumed by the App Proxy's plugin registry to discover
capabilities, tools, and required secrets without instantiating the plugin.
"""

from __future__ import annotations

from typing import Any

from .base import TiresiasPlugin


def generate_manifest(plugin: TiresiasPlugin) -> dict[str, Any]:
    """Generate a ``tiresias.plugin.json`` manifest from a live plugin instance.

    Args:
        plugin: An instantiated TiresiasPlugin subclass.

    Returns:
        A dict suitable for serializing to ``tiresias.plugin.json``.
    """
    tools: list[dict[str, Any]] = []
    for td in plugin.tools():
        tool: dict[str, Any] = {
            "name": td.name,
            "description": td.description,
            "inputSchema": td.inputSchema,
        }
        if td.annotations:
            tool["annotations"] = td.annotations
        tools.append(tool)

    manifest: dict[str, Any] = {
        "$schema": "https://tiresias.network/schemas/plugin/v1.json",
        "name": plugin.name,
        "version": plugin.version,
        "description": plugin.description,
        "capabilities": plugin.capabilities,
        "requiredSecrets": plugin.required_secrets,
        "tools": tools,
    }

    return manifest
