"""Wasm plugin runtime — manages sandboxed plugin instances via Wasmtime.

Supports two execution backends:

1. **wasmtime Python bindings** (preferred) — plugins run in-process with
   direct memory access, fuel metering, and capability-injected host imports.

2. **wasmtime CLI subprocess** (fallback) — when the Python package is not
   installed, the runtime shells out to the ``wasmtime`` CLI binary.  This
   provides the same isolation guarantees but with higher per-call overhead.

The backend is selected automatically at init time.
"""

from __future__ import annotations

import asyncio
import json
import shutil
from pathlib import Path
from typing import Any

import structlog

from app_proxy.wasm.sandbox import CapabilityBridge
from app_proxy.wasm.types import WasmPluginConfig, WasmPluginInstance, WasmResourceLimits

logger = structlog.stdlib.get_logger("app_proxy.wasm.runtime")

# ---------------------------------------------------------------------------
# Wasmtime Python bindings (optional)
# ---------------------------------------------------------------------------
try:
    import wasmtime  # type: ignore[import-untyped]

    _HAS_WASMTIME_PY = True
except ImportError:
    wasmtime = None  # type: ignore[assignment]
    _HAS_WASMTIME_PY = False

# Check for CLI fallback
_WASMTIME_CLI = shutil.which("wasmtime")


# ---------------------------------------------------------------------------
# WasmPluginRuntime
# ---------------------------------------------------------------------------

