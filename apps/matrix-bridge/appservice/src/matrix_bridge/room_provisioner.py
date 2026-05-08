"""Room provisioning against Synapse.

PR A status: stub. Provides the canonical room alias derivation used by Cedar
policy resolution (PR B) and by the integration test harness (PR D).

Room aliases follow the topology defined in the integration plan:

    #pantheon-ops:{domain}                     — agents only
    #tiresias-console:{domain}                 — primary user ↔ all agents
    #tiresias-console-{sub_id}:{domain}        — sub-user scoped channel
    #agent-{role}-{tenant_id}:{domain}         — intra-role coordination
    #tiresias-audit:{domain}                   — read-only SoulWatch sink

License: Apache-2.0.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

RoomKind = Literal["pantheon-ops", "console", "console-sub", "agent-role", "audit"]


@dataclass(frozen=True)
class RoomDefinition:
    """A room that should exist in Synapse, plus the metadata Cedar needs."""

    alias: str
    kind: RoomKind
    tenant_id: str
    allowed_roles: tuple[str, ...]
    human_write: bool


def pantheon_ops(*, server_name: str, tenant_id: str) -> RoomDefinition:
    return RoomDefinition(
        alias=f"#pantheon-ops:{server_name}",
        kind="pantheon-ops",
        tenant_id=tenant_id,
        allowed_roles=("orchestrator",),
        human_write=False,
    )


def console_primary(*, server_name: str, tenant_id: str) -> RoomDefinition:
    return RoomDefinition(
        alias=f"#tiresias-console:{server_name}",
        kind="console",
        tenant_id=tenant_id,
        allowed_roles=("*",),  # any agent role allowed
        human_write=True,
    )


def console_sub(*, server_name: str, tenant_id: str, sub_id: str) -> RoomDefinition:
    if not sub_id:
        raise ValueError("console_sub requires a sub_id")
    return RoomDefinition(
        alias=f"#tiresias-console-{sub_id}:{server_name}",
        kind="console-sub",
        tenant_id=tenant_id,
        allowed_roles=("*",),
        human_write=True,
    )


def agent_role(*, server_name: str, tenant_id: str, role: str) -> RoomDefinition:
    return RoomDefinition(
        alias=f"#agent-{role}-{tenant_id}:{server_name}",
        kind="agent-role",
        tenant_id=tenant_id,
        allowed_roles=(role,),
        human_write=False,
    )


def audit_room(*, server_name: str, tenant_id: str) -> RoomDefinition:
    return RoomDefinition(
        alias=f"#tiresias-audit:{server_name}",
        kind="audit",
        tenant_id=tenant_id,
        allowed_roles=("soulwatch",),
        human_write=False,
    )


class RoomProvisioner:
    """Stub provisioner. PR D will replace ``ensure`` with real Synapse calls."""

    async def ensure(self, room: RoomDefinition) -> None:  # pragma: no cover — stub
        """Idempotently ensure the room exists with the given alias."""
        return None
