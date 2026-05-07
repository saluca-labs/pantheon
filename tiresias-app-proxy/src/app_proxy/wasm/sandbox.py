"""Capability-based host function injection for Wasm plugins.

The :class:`CapabilityBridge` inspects a plugin's declared capabilities
and wires up *only* the corresponding host functions as Wasmtime imports.
Undeclared capabilities are never made available to the guest module.
"""

from __future__ import annotations

import json
from typing import Any, Callable

import structlog

logger = structlog.stdlib.get_logger("app_proxy.wasm.sandbox")

# ---------------------------------------------------------------------------
# Try importing wasmtime — graceful degradation if absent
# ---------------------------------------------------------------------------
try:
    import wasmtime  # type: ignore[import-untyped]

    _HAS_WASMTIME = True
except ImportError:
    wasmtime = None  # type: ignore[assignment]
    _HAS_WASMTIME = False


# ---------------------------------------------------------------------------
# Capability registry — maps capability tokens to host function factories
# ---------------------------------------------------------------------------

# Each entry: capability_token -> list of (func_name, factory)
# A factory receives (secrets, logger) and returns the actual callable.
_CAPABILITY_REGISTRY: dict[str, list[tuple[str, Callable[..., Callable]]]] = {}


def register_capability(
    token: str,
    func_name: str,
    factory: Callable[..., Callable],
) -> None:
    """Register a host function factory under *token*.

    Plugins that declare *token* in their capabilities list will receive
    the host function named *func_name* as an import.
    """
    _CAPABILITY_REGISTRY.setdefault(token, []).append((func_name, factory))


# ---------------------------------------------------------------------------
# Built-in capabilities
# ---------------------------------------------------------------------------

def _echo_call_factory(secrets: dict[str, str], log: Any) -> Callable:
    """Host function for the ``echo:call`` capability — echoes input back."""

    def echo_call(input_ptr: int, input_len: int) -> int:  # noqa: ARG001
        # In a real implementation this would read from Wasm linear memory.
        # For the subprocess/stub path, this is a no-op placeholder.
        log.debug("wasm.host.echo_call", note="stub — real impl reads from linear memory")
        return 0

    return echo_call


def _slack_read_factory(secrets: dict[str, str], log: Any) -> Callable:
    """Host function for ``slack:read`` — read messages from Slack."""

    def slack_read_messages(channel_ptr: int, channel_len: int) -> int:
        log.debug("wasm.host.slack_read_messages", note="stub")
        return 0

    return slack_read_messages


def _slack_post_factory(secrets: dict[str, str], log: Any) -> Callable:
    """Host function for ``slack:post`` — post a message to Slack."""

    def slack_post_message(channel_ptr: int, channel_len: int, text_ptr: int, text_len: int) -> int:
        log.debug("wasm.host.slack_post_message", note="stub")
        return 0

    return slack_post_message


def _http_fetch_factory(secrets: dict[str, str], log: Any) -> Callable:
    """Host function for ``http:fetch`` — make an outbound HTTP request."""

    def http_fetch(url_ptr: int, url_len: int) -> int:
        log.debug("wasm.host.http_fetch", note="stub")
        return 0

    return http_fetch


# Register the built-in capabilities
register_capability("echo:call", "echo_call", _echo_call_factory)
register_capability("slack:read", "slack_read_messages", _slack_read_factory)
register_capability("slack:post", "slack_post_message", _slack_post_factory)
register_capability("http:fetch", "http_fetch", _http_fetch_factory)


# ---------------------------------------------------------------------------
# CapabilityBridge
# ---------------------------------------------------------------------------

class CapabilityBridge:
    """Provides host functions to Wasm plugins based on declared capabilities.

    Given a plugin that declares ``["slack:read", "slack:post"]``, the bridge
    builds a Wasmtime :class:`wasmtime.Linker` containing only:

    - ``slack_read_messages(channel_ptr, channel_len) -> i32``
    - ``slack_post_message(channel_ptr, channel_len, text_ptr, text_len) -> i32``

    Any capability the plugin *did not* declare is omitted entirely.
    Attempts by the Wasm module to import undeclared functions will fail
    at instantiation time, enforcing the capability boundary.
    """

    def __init__(self, capabilities: list[str], secrets: dict[str, str] | None = None) -> None:
        self._capabilities = set(capabilities)
        self._secrets = secrets or {}
        self._log = logger.bind(capabilities=sorted(self._capabilities))

    @property
    def resolved_functions(self) -> dict[str, Callable]:
        """Return a name -> callable mapping for all resolved host functions.

        Useful for the subprocess fallback path where we don't need a Linker.
        """
        funcs: dict[str, Callable] = {}
        for cap in self._capabilities:
            entries = _CAPABILITY_REGISTRY.get(cap, [])
            if not entries:
                self._log.warning("wasm.capability.unknown", capability=cap)
                continue
            for func_name, factory in entries:
                funcs[func_name] = factory(self._secrets, self._log)
                self._log.debug("wasm.capability.resolved", capability=cap, func=func_name)
        return funcs

    def build_linker(self, engine: Any) -> Any:
        """Create a Wasmtime Linker with only the declared host functions.

        Returns a :class:`wasmtime.Linker` if the wasmtime package is
        available, otherwise raises :class:`RuntimeError`.
        """
        if not _HAS_WASMTIME:
            raise RuntimeError(
                "wasmtime Python package is not installed. "
                "Install it with: pip install wasmtime"
            )

        linker = wasmtime.Linker(engine)

        # Wire WASI for basic I/O (stdout/stderr for debugging)
        try:
            linker.define_wasi()
        except Exception:
            self._log.debug("wasm.linker.wasi_skip", note="WASI not available in this wasmtime build")

        # Inject only declared capability host functions
        for cap in self._capabilities:
            entries = _CAPABILITY_REGISTRY.get(cap, [])
            if not entries:
                self._log.warning(
                    "wasm.capability.unknown",
                    capability=cap,
                    note="no host functions registered for this capability",
                )
                continue

            for func_name, factory in entries:
                host_fn = factory(self._secrets, self._log)
                try:
                    # Define under the "env" module namespace
                    func_type = wasmtime.FuncType(
                        [wasmtime.ValType.i32(), wasmtime.ValType.i32()],
                        [wasmtime.ValType.i32()],
                    )
                    linker.define_func("env", func_name, func_type, host_fn)
                except Exception:
                    # Fallback: let wasmtime infer the signature
                    try:
                        linker.define("env", func_name, wasmtime.Func(engine, host_fn))
                    except Exception as exc:
                        self._log.error(
                            "wasm.linker.define_failed",
                            func=func_name,
                            capability=cap,
                            error=str(exc),
                        )

                self._log.debug("wasm.linker.func_added", capability=cap, func=func_name)

        return linker

    def validate_capabilities(self, requested: list[str]) -> list[str]:
        """Return any capabilities in *requested* that are not in the registry."""
        return [cap for cap in requested if cap not in _CAPABILITY_REGISTRY]
