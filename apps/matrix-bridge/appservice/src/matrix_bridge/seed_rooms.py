"""Bootstrap the canonical Tiresias rooms on appservice startup.

Mints (idempotently) the four rooms every Tiresias deployment needs:

* ``#tiresias-console:{server}`` — primary-human ↔ agents
* ``#pantheon-ops:{server}``     — agent-only orchestration channel
* ``#notifications:{server}``    — broadcast (agents post, humans read)
* ``#tiresias-audit:{server}``   — read-only SoulWatch sink

Bootstrap is gated by ``SEED_ROOMS_ON_BOOT=1``. When disabled (the
default in unit tests, but enabled in the Compose stack), the
appservice starts without touching Synapse — useful when a deployment
manages rooms via a separate Terraform/Ansible pipeline.

License: Apache-2.0.
"""

from __future__ import annotations

import logging

from .room_provisioner import (
    RoomDefinition,
    RoomProvisioner,
    audit_room,
    console_primary,
    notifications,
    pantheon_ops,
)
from .synapse_admin import SynapseAdminError

log = logging.getLogger("matrix_bridge.seed_rooms")


SEED_ROOM_KINDS = ("console", "pantheon-ops", "notifications", "audit")


def seed_room_definitions(
    *, server_name: str, tenant_id: str
) -> list[RoomDefinition]:
    """Return the canonical seed rooms for a deployment.

    Order matters: ``#tiresias-console`` is created first because the
    primary user is invited into it, and the others depend on the bot
    already being known to Synapse via the appservice registration.
    """
    return [
        console_primary(server_name=server_name, tenant_id=tenant_id),
        pantheon_ops(server_name=server_name, tenant_id=tenant_id),
        notifications(server_name=server_name, tenant_id=tenant_id),
        audit_room(server_name=server_name, tenant_id=tenant_id),
    ]


class SeedRoomBootstrap:
    """Mints the canonical seed rooms on startup.

    Tolerant by design: a single failed room must not crash the
    appservice. Each failure is logged with the alias and the underlying
    Synapse error; the readiness probe (``/readyz``, PR G) will surface
    a degraded state to operators.
    """

    def __init__(
        self,
        *,
        provisioner: RoomProvisioner,
        server_name: str,
        tenant_id: str,
    ) -> None:
        self._prov = provisioner
        self._server = server_name
        self._tenant = tenant_id

    async def run(self) -> dict[str, str | None]:
        """Ensure every seed room exists.

        Returns a mapping of ``alias -> room_id`` (or ``None`` for rooms
        that failed). Callers can store this on app state so ``/readyz``
        can report which rooms came up cleanly.
        """
        results: dict[str, str | None] = {}
        for room in seed_room_definitions(
            server_name=self._server, tenant_id=self._tenant
        ):
            try:
                room_id = await self._prov.ensure(room)
                results[room.alias] = room_id
                log.info(
                    "seed room ready: alias=%s room_id=%s kind=%s",
                    room.alias,
                    room_id,
                    room.kind,
                )
            except SynapseAdminError as exc:
                results[room.alias] = None
                log.error(
                    "seed room failed: alias=%s kind=%s status=%s body=%s",
                    room.alias,
                    room.kind,
                    exc.status_code,
                    exc.body,
                )
            except Exception as exc:  # pragma: no cover — defensive
                results[room.alias] = None
                log.exception(
                    "seed room raised unexpected error: alias=%s err=%s",
                    room.alias,
                    exc,
                )
        return results
