"""WebAssembly sandbox runtime for Tiresias App Proxy plugins.

Provides capability-based isolation for untrusted third-party plugins
compiled to WebAssembly, running inside Wasmtime with per-plugin
resource limits and host-function injection.
"""

from __future__ import annotations

from app_proxy.wasm.types import WasmPluginConfig, WasmPluginInstance, WasmResourceLimits
from app_proxy.wasm.runtime import WasmPluginRuntime
from app_proxy.wasm.sandbox import CapabilityBridge

__all__ = [
    "CapabilityBridge",
    "WasmPluginConfig",
    "WasmPluginInstance",
    "WasmPluginRuntime",
    "WasmResourceLimits",
]
