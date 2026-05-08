"""Tests for the seed-room provisioner + bootstrap.

We use a fake :class:`SynapseAdminClient` (an in-memory dict that
remembers aliases / rooms / state events) so the tests assert
**behaviour**, not which HTTP calls fire.

License: Apache-2.0.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest

from matrix_bridge.room_provisioner import (
    RoomDefinition,
    RoomProvisioner,
    _alias_localpart,
    _power_levels_for,
    audit_room,
    console_primary,
    notifications,
    pantheon_ops,
)
from matrix_bridge.seed_rooms import (
    SEED_ROOM_KINDS,
    SeedRoomBootstrap,
    seed_room_definitions,
)
from matrix_bridge.synapse_admin import SynapseAdminError


@dataclass
class FakeAdmin:
    """In-memory stand-in for :class:`SynapseAdminClient`."""

    aliases: dict[str, str] = field(default_factory=dict)
    rooms: dict[str, dict[str, Any]] = field(default_factory=dict)
    state_events: list[dict[str, Any]] = field(default_factory=list)
    invites: list[tuple[str, str]] = field(default_factory=list)
    fail_create_aliases: set[str] = field(default_factory=set)
    next_room_seq: int = 0

    async def resolve_alias(self, alias: str) -> str | None:
        return self.aliases.get(alias)

    async def create_room(
        self,
        *,
        alias_localpart: str,
        name: str,
        topic: str,
        preset: str = "private_chat",
        visibility: str = "private",
        invite: list[str] | None = None,
        initial_state: list[dict[str, Any]] | None = None,
    ) -> str:
        if alias_localpart in self.fail_create_aliases:
            raise SynapseAdminError(
                f"createRoom failed for #{alias_localpart}",
                status_code=500,
                body={"errcode": "M_UNKNOWN"},
            )
        self.next_room_seq += 1
        room_id = f"!seed{self.next_room_seq}:tiresias.local"
        # Synapse derives the full alias from the request server name —
        # the appservice yaml restricts the server to MATRIX_SERVER_NAME
        # so we hard-code that here for the fake.
        alias = f"#{alias_localpart}:tiresias.local"
        self.aliases[alias] = room_id
        self.rooms[room_id] = {
            "name": name,
            "topic": topic,
            "preset": preset,
            "visibility": visibility,
            "invite": list(invite or []),
            "initial_state": list(initial_state or []),
        }
        for u in invite or []:
            self.invites.append((room_id, u))
        return room_id

    async def set_state(
        self,
        *,
        room_id: str,
        event_type: str,
        content: dict[str, Any],
        state_key: str = "",
    ) -> str:
        self.state_events.append(
            {
                "room_id": room_id,
                "type": event_type,
                "state_key": state_key,
                "content": content,
            }
        )
        return f"$evt-{len(self.state_events)}"

    async def set_power_levels(
        self, *, room_id: str, content: dict[str, Any]
    ) -> str:
        return await self.set_state(
            room_id=room_id, event_type="m.room.power_levels", content=content
        )

    async def invite_user(self, *, room_id: str, user_id: str) -> None:
        self.invites.append((room_id, user_id))


# ── room factories ─────────────────────────────────────────────────────────

def test_notifications_factory() -> None:
    room = notifications(server_name="tiresias.local", tenant_id="t-1")
    assert room.alias == "#notifications:tiresias.local"
    assert room.kind == "notifications"
    assert room.human_write is False
    assert "orchestrator" in room.allowed_roles
    assert "memory" in room.allowed_roles
    assert "soulwatch" in room.allowed_roles


def test_seed_room_definitions_returns_four_rooms_in_canonical_order() -> None:
    rooms = seed_room_definitions(server_name="tiresias.local", tenant_id="t-1")
    assert [r.kind for r in rooms] == list(SEED_ROOM_KINDS)
    assert [r.alias for r in rooms] == [
        "#tiresias-console:tiresias.local",
        "#pantheon-ops:tiresias.local",
        "#notifications:tiresias.local",
        "#tiresias-audit:tiresias.local",
    ]


def test_alias_localpart_helper() -> None:
    assert _alias_localpart("#tiresias-console:tiresias.local") == "tiresias-console"
    assert _alias_localpart("#pantheon-ops:tiresias.local") == "pantheon-ops"
    assert _alias_localpart("#notifications:tiresias.local") == "notifications"


@pytest.mark.parametrize(
    "bad_alias",
    ["tiresias-console", "#:tiresias.local", "#tiresias-console", "#x:"],
)
def test_alias_localpart_rejects_malformed(bad_alias: str) -> None:
    with pytest.raises(ValueError):
        _alias_localpart(bad_alias)


# ── power levels ───────────────────────────────────────────────────────────

def test_power_levels_pantheon_ops_blocks_human_messages() -> None:
    room = pantheon_ops(server_name="tiresias.local", tenant_id="t-1")
    pl = _power_levels_for(room, bot_user_id="@tiresias-bot:tiresias.local")
    # Bot has full power.
    assert pl["users"]["@tiresias-bot:tiresias.local"] == 100
    # Default send floor is 50 (agents).
    assert pl["events_default"] == 50
    # m.room.message override forces bot-only — humans (PL 75) can't post.
    assert pl["events"]["m.room.message"] == 100


def test_power_levels_console_allows_humans_to_post() -> None:
    room = console_primary(server_name="tiresias.local", tenant_id="t-1")
    pl = _power_levels_for(room, bot_user_id="@tiresias-bot:tiresias.local")
    # Console is human-write, so events_default drops to 0.
    assert pl["events_default"] == 0
    # No m.room.message override — anyone with PL >= 0 can post.
    assert "m.room.message" not in pl["events"]


def test_power_levels_audit_is_bot_only() -> None:
    room = audit_room(server_name="tiresias.local", tenant_id="t-1")
    pl = _power_levels_for(room, bot_user_id="@tiresias-bot:tiresias.local")
    assert pl["events_default"] == 100
    assert pl["events"]["m.room.message"] == 100


def test_power_levels_notifications_is_agent_write_human_read() -> None:
    room = notifications(server_name="tiresias.local", tenant_id="t-1")
    pl = _power_levels_for(room, bot_user_id="@tiresias-bot:tiresias.local")
    # Agents at PL 50 can write; humans at PL 75 also clear the floor in
    # raw PL terms, but the m.room.message override is set to 50, which
    # means humans CAN technically post here at the Matrix layer. The
    # actual human write-block is enforced by Cedar matrix-005-style
    # rules; this test pins the Matrix floor at 50 so non-allowed agents
    # (PL 0) cannot post.
    assert pl["events_default"] == 50
    assert pl["events"]["m.room.message"] == 50


# ── RoomProvisioner.ensure ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ensure_creates_room_when_alias_missing() -> None:
    admin = FakeAdmin()
    prov = RoomProvisioner(
        admin=admin,
        bot_user_id="@tiresias-bot:tiresias.local",
        primary_user_id="@user-primary:tiresias.local",
    )
    room = console_primary(server_name="tiresias.local", tenant_id="t-1")
    rid = await prov.ensure(room)
    assert rid.startswith("!seed")
    assert admin.aliases[room.alias] == rid
    # Console is human-write → the primary user is invited at create time.
    invites_for_room = [u for r, u in admin.invites if r == rid]
    assert "@user-primary:tiresias.local" in invites_for_room
    # initial_state included PL, history visibility, join rules.
    init_types = {
        s["type"] for s in admin.rooms[rid]["initial_state"]
    }
    assert "m.room.history_visibility" in init_types
    assert "m.room.join_rules" in init_types
    assert "m.room.power_levels" in init_types


@pytest.mark.asyncio
async def test_ensure_is_idempotent_when_alias_exists() -> None:
    admin = FakeAdmin(aliases={"#pantheon-ops:tiresias.local": "!preexisting:t.l"})
    prov = RoomProvisioner(
        admin=admin, bot_user_id="@tiresias-bot:tiresias.local"
    )
    room = pantheon_ops(server_name="tiresias.local", tenant_id="t-1")
    rid = await prov.ensure(room)
    assert rid == "!preexisting:t.l"
    # No new room created, no power-level reapply.
    assert not admin.rooms
    assert not admin.state_events


@pytest.mark.asyncio
async def test_ensure_does_not_invite_primary_into_agent_only_rooms() -> None:
    admin = FakeAdmin()
    prov = RoomProvisioner(
        admin=admin,
        bot_user_id="@tiresias-bot:tiresias.local",
        primary_user_id="@user-primary:tiresias.local",
    )
    room = pantheon_ops(server_name="tiresias.local", tenant_id="t-1")
    rid = await prov.ensure(room)
    # pantheon-ops has human_write=False → no invite for the primary user.
    invites_for_room = [u for r, u in admin.invites if r == rid]
    assert "@user-primary:tiresias.local" not in invites_for_room


@pytest.mark.asyncio
async def test_ensure_continues_when_power_level_reapply_fails(monkeypatch) -> None:
    admin = FakeAdmin()

    async def boom(*, room_id: str, content: dict[str, Any]) -> str:
        raise SynapseAdminError("nope", status_code=500)

    monkeypatch.setattr(admin, "set_power_levels", boom)
    prov = RoomProvisioner(
        admin=admin,
        bot_user_id="@tiresias-bot:tiresias.local",
        primary_user_id="@user-primary:tiresias.local",
    )
    room = console_primary(server_name="tiresias.local", tenant_id="t-1")
    # Should not raise — the create succeeded, and the reapply is best-effort.
    rid = await prov.ensure(room)
    assert rid is not None


# ── SeedRoomBootstrap ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_bootstrap_mints_all_four_seed_rooms() -> None:
    admin = FakeAdmin()
    prov = RoomProvisioner(
        admin=admin,
        bot_user_id="@tiresias-bot:tiresias.local",
        primary_user_id="@user-primary:tiresias.local",
    )
    boot = SeedRoomBootstrap(
        provisioner=prov, server_name="tiresias.local", tenant_id="t-1"
    )
    results = await boot.run()
    assert set(results.keys()) == {
        "#tiresias-console:tiresias.local",
        "#pantheon-ops:tiresias.local",
        "#notifications:tiresias.local",
        "#tiresias-audit:tiresias.local",
    }
    assert all(v is not None for v in results.values())


@pytest.mark.asyncio
async def test_bootstrap_records_failure_without_aborting() -> None:
    admin = FakeAdmin(fail_create_aliases={"pantheon-ops"})
    prov = RoomProvisioner(
        admin=admin, bot_user_id="@tiresias-bot:tiresias.local"
    )
    boot = SeedRoomBootstrap(
        provisioner=prov, server_name="tiresias.local", tenant_id="t-1"
    )
    results = await boot.run()
    # The failed alias is recorded as None.
    assert results["#pantheon-ops:tiresias.local"] is None
    # Other rooms still came up.
    assert results["#tiresias-console:tiresias.local"] is not None
    assert results["#notifications:tiresias.local"] is not None
    assert results["#tiresias-audit:tiresias.local"] is not None


@pytest.mark.asyncio
async def test_bootstrap_is_idempotent_on_second_run() -> None:
    admin = FakeAdmin()
    prov = RoomProvisioner(
        admin=admin, bot_user_id="@tiresias-bot:tiresias.local"
    )
    boot = SeedRoomBootstrap(
        provisioner=prov, server_name="tiresias.local", tenant_id="t-1"
    )
    first = await boot.run()
    rooms_after_first = dict(admin.rooms)

    second = await boot.run()
    # Same room ids returned both times.
    assert first == second
    # No new rooms minted on the second run.
    assert admin.rooms == rooms_after_first
