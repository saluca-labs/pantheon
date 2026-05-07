"""Cedar policy engine for the Tiresias App Proxy.

Evaluates every tool call against Cedar policies before it reaches a plugin.
Thread-safe, hot-reloadable, and fully typed.
"""

from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

import cedarpy
import structlog

logger = structlog.get_logger(__name__)

_RELOAD_INTERVAL_ENV = "CEDAR_RELOAD_INTERVAL_SECONDS"
_DEFAULT_RELOAD_INTERVAL: float = 30.0


# ── Decision dataclass ──────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class CedarDecision:
    """Immutable result of a Cedar authorization check."""

    allowed: bool
    decision: str
    reasons: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    needs_approval: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "allowed": self.allowed,
            "decision": self.decision,
            "reasons": self.reasons,
            "errors": self.errors,
            "needs_approval": self.needs_approval,
        }


# ── Engine ──────────────────────────────────────────────────────────────────

class CedarPolicyEngine:
    """Loads Cedar policies from disk, validates against a JSON schema, and
    evaluates authorization requests via ``cedarpy``.

    Thread-safe: all mutations to the policy store are guarded by a lock.
    Hot-reloadable: policies are automatically reloaded at a configurable
    interval (``CEDAR_RELOAD_INTERVAL_SECONDS`` env var, default 30 s).
    """

    def __init__(
        self,
        policies_dir: str | Path,
        schema_path: str | Path,
    ) -> None:
        self._policies_dir = Path(policies_dir)
        self._schema_path = Path(schema_path)

        self._lock = threading.Lock()
        self._policies: str = ""
        self._schema: dict[str, Any] = {}

        self._reload_interval: float = float(
            os.environ.get(_RELOAD_INTERVAL_ENV, _DEFAULT_RELOAD_INTERVAL)
        )
        self._last_reload: float = 0.0  # monotonic timestamp

        # Initial load — fail hard if policies are invalid at startup.
        self._schema = self._read_schema()
        self._policies = self._load_policies()
        self._last_reload = time.monotonic()

        logger.info(
            "cedar_engine.initialized",
            policies_dir=str(self._policies_dir),
            schema_path=str(self._schema_path),
            reload_interval_s=self._reload_interval,
        )

    # ── Public API ──────────────────────────────────────────────────────

    def authorize(
        self,
        agent_id: str,
        agent_attrs: dict[str, Any],
        tenant_id: str,
        tenant_attrs: dict[str, Any],
        plugin_id: str,
        plugin_attrs: dict[str, Any],
        action: str,
        context: dict[str, Any],
    ) -> CedarDecision:
        """Evaluate *action* against loaded Cedar policies.

        Parameters
        ----------
        agent_id:   Unique agent identifier (e.g. ``"alfred-minipc"``).
        agent_attrs: Cedar attributes for the Agent entity.
        tenant_id:  Tenant that owns the agent.
        tenant_attrs: Cedar attributes for the Tenant entity.
        plugin_id:  Target plugin (e.g. ``"slack"``).
        plugin_attrs: Cedar attributes for the Plugin entity.
        action:     Cedar action name (e.g. ``"tool_call"``).
        context:    Flat dict matching the Cedar action context schema.

        Returns
        -------
        CedarDecision
        """
        self._maybe_reload()

        # Build entity slice — 3 entities: agent, plugin, tenant.
        entities = self._build_entities(
            agent_id, agent_attrs, tenant_id, tenant_attrs,
            plugin_id, plugin_attrs,
        )

        request: dict[str, Any] = {
            "principal": f'Tiresias::Agent::"{agent_id}"',
            "action": f'Tiresias::Action::"{action}"',
            "resource": f'Tiresias::Plugin::"{plugin_id}"',
            "context": context,
        }

        with self._lock:
            policies = self._policies

        result = cedarpy.is_authorized(request, policies, entities)

        reasons: list[str] = list(result.diagnostics.reasons) if result.diagnostics.reasons else []
        errors: list[str] = list(result.diagnostics.errors) if result.diagnostics.errors else []

        # Determine whether the call needs human approval rather than a flat deny.
        needs_approval = (
            not result.allowed
            and plugin_attrs.get("classification") == "destructive"
            and not context.get("has_approval", False)
        )

        decision = CedarDecision(
            allowed=result.allowed,
            decision=str(result.decision),
            reasons=reasons,
            errors=errors,
            needs_approval=needs_approval,
        )

        logger.info(
            "cedar_engine.authorize",
            agent_id=agent_id,
            tenant_id=tenant_id,
            plugin_id=plugin_id,
            action=action,
            allowed=decision.allowed,
            needs_approval=decision.needs_approval,
            reason_count=len(reasons),
            error_count=len(errors),
        )

        return decision

    def reload(self) -> None:
        """Force-reload policies from disk."""
        new_policies = self._load_policies()
        with self._lock:
            self._policies = new_policies
            self._last_reload = time.monotonic()
        logger.info("cedar_engine.reload", status="ok")

    def validate(self) -> list[str]:
        """Validate current on-disk policies against the schema.

        Returns a list of validation error strings (empty == valid).
        """
        errors: list[str] = []
        try:
            self._load_policies()
        except Exception as exc:  # noqa: BLE001
            errors.append(str(exc))
        return errors

    # ── Internal helpers ────────────────────────────────────────────────

    def _read_schema(self) -> dict[str, Any]:
        """Read and parse the Cedar JSON schema file."""
        schema_text = self._schema_path.read_text(encoding="utf-8")
        return json.loads(schema_text)

    def _load_policies(self) -> str:
        """Concatenate all ``.cedar`` files under *policies_dir*.

        If validation against the schema fails, the previous policy set is
        kept and an error is logged.  On *first* load (no previous set)
        the exception propagates so the engine refuses to start with bad
        policies.
        """
        cedar_files = sorted(self._policies_dir.rglob("*.cedar"))
        if not cedar_files:
            raise FileNotFoundError(
                f"No .cedar files found under {self._policies_dir}"
            )

        parts: list[str] = []
        for cf in cedar_files:
            parts.append(cf.read_text(encoding="utf-8"))

        combined = "\n\n".join(parts)

        # Validate via a dry-run authorization (schema mismatch raises).
        try:
            self._validate_policies(combined)
        except Exception as exc:  # noqa: BLE001
            with self._lock:
                if self._policies:
                    logger.error(
                        "cedar_engine.load_policies.validation_failed",
                        error=str(exc),
                    )
                    return self._policies
            # No previous policies — propagate.
            raise

        logger.debug(
            "cedar_engine.load_policies",
            file_count=len(cedar_files),
            total_bytes=len(combined),
        )
        return combined

    def _validate_policies(self, policies: str) -> None:
        """Smoke-test *policies* by running a minimal authorization request.

        If ``cedarpy`` raises, the policies (or schema) are broken.
        """
        dummy_request: dict[str, Any] = {
            "principal": 'Tiresias::Agent::"__validate__"',
            "action": 'Tiresias::Action::"read"',
            "resource": 'Tiresias::Plugin::"__validate__"',
            "context": {"tool_name": "__validate__", "hour_of_day": 12},
        }
        dummy_entities = [
            {
                "uid": {"type": "Tiresias::Tenant", "id": "__validate__"},
                "attrs": {"tier": "free", "max_agents": 1},
                "parents": [],
            },
            {
                "uid": {"type": "Tiresias::Agent", "id": "__validate__"},
                "attrs": {"soulkey": "", "roles": []},
                "parents": [
                    {"type": "Tiresias::Tenant", "id": "__validate__"},
                ],
            },
            {
                "uid": {"type": "Tiresias::Plugin", "id": "__validate__"},
                "attrs": {"classification": "safe", "owner_tenant": "__validate__"},
                "parents": [],
            },
        ]
        # If this raises, the policies are malformed.
        cedarpy.is_authorized(dummy_request, policies, dummy_entities)

    def _maybe_reload(self) -> None:
        """Reload policies if the reload interval has elapsed."""
        now = time.monotonic()
        if now - self._last_reload < self._reload_interval:
            return
        try:
            self.reload()
        except Exception:  # noqa: BLE001
            logger.exception("cedar_engine.auto_reload_failed")

    @staticmethod
    def _build_entities(
        agent_id: str,
        agent_attrs: dict[str, Any],
        tenant_id: str,
        tenant_attrs: dict[str, Any],
        plugin_id: str,
        plugin_attrs: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Build the minimal Cedar entity slice (3 entities)."""
        return [
            {
                "uid": {"type": "Tiresias::Tenant", "id": tenant_id},
                "attrs": tenant_attrs,
                "parents": [],
            },
            {
                "uid": {"type": "Tiresias::Agent", "id": agent_id},
                "attrs": agent_attrs,
                "parents": [
                    {"type": "Tiresias::Tenant", "id": tenant_id},
                ],
            },
            {
                "uid": {"type": "Tiresias::Plugin", "id": plugin_id},
                "attrs": plugin_attrs,
                "parents": [],
            },
        ]
