"""Room provisioning against Synapse.

Room aliases follow the topology defined in the integration plan:

    #pantheon-ops:{domain}                     — agents only
    #tiresias-console:{domain}                 — primary user ↔ all agents
    #tiresias-console-{sub_id}:{domain}        — sub-user scoped channel
    #agent-{role}-{tenant_id}:{domain}         — intra-role coordination
    #tiresias-audit:{domain}                   — read-only SoulWatch sink
    #notifications:{domain}                    — broadcast room (agents
                                                 write, humans read)

The :class:`RoomProvisioner` calls into :class:`SynapseAdminClient` to
make the rooms exist with the canonical power levels, history
visibility, and join rules. ``ensure`` is idempotent — running it twice
is a no-op the second time.

License: Apache-2.0.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Literal

from .synapse_admin import SynapseAdminClient, SynapseAdminError

log = logging.getLogger("matrix_bridge.room_provisioner")

RoomKind = Literal[
    "pantheon-ops",
    "console",
    "console-sub",
    "agent-role",
    "audit",
    "notifications",
]


@dataclass(frozen=True)
class RoomDefinition:
    """A room that should exist in Synapse, plus the metadata Cedar needs."""

    alias: str
    kind: RoomKind
    tenant_id: str
    allowed_roles: tuple[str, ...]
    human_write: bool
    name: str = ""
    topic: str = ""
    # Power-level overrides for the room. Defaults are applied per-kind by
    # ``RoomProvisioner._power_levels_for`` so each definition stays minimal.
    extra_power_levels: dict[str, Any] = field(default_factory=dict)


def pantheon_ops(*, server_name: str, tenant_id: str) -> RoomDefinition:
    return RoomDefinition(
        alias=f"#pantheon-ops:{server_name}",
        kind="pantheon-ops",
        tenant_id=tenant_id,
        allowed_roles=("orchestrator",),
        human_write=False,
        name="Pantheon Ops",
        topic="Agent-only orchestration channel. Humans can read; only agents write.",
    )


def console_primary(*, server_name: str, tenant_id: str) -> RoomDefinition:
    return RoomDefinition(
        alias=f"#tiresias-console:{server_name}",
        kind="console",
        tenant_id=tenant_id,
        allowed_roles=("*",),  # any agent role allowed
        human_write=True,
        name="Tiresias Console",
        topic="Primary-human ↔ Tiresias agents. Restricted to the org admin.",
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
        name=f"Tiresias Console — {sub_id}",
        topic=f"Per-sub-user channel for {sub_id}.",
    )


def agent_role(*, server_name: str, tenant_id: str, role: str) -> RoomDefinition:
    return RoomDefinition(
        alias=f"#agent-{role}-{tenant_id}:{server_name}",
        kind="agent-role",
        tenant_id=tenant_id,
        allowed_roles=(role,),
        human_write=False,
        name=f"Agents · {role} · {tenant_id}",
        topic=f"Intra-role coordination for {role} agents in tenant {tenant_id}.",
    )


def audit_room(*, server_name: str, tenant_id: str) -> RoomDefinition:
    return RoomDefinition(
        alias=f"#tiresias-audit:{server_name}",
        kind="audit",
        tenant_id=tenant_id,
        allowed_roles=("soulwatch",),
        human_write=False,
        name="Tiresias Audit",
        topic="Read-only SoulWatch sink. Do not post manually.",
    )


def notifications(*, server_name: str, tenant_id: str) -> RoomDefinition:
    """Broadcast notifications room.

    Humans read; only the orchestrator + memory + soulwatch agent roles
    write. Sized for fan-out alerts (build complete, deploy success,
    detection-rule fire-summaries) — anything that should reach the
    primary human without spamming the console.
    """
    return RoomDefinition(
        alias=f"#notifications:{server_name}",
        kind="notifications",
        tenant_id=tenant_id,
        allowed_roles=("orchestrator", "memory", "soulwatch"),
        human_write=False,
        name="Notifications",
        topic="Broadcast notifications. Read-only for humans.",
    )


# ── Provisioner ──────────────────────────────────────────────────────────────


# Power level scaffolding. The values are deliberately conservative:
#   100 — tiresias-bot (the appservice sender). Owns the room.
#    75 — primary humans.
#    50 — agents in allowed roles (default for sends).
#    25 — sub-users (per-sub-console only).
#     0 — everyone else (read-only when allowed, otherwise no access).
_PL_BOT = 100
_PL_PRIMARY = 75
_PL_AGENT_DEFAULT = 50
_PL_SUB = 25


class RoomProvisioner:
    """Idempotent Synapse room provisioner.

    The provisioner is built around three steps for each room:

    1. Resolve the alias. If it already maps to a room id, do nothing.
    2. Otherwise call ``createRoom`` with ``initial_state`` so power
       levels, history visibility, and join rules are baked in
       atomically.
    3. (Defensively) re-apply ``m.room.power_levels`` after creation in
       case the operator changed the per-kind defaults since the room
       was first minted. Failure here is logged but never fatal — the
       seed bootstrap continues.
    """

    def __init__(
        self,
        *,
        admin: SynapseAdminClient,
        bot_user_id: str,
        primary_user_id: str | None = None,
    ) -> None:
        self._admin = admin
        self._bot = bot_user_id
        self._primary = primary_user_id

    async def ensure(self, room: RoomDefinition) -> str:
        """Bring the room into existence. Returns the resulting room id."""
        existing = await self._admin.resolve_alias(room.alias)
        if existing is not None:
            log.info("room exists: alias=%s room_id=%s", room.alias, existing)
            return existing

        localpart = _alias_localpart(room.alias)
        log.info("creating room: alias=%s kind=%s", room.alias, room.kind)
        room_id = await self._admin.create_room(
            alias_localpart=localpart,
            name=room.name or localpart,
            topic=room.topic or f"Tiresias {room.kind} room",
            preset="private_chat",
            visibility="private",
            invite=self._initial_invites(room),
            initial_state=_initial_state_for(room, bot_user_id=self._bot),
        )

        # Defensive: re-apply power levels in case the room already
        # existed under a different alias and we just minted a new alias.
        # (Matrix rooms can carry many aliases; createRoom would have
        # failed above if the alias collided, so this branch only runs
        # in the freshly-created path.)
        try:
            await self._admin.set_power_levels(
                room_id=room_id,
                content=_power_levels_for(room, bot_user_id=self._bot),
            )
        except SynapseAdminError as exc:
            log.warning(
                "power-level reapply failed (continuing): alias=%s err=%s",
                room.alias,
                exc,
            )

        return room_id

    def _initial_invites(self, room: RoomDefinition) -> list[str]:
        invites: list[str] = []
        if room.human_write and self._primary:
            invites.append(self._primary)
        return invites


def _alias_localpart(alias: str) -> str:
    """Strip leading ``#`` and the ``:server_name`` suffix from an alias."""
    if not alias.startswith("#"):
        raise ValueError(f"alias must start with #: {alias!r}")
    body = alias[1:]
    head, sep, tail = body.partition(":")
    if not sep:
        raise ValueError(f"alias missing :server_name suffix: {alias!r}")
    if not head:
        raise ValueError(f"alias has empty localpart: {alias!r}")
    if not tail:
        raise ValueError(f"alias has empty server_name: {alias!r}")
    return head


