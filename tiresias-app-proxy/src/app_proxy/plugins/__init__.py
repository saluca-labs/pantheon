"""Plugins package — re-exports lifecycle hooks for main.py lifespan."""

from app_proxy.plugins.registry import (
    PluginConfig,
    PluginRegistry,
    ToolDef,
    close_plugin_registry,
    init_plugin_registry,
)

__all__ = [
    "PluginConfig",
    "PluginRegistry",
    "ToolDef",
    "close_plugin_registry",
    "init_plugin_registry",
]
