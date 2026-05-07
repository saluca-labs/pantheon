"""Wasm-specific data types for the sandbox runtime."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Resource limits
# ---------------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class WasmResourceLimits:
    """Configurable resource constraints for a Wasm plugin instance."""

    memory_pages: int = 256
    """Maximum linear memory in 64 KiB pages (256 = 16 MiB)."""

    fuel: int = 1_000_000_000
    """Instruction fuel budget per invocation (0 = unlimited)."""


# ---------------------------------------------------------------------------
# Plugin instance — holds runtime state for a loaded Wasm module
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class WasmPluginInstance:
    """Runtime state for a single loaded Wasm plugin.

    When using the wasmtime Python bindings, *store* and *instance* are
    actual Wasmtime objects.  Under the subprocess fallback they are
    ``None`` — the runtime shells out to the ``wasmtime`` CLI instead.
    """

    name: str
    wasm_path: str
    capabilities: list[str]
    resource_limits: WasmResourceLimits

    # wasmtime objects (None when using subprocess fallback)
    store: Any = None
    instance: Any = None
    module: Any = None

    # Cached tool definitions returned by the plugin's tools() export
    tool_definitions: list[dict[str, Any]] = field(default_factory=list)

    # Whether the instance is alive
    alive: bool = True


# ---------------------------------------------------------------------------
# Config — extends the registry PluginConfig concept for Wasm plugins
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class WasmPluginConfig:
    """Configuration for a Wasm-based plugin, parsed from config.yaml.

    This is the Wasm-specific superset of the fields in
    :class:`app_proxy.plugins.registry.PluginConfig`.
    """

    name: str
    version: str
    wasm_path: str
    capabilities: list[str] = field(default_factory=list)
    resource_limits: WasmResourceLimits = field(default_factory=WasmResourceLimits)
    secrets: dict[str, str] = field(default_factory=dict)
    timeout_seconds: int = 30
