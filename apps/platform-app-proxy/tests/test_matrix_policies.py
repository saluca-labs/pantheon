"""Tests for the TiresiasMatrix Cedar policy set (matrix.cedar).

Exercises every policy in ``policies/cedar/matrix.cedar`` against a
freshly-loaded ``cedarpy`` engine to confirm:

* legitimate paths (intra-tenant join/send) are permitted;
* the cross-tenant catch-all (matrix-006) overrides positive permits;
* humans cannot post to the agent-only ``pantheon-ops`` room (matrix-005);
* only ``platform-provisioner`` can issue invites (matrix-007);
* the legacy ``Tiresias::*`` namespace continues to authorize plugin
  tool_calls via ``base.cedar`` (regression guard for the existing
  permit-all baseline).

License: Apache-2.0
"""

from __future__ import annotations

from pathlib import Path

import cedarpy
import pytest

_PROJECT_ROOT = Path(__file__).resolve().parents[1]
_POLICIES_DIR = _PROJECT_ROOT / "policies" / "cedar"


@pytest.fixture(scope="module")
def policies() -> str:
    """Concatenate all .cedar files the runtime engine would load.

    Includes ``base.cedar`` (permit-all baseline) — used for tests that
    verify the legacy ``Tiresias::*`` namespace still works alongside
    the matrix policies.
    """
    parts = [p.read_text(encoding="utf-8") for p in sorted(_POLICIES_DIR.rglob("*.cedar"))]
    return "\n\n".join(parts)


@pytest.fixture(scope="module")
def matrix_only_policies() -> str:
    """Just the matrix.cedar policy set (no base.cedar permit-all).

    Used to test the matrix policies in isolation.  In production the
    base.cedar permit-all is currently in observe-only baselining mode
    and will be replaced before matrix-deny semantics matter — at that
    point the matrix `forbid` rules (matrix-005, matrix-006, matrix-007)
    will still win because Cedar applies `forbid` over `permit`, but
    pure absence-of-permit denies require a non-permissive baseline.
    These tests exercise that future semantics directly.
    """
    return (_POLICIES_DIR / "matrix.cedar").read_text(encoding="utf-8")


def _matrix_user(*, agent_role: str, tenant_id: str, is_human: bool, user_scope: str) -> dict:
    return {
        "uid": {"type": "TiresiasMatrix::MatrixUser", "id": f"@{agent_role}:tiresias.local"},
        "attrs": {
            "agent_role": agent_role,
            "tenant_id": tenant_id,
            "is_human": is_human,
            "user_scope": user_scope,
        },
        "parents": [],
    }


def _matrix_room(
    *, room_alias: str, tenant_id: str, allowed_roles: list[str], human_write: bool
) -> dict:
    return {
        "uid": {"type": "TiresiasMatrix::MatrixRoom", "id": f"!{room_alias}:tiresias.local"},
        "attrs": {
            "room_alias": room_alias,
            "tenant_id": tenant_id,
            "allowed_roles": allowed_roles,
            "human_write": human_write,
        },
        "parents": [],
    }


def _request(action: str, principal_id: str, resource_id: str) -> dict:
    return {
        "principal": f'TiresiasMatrix::MatrixUser::"{principal_id}"',
        "action": f'TiresiasMatrix::Action::"{action}"',
        "resource": f'TiresiasMatrix::MatrixRoom::"{resource_id}"',
        "context": {},
    }


def _decide(policies: str, action: str, user: dict, room: dict) -> bool:
    req = _request(action, user["uid"]["id"], room["uid"]["id"])
    return cedarpy.is_authorized(req, policies, [user, room]).allowed


# ── matrix-001: intra-tenant join ──────────────────────────────────────────────


def test_matrix_001_permits_role_match_same_tenant(policies: str) -> None:
    user = _matrix_user(agent_role="memory", tenant_id="t1", is_human=False, user_scope="agent")
    room = _matrix_room(
        room_alias="agent-memory", tenant_id="t1", allowed_roles=["memory"], human_write=False
    )
    assert _decide(policies, "join", user, room) is True


def test_matrix_001_denies_role_mismatch(matrix_only_policies: str) -> None:
    user = _matrix_user(agent_role="memory", tenant_id="t1", is_human=False, user_scope="agent")
    room = _matrix_room(
        room_alias="agent-research",
        tenant_id="t1",
        allowed_roles=["research"],
        human_write=False,
    )
    assert _decide(matrix_only_policies, "join", user, room) is False


# ── matrix-002: primary human send_message ────────────────────────────────────


def test_matrix_002_permits_primary_human_to_human_write_room(policies: str) -> None:
    user = _matrix_user(
        agent_role="user-primary", tenant_id="t1", is_human=True, user_scope="primary"
    )
    room = _matrix_room(
        room_alias="tiresias-console",
        tenant_id="t1",
        allowed_roles=["user-primary"],
        human_write=True,
    )
    assert _decide(policies, "send_message", user, room) is True


def test_matrix_002_denies_primary_in_non_human_write_room(matrix_only_policies: str) -> None:
    user = _matrix_user(
        agent_role="user-primary", tenant_id="t1", is_human=True, user_scope="primary"
    )
    room = _matrix_room(
        room_alias="agent-only",
        tenant_id="t1",
        allowed_roles=["user-primary"],
        human_write=False,
    )
    assert _decide(matrix_only_policies, "send_message", user, room) is False


# ── matrix-003: sub-user send_message ─────────────────────────────────────────


def test_matrix_003_permits_sub_user_in_their_console(policies: str) -> None:
    user = _matrix_user(
        agent_role="user-sub-001", tenant_id="t1", is_human=True, user_scope="sub"
    )
    room = _matrix_room(
        room_alias="tiresias-console-sub-001",
        tenant_id="t1",
        allowed_roles=["user-sub-001"],
        human_write=True,
    )
    assert _decide(policies, "send_message", user, room) is True


