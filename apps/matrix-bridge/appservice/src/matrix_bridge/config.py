"""Runtime configuration for the Tiresias Matrix appservice.

All configuration comes from environment variables. Tokens are required at
runtime but optional at import time so unit tests can construct an app
instance without mutating the process environment.

License: Apache-2.0.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class AppserviceConfig:
    """Resolved appservice configuration.

    Attributes:
        hs_token: Shared secret used by Synapse to authenticate transactions
            sent to this appservice. Required in production.
        as_token: Shared secret used by this appservice to authenticate calls
            to Synapse's client/admin API. Required in production.
        synapse_url: Base URL of the Synapse homeserver, reachable on the
            internal Docker network only.
        soulwatch_url: SoulWatch ingest endpoint. PR D wires this up; for now
            the appservice no-ops if the env var is absent.
        platform_api_url: Used for provisioner queries against the agent and
            user registries. PR D wires this up; optional for now.
    """

    hs_token: str
    as_token: str
    synapse_url: str = "http://synapse:8008"
    soulwatch_url: str | None = None
    platform_api_url: str | None = None
    server_name: str = "tiresias.local"
    tenant_id: str = "default"
    seed_rooms_on_boot: bool = False
    # Hardening (PR G).
    transaction_max_bytes: int = 5 * 1024 * 1024
    """Cap on ``PUT /transactions/{txn_id}`` request bodies; 5 MiB default.

    Synapse normally batches well below this. Synapse will retry on the 413
    rejection, so an oversized batch surfaces as a soft failure rather than
    a transaction loss. Override via ``MATRIX_TRANSACTION_MAX_BYTES``.
    """
    sender_allowlist_enabled: bool = True
    """When True, events whose ``sender`` is outside the agent/bot/primary
    allowlist are dropped (logged at WARNING) before reaching SoulWatch.
    Disable in tests by passing ``False`` to the dataclass directly; in
    production set ``MATRIX_SENDER_ALLOWLIST=0`` to opt out (not recommended).
    """

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "AppserviceConfig":
        """Build a config from a mapping (defaults to ``os.environ``).

        Raises ``RuntimeError`` if required tokens are missing.
        """
        e = env if env is not None else os.environ
        hs = e.get("HS_TOKEN")
        as_ = e.get("AS_TOKEN")
        if not hs or not as_:
            raise RuntimeError(
                "matrix-bridge requires HS_TOKEN and AS_TOKEN env vars to be set"
            )
        return cls(
            hs_token=hs,
            as_token=as_,
            synapse_url=e.get("SYNAPSE_URL", "http://synapse:8008"),
            soulwatch_url=e.get("SOULWATCH_INGEST_URL"),
            platform_api_url=e.get("PLATFORM_API_URL"),
            server_name=e.get("MATRIX_SERVER_NAME", "tiresias.local"),
            tenant_id=e.get("MATRIX_TENANT_ID", "default"),
            seed_rooms_on_boot=_truthy(e.get("SEED_ROOMS_ON_BOOT")),
            transaction_max_bytes=_positive_int(
                e.get("MATRIX_TRANSACTION_MAX_BYTES"),
                default=5 * 1024 * 1024,
            ),
            # Allowlist defaults on; require an explicit opt-out to disable.
            sender_allowlist_enabled=not _truthy(
                e.get("MATRIX_SENDER_ALLOWLIST_DISABLED")
            ),
        )


def _truthy(value: str | None) -> bool:
    """Parse a permissive boolean env var. ``None`` and unknown -> False."""
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _positive_int(value: str | None, *, default: int) -> int:
    """Parse a non-negative integer env var, falling back to ``default``.

    Negative or unparseable values fall back to the default rather than
    raising — config errors during boot would otherwise take down the
    whole bridge for a setting that has a safe fallback.
    """
    if value is None or value == "":
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    if parsed < 0:
        return default
    return parsed