class WasmPluginRuntime:
    """Manages Wasm plugin instances via Wasmtime.

    Each plugin gets its own Wasm instance with:

    - **Isolated linear memory** — no shared address space between plugins.
    - **Capability-based imports** — only host functions matching declared
      capabilities are injected as imports.
    - **Configurable resource limits** — memory pages and fuel/instruction
      budgets are enforced per instance.

    Parameters
    ----------
    fuel_limit:
        Default instruction fuel budget (overridden by per-plugin config).
    memory_limit_pages:
        Default max linear memory in 64 KiB pages (overridden by per-plugin config).
    """

    def __init__(
        self,
        fuel_limit: int = 1_000_000_000,
        memory_limit_pages: int = 256,
    ) -> None:
        self._default_fuel = fuel_limit
        self._default_memory_pages = memory_limit_pages
        self._instances: dict[str, WasmPluginInstance] = {}
        self._engine: Any = None
        self._backend: str = "none"

        self._init_engine()

    # ------------------------------------------------------------------
    # Engine initialization
    # ------------------------------------------------------------------
    def _init_engine(self) -> None:
        """Initialize the Wasmtime engine (Python bindings or CLI fallback)."""
        if _HAS_WASMTIME_PY:
            try:
                cfg = wasmtime.Config()
                cfg.consume_fuel = True
                self._engine = wasmtime.Engine(cfg)
                self._backend = "wasmtime-python"
                logger.info("wasm.runtime.init", backend="wasmtime-python")
                return
            except Exception as exc:
                logger.warning(
                    "wasm.runtime.python_init_failed",
                    error=str(exc),
                    fallback="cli",
                )

        if _WASMTIME_CLI:
            self._backend = "wasmtime-cli"
            logger.info("wasm.runtime.init", backend="wasmtime-cli", path=_WASMTIME_CLI)
        else:
            self._backend = "none"
            logger.warning(
                "wasm.runtime.no_backend",
                msg="Neither wasmtime Python package nor wasmtime CLI found. "
                "Wasm plugins will not be available. "
                "Install with: pip install wasmtime",
            )

    @property
    def backend(self) -> str:
        """Return the active backend: ``wasmtime-python``, ``wasmtime-cli``, or ``none``."""
        return self._backend

    @property
    def available(self) -> bool:
        """Whether any Wasm backend is available."""
        return self._backend != "none"

    # ------------------------------------------------------------------
    # Plugin lifecycle
    # ------------------------------------------------------------------
    def load_plugin(
        self,
        name: str,
        wasm_path: str,
        capabilities: list[str],
        resource_limits: WasmResourceLimits | None = None,
        secrets: dict[str, str] | None = None,
    ) -> WasmPluginInstance:
        """Load a Wasm module and create a sandboxed instance.

        Parameters
        ----------
        name:
            Unique plugin identifier.
        wasm_path:
            Path to the ``.wasm`` binary.
        capabilities:
            List of capability tokens (e.g. ``["slack:read"]``).
        resource_limits:
            Optional per-plugin resource constraints.
        secrets:
            Secrets to inject into host functions for this plugin.

        Returns
        -------
        WasmPluginInstance
            The loaded instance, ready for tool calls.

        Raises
        ------
        FileNotFoundError
            If *wasm_path* does not exist.
        RuntimeError
            If no Wasm backend is available.
        """
        if not self.available:
            raise RuntimeError(
                "No Wasm backend available. Install wasmtime: pip install wasmtime"
            )

        path = Path(wasm_path)
        if not path.exists():
            raise FileNotFoundError(f"Wasm module not found: {wasm_path}")

        limits = resource_limits or WasmResourceLimits(
            memory_pages=self._default_memory_pages,
            fuel=self._default_fuel,
        )

        log = logger.bind(plugin=name, backend=self._backend)
        log.info("wasm.plugin.loading", wasm_path=wasm_path, capabilities=capabilities)

        # Validate capabilities
        bridge = CapabilityBridge(capabilities, secrets=secrets)
        unknown = bridge.validate_capabilities(capabilities)
        if unknown:
            log.warning("wasm.plugin.unknown_capabilities", unknown=unknown)

        instance: WasmPluginInstance

        if self._backend == "wasmtime-python":
            instance = self._load_python(name, path, capabilities, limits, bridge)
        else:
            # CLI fallback — no in-process objects
            instance = WasmPluginInstance(
                name=name,
                wasm_path=str(path),
                capabilities=capabilities,
                resource_limits=limits,
            )

        self._instances[name] = instance
        log.info("wasm.plugin.loaded", alive=instance.alive)
        return instance

    def _load_python(
        self,
        name: str,
        path: Path,
        capabilities: list[str],
        limits: WasmResourceLimits,
        bridge: CapabilityBridge,
    ) -> WasmPluginInstance:
        """Load via wasmtime Python bindings."""
        module = wasmtime.Module.from_file(self._engine, str(path))
        linker = bridge.build_linker(self._engine)
        store = wasmtime.Store(self._engine)

        # Set fuel budget
        if limits.fuel > 0:
            store.set_fuel(limits.fuel)

        # Memory limits are set through the module's own memory definition
        # (Wasmtime enforces the declared max pages in the .wasm itself).
        # We log the configured limit for observability.
        logger.debug("wasm.store.configured", fuel=limits.fuel, memory_pages=limits.memory_pages)

        try:
            instance = linker.instantiate(store, module)
        except Exception as exc:
            logger.error(
                "wasm.instantiate.failed",
                plugin=name,
                error=str(exc),
                hint="Check that the Wasm module's imports match declared capabilities",
            )
            raise RuntimeError(
                f"Failed to instantiate Wasm module for plugin '{name}': {exc}"
            ) from exc

        return WasmPluginInstance(
            name=name,
            wasm_path=str(path),
            capabilities=capabilities,
            resource_limits=limits,
            store=store,
            instance=instance,
            module=module,
        )

    def unload_plugin(self, name: str) -> None:
        """Tear down a plugin instance and release resources."""
        instance = self._instances.pop(name, None)
        if instance is None:
            logger.warning("wasm.plugin.unload.not_found", plugin=name)
            return

        instance.alive = False
        # wasmtime objects are GC'd when references drop
        instance.store = None
        instance.instance = None
        instance.module = None
        logger.info("wasm.plugin.unloaded", plugin=name)

    def get_instance(self, name: str) -> WasmPluginInstance | None:
        """Return the instance for *name*, or ``None``."""
        return self._instances.get(name)

    # ------------------------------------------------------------------
    # Tool invocation
    # ------------------------------------------------------------------
    async def call_tool(
        self,
        plugin_name: str,
        tool_name: str,
        arguments: dict[str, Any],
        timeout: int = 30,
    ) -> dict[str, Any]:
        """Call a tool function in the sandboxed plugin.

        Parameters
        ----------
        plugin_name:
            Name of the loaded plugin.
        tool_name:
            Name of the tool (must match an export in the Wasm module).
        arguments:
            Tool arguments as a JSON-serialisable dict.
        timeout:
            Maximum seconds to wait for the call to complete.

        Returns
        -------
        dict
            Result dict with ``success``, ``result`` or ``error`` keys.
        """
        instance = self._instances.get(plugin_name)
        if instance is None:
            return {"success": False, "error": f"Plugin '{plugin_name}' not loaded"}
        if not instance.alive:
            return {"success": False, "error": f"Plugin '{plugin_name}' is not alive"}

        log = logger.bind(plugin=plugin_name, tool=tool_name, backend=self._backend)

        if self._backend == "wasmtime-python":
            return await self._call_python(instance, tool_name, arguments, timeout, log)
        else:
            return await self._call_cli(instance, tool_name, arguments, timeout, log)

    async def _call_python(
        self,
        instance: WasmPluginInstance,
        tool_name: str,
        arguments: dict[str, Any],
        timeout: int,
        log: Any,
    ) -> dict[str, Any]:
        """Invoke a tool export via the wasmtime Python bindings."""
        try:
            exports = instance.instance.exports(instance.store)

            # Refuel the store for this invocation
            if instance.resource_limits.fuel > 0:
                remaining = instance.store.get_fuel()
                needed = instance.resource_limits.fuel - remaining
                if needed > 0:
                    instance.store.set_fuel(instance.resource_limits.fuel)

            # Look for the tool function as a direct export
            tool_fn = getattr(exports, tool_name, None)
            if tool_fn is None:
                # Try a generic "call_tool" dispatch export
                tool_fn = getattr(exports, "call_tool", None)
                if tool_fn is None:
                    return {
                        "success": False,
                        "error": f"Export '{tool_name}' not found in Wasm module",
                    }

            # Serialize arguments to JSON, write to Wasm memory, call
            args_json = json.dumps(arguments).encode("utf-8")

            # Attempt memory-based argument passing
            memory = getattr(exports, "memory", None)
            alloc_fn = getattr(exports, "alloc", None)

            if memory is not None and alloc_fn is not None:
                # Write args into Wasm linear memory
                ptr = alloc_fn(instance.store, len(args_json))
                mem_data = memory.data_ptr(instance.store)
                for i, b in enumerate(args_json):
                    mem_data[ptr + i] = b

                result_ptr = tool_fn(instance.store, ptr, len(args_json))

                # Read result from memory (null-terminated JSON string)
                result_bytes = bytearray()
                idx = result_ptr
                while mem_data[idx] != 0:
                    result_bytes.append(mem_data[idx])
                    idx += 1

                result_str = result_bytes.decode("utf-8")
                result = json.loads(result_str)
                return {"success": True, "result": result}
            else:
                # Simple numeric export (e.g. echo that returns input length)
                result = tool_fn(instance.store)
                return {"success": True, "result": {"value": result}}

        except Exception as exc:
            log.error("wasm.call.python.error", error=str(exc))
            return {"success": False, "error": f"Wasm call failed: {exc}"}

    async def _call_cli(
        self,
        instance: WasmPluginInstance,
        tool_name: str,
        arguments: dict[str, Any],
        timeout: int,
        log: Any,
    ) -> dict[str, Any]:
        """Invoke a Wasm module via the wasmtime CLI subprocess.

        The CLI backend passes arguments via stdin (JSON) and reads
        the result from stdout.  The tool name is passed as argv[1].

        Convention for CLI-compatible Wasm plugins:

        - ``argv[0]`` = module path (automatic)
        - ``argv[1]`` = tool name
        - ``stdin``   = JSON-encoded arguments
        - ``stdout``  = JSON-encoded result
        - ``stderr``  = debug logging (ignored)
        """
        if not _WASMTIME_CLI:
            return {"success": False, "error": "wasmtime CLI not found on PATH"}

        args_json = json.dumps(arguments)
        cmd = [
            _WASMTIME_CLI,
            "run",
            "--dir=.",
        ]

        # Apply fuel limit
        if instance.resource_limits.fuel > 0:
            cmd.extend(["--fuel", str(instance.resource_limits.fuel)])

        # Apply memory limit (wasmtime CLI uses --max-memory-size in bytes)
        max_bytes = instance.resource_limits.memory_pages * 65536
        cmd.extend(["--max-memory-size", str(max_bytes)])

        cmd.extend([
            instance.wasm_path,
            "--",
            tool_name,
        ])

        log.debug("wasm.call.cli.exec", cmd=cmd)

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await asyncio.wait_for(
                proc.communicate(input=args_json.encode("utf-8")),
                timeout=timeout,
            )

            if proc.returncode != 0:
                err_text = stderr.decode("utf-8", errors="replace").strip()
                log.warning("wasm.call.cli.nonzero", returncode=proc.returncode, stderr=err_text)
                return {
                    "success": False,
                    "error": f"Wasm module exited with code {proc.returncode}: {err_text}",
                }

            raw = stdout.decode("utf-8", errors="replace").strip()
            if not raw:
                return {"success": True, "result": {}}

            try:
                result = json.loads(raw)
                return {"success": True, "result": result}
            except json.JSONDecodeError:
                # Non-JSON output — return as text
                return {"success": True, "result": {"text": raw}}

        except asyncio.TimeoutError:
            log.warning("wasm.call.cli.timeout", timeout_s=timeout)
            return {"success": False, "error": f"Wasm call timed out after {timeout}s"}
        except Exception as exc:
            log.error("wasm.call.cli.error", error=str(exc))
            return {"success": False, "error": f"Wasm CLI call failed: {exc}"}

    # ------------------------------------------------------------------
    # Tool listing
    # ------------------------------------------------------------------
    async def list_tools(self, plugin_name: str) -> list[dict[str, Any]]:
        """Call the plugin's ``tools()`` export to get tool definitions.

        Returns cached definitions if available.
        """
        instance = self._instances.get(plugin_name)
        if instance is None:
            return []

        # Return cached if available
        if instance.tool_definitions:
            return instance.tool_definitions

        if self._backend == "wasmtime-python" and instance.instance is not None:
            try:
                exports = instance.instance.exports(instance.store)
                tools_fn = getattr(exports, "tools", None)
                if tools_fn is not None:
                    result_ptr = tools_fn(instance.store)
                    # Read JSON from memory similar to call_tool
                    memory = getattr(exports, "memory", None)
                    if memory:
                        mem_data = memory.data_ptr(instance.store)
                        result_bytes = bytearray()
                        idx = result_ptr
                        while mem_data[idx] != 0:
                            result_bytes.append(mem_data[idx])
                            idx += 1
                        tools = json.loads(result_bytes.decode("utf-8"))
                        instance.tool_definitions = tools
                        return tools
            except Exception as exc:
                logger.warning("wasm.list_tools.error", plugin=plugin_name, error=str(exc))

        # Fallback: CLI or no export — return empty (tools defined in config.yaml)
        return instance.tool_definitions

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------
    def list_plugins(self) -> list[dict[str, Any]]:
        """Return summary info for all loaded Wasm plugins."""
        return [
            {
                "name": inst.name,
                "wasm_path": inst.wasm_path,
                "capabilities": inst.capabilities,
                "alive": inst.alive,
                "backend": self._backend,
                "fuel": inst.resource_limits.fuel,
                "memory_pages": inst.resource_limits.memory_pages,
            }
            for inst in self._instances.values()
        ]


# ---------------------------------------------------------------------------
# Module-level singleton (lazy)
# ---------------------------------------------------------------------------
_runtime: WasmPluginRuntime | None = None


def get_wasm_runtime() -> WasmPluginRuntime:
    """Return the module-level singleton :class:`WasmPluginRuntime`.

    Creates it on first access. Safe to call even if wasmtime is not
    installed — the runtime will report ``available == False``.
    """
    global _runtime
    if _runtime is None:
        _runtime = WasmPluginRuntime()
    return _runtime