def test_matrix_003_denies_sub_user_in_other_sub_console(matrix_only_policies: str) -> None:
    user = _matrix_user(
        agent_role="user-sub-001", tenant_id="t1", is_human=True, user_scope="sub"
    )
    other = _matrix_room(
        room_alias="tiresias-console-sub-002",
        tenant_id="t1",
        allowed_roles=["user-sub-002"],
        human_write=True,
    )
    assert _decide(matrix_only_policies, "send_message", user, other) is False


# ── matrix-004: agent send_message ────────────────────────────────────────────


def test_matrix_004_permits_agent_in_role_room(policies: str) -> None:
    user = _matrix_user(agent_role="memory", tenant_id="t1", is_human=False, user_scope="agent")
    room = _matrix_room(
        room_alias="agent-memory", tenant_id="t1", allowed_roles=["memory"], human_write=False
    )
    assert _decide(policies, "send_message", user, room) is True


# ── matrix-005: humans never write to pantheon-ops ────────────────────────────


def test_matrix_005_humans_cannot_post_to_pantheon_ops(policies: str) -> None:
    user = _matrix_user(
        agent_role="user-primary", tenant_id="t1", is_human=True, user_scope="primary"
    )
    room = _matrix_room(
        room_alias="pantheon-ops",
        tenant_id="t1",
        allowed_roles=["user-primary", "memory"],
        human_write=True,
    )
    assert _decide(policies, "send_message", user, room) is False


def test_matrix_005_agents_can_post_to_pantheon_ops(policies: str) -> None:
    user = _matrix_user(agent_role="memory", tenant_id="t1", is_human=False, user_scope="agent")
    room = _matrix_room(
        room_alias="pantheon-ops",
        tenant_id="t1",
        allowed_roles=["memory"],
        human_write=False,
    )
    assert _decide(policies, "send_message", user, room) is True


# ── matrix-006: cross-tenant catch-all ────────────────────────────────────────


def test_matrix_006_denies_cross_tenant_join(policies: str) -> None:
    user = _matrix_user(
        agent_role="memory", tenant_id="tenant-A", is_human=False, user_scope="agent"
    )
    room = _matrix_room(
        room_alias="agent-memory",
        tenant_id="tenant-B",
        allowed_roles=["memory"],
        human_write=False,
    )
    assert _decide(policies, "join", user, room) is False


def test_matrix_006_denies_cross_tenant_send(policies: str) -> None:
    user = _matrix_user(
        agent_role="user-primary",
        tenant_id="tenant-A",
        is_human=True,
        user_scope="primary",
    )
    room = _matrix_room(
        room_alias="tiresias-console",
        tenant_id="tenant-B",
        allowed_roles=["user-primary"],
        human_write=True,
    )
    assert _decide(policies, "send_message", user, room) is False


# ── matrix-007: invite is provisioner-only ────────────────────────────────────


def test_matrix_007_provisioner_can_invite(policies: str) -> None:
    user = _matrix_user(
        agent_role="platform-provisioner",
        tenant_id="t1",
        is_human=False,
        user_scope="agent",
    )
    room = _matrix_room(
        room_alias="tiresias-console",
        tenant_id="t1",
        allowed_roles=["platform-provisioner"],
        human_write=True,
    )
    assert _decide(policies, "invite", user, room) is True


def test_matrix_007_non_provisioner_cannot_invite(policies: str) -> None:
    user = _matrix_user(
        agent_role="user-primary", tenant_id="t1", is_human=True, user_scope="primary"
    )
    room = _matrix_room(
        room_alias="tiresias-console",
        tenant_id="t1",
        allowed_roles=["user-primary"],
        human_write=True,
    )
    assert _decide(policies, "invite", user, room) is False


def test_matrix_007_agent_cannot_invite(policies: str) -> None:
    user = _matrix_user(
        agent_role="memory", tenant_id="t1", is_human=False, user_scope="agent"
    )
    room = _matrix_room(
        room_alias="agent-memory",
        tenant_id="t1",
        allowed_roles=["memory"],
        human_write=False,
    )
    assert _decide(policies, "invite", user, room) is False


# ── Regression: legacy Tiresias namespace still works ────────────────────────


def test_legacy_tiresias_tool_call_still_permitted(policies: str) -> None:
    """The base.cedar permit-all baseline must still authorize plugin
    tool_calls after the matrix policy set is added."""
    req = {
        "principal": 'Tiresias::Agent::"alfred-minipc"',
        "action": 'Tiresias::Action::"tool_call"',
        "resource": 'Tiresias::Plugin::"slack"',
        "context": {
            "tool_name": "send",
            "rate_count": 1,
            "rate_window_seconds": 60,
            "hour_of_day": 12,
            "has_approval": False,
            "estimated_cost_usd": 0,
            "input_keys": [],
        },
    }
    entities = [
        {
            "uid": {"type": "Tiresias::Tenant", "id": "t1"},
            "attrs": {"tier": "free", "max_agents": 5},
            "parents": [],
        },
        {
            "uid": {"type": "Tiresias::Agent", "id": "alfred-minipc"},
            "attrs": {"soulkey": "k", "roles": []},
            "parents": [{"type": "Tiresias::Tenant", "id": "t1"}],
        },
        {
            "uid": {"type": "Tiresias::Plugin", "id": "slack"},
            "attrs": {"classification": "safe", "owner_tenant": "t1"},
            "parents": [],
        },
    ]
    assert cedarpy.is_authorized(req, policies, entities).allowed is True