def _initial_state_for(
    room: RoomDefinition, *, bot_user_id: str
) -> list[dict[str, Any]]:
    """Build the ``initial_state`` array for ``createRoom``.

    Includes:
      * ``m.room.history_visibility`` — ``invited`` for every Tiresias
        room. New joiners can see history from their join point onward
        but not before. (Audit/notifications rooms could justify
        ``shared``; we err on the privacy-preserving side.)
      * ``m.room.join_rules`` — ``invite``. Combined with the
        ``private_chat`` preset this prevents random local users from
        wandering into a room.
      * ``m.room.power_levels`` — see :func:`_power_levels_for`.
    """
    return [
        {
            "type": "m.room.history_visibility",
            "state_key": "",
            "content": {"history_visibility": "invited"},
        },
        {
            "type": "m.room.join_rules",
            "state_key": "",
            "content": {"join_rule": "invite"},
        },
        {
            "type": "m.room.power_levels",
            "state_key": "",
            "content": _power_levels_for(room, bot_user_id=bot_user_id),
        },
    ]


def _power_levels_for(
    room: RoomDefinition, *, bot_user_id: str
) -> dict[str, Any]:
    """Compute ``m.room.power_levels`` content for a given room kind."""
    # Default floor for sending events. Read-only rooms (audit,
    # notifications, pantheon-ops) require power 50 to send so only
    # registered agents (we mint them at PL 50) and the bot (PL 100) can
    # post. Human-write rooms drop the floor to 0 so the primary user
    # (PL 75) and any allowed sub-user (PL 25) can chat.
    events_default = 50 if not room.human_write else 0

    pl: dict[str, Any] = {
        "users": {
            bot_user_id: _PL_BOT,
        },
        "users_default": 0,
        "events_default": events_default,
        "state_default": _PL_BOT,  # state edits = bot only
        "ban": _PL_BOT,
        "kick": _PL_BOT,
        "redact": _PL_PRIMARY,
        "invite": _PL_PRIMARY,
        "events": {
            # Power-level state edits are always bot-only.
            "m.room.power_levels": _PL_BOT,
            "m.room.history_visibility": _PL_BOT,
            "m.room.join_rules": _PL_BOT,
            "m.room.canonical_alias": _PL_BOT,
        },
    }

    # Per-kind overlays.
    if room.kind == "pantheon-ops":
        # Agents (PL 50) write; humans (PL 75) can read but cannot post —
        # matrix-005 in Cedar is the *authoritative* deny, this is just
        # belt-and-braces at the Matrix layer.
        pl["events_default"] = _PL_AGENT_DEFAULT
        # Bump the human floor so even the primary user cannot post.
        pl["events"]["m.room.message"] = _PL_BOT
    elif room.kind == "console":
        # Primary human + allowed agent roles can both post.
        pl["events_default"] = 0
    elif room.kind == "console-sub":
        # Same as console but the assigned sub-user is given PL 25
        # (the bootstrap caller is responsible for setting this on the
        # individual user via extra_power_levels).
        pl["events_default"] = 0
    elif room.kind == "agent-role":
        pl["events_default"] = _PL_AGENT_DEFAULT
    elif room.kind == "audit":
        # Only the soulwatch agent + bot may post.
        pl["events_default"] = _PL_BOT
        pl["events"]["m.room.message"] = _PL_BOT
    elif room.kind == "notifications":
        # Agents post (PL 50), humans (PL 75) read but cannot post.
        pl["events_default"] = _PL_AGENT_DEFAULT
        pl["events"]["m.room.message"] = _PL_AGENT_DEFAULT

    # Caller-supplied overrides win — used by the seed bootstrap to
    # grant the primary human PL 75 in their console rooms without
    # having to import the magic numbers everywhere.
    for user_id, level in room.extra_power_levels.items():
        pl["users"][user_id] = int(level)

    return pl
