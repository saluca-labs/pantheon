"""Pure-function tests for the provisioner helpers.

License: Apache-2.0.
"""

from __future__ import annotations

import pytest

from matrix_bridge.room_provisioner import (
    agent_role,
    audit_room,
    console_primary,
    console_sub,
    pantheon_ops,
)
from matrix_bridge.user_provisioner import (
    derive_agent_matrix_id,
    derive_user_matrix_id,
    is_valid_agent_id,
    is_valid_user_id,
)


# ── user_provisioner ─────────────────────────────────────────────────────────

def test_derive_agent_matrix_id() -> None:
    assert (
        derive_agent_matrix_id(agent_role="memory", server_name="tiresias.local")
        == "@agent-memory:tiresias.local"
    )


def test_derive_user_matrix_id_primary() -> None:
    assert (
        derive_user_matrix_id(scope="primary", sub_id=None, server_name="tiresias.local")
        == "@user-primary:tiresias.local"
    )


def test_derive_user_matrix_id_sub() -> None:
    assert (
        derive_user_matrix_id(scope="sub", sub_id="alice", server_name="tiresias.local")
        == "@user-sub-alice:tiresias.local"
    )


def test_derive_user_matrix_id_sub_requires_id() -> None:
    with pytest.raises(ValueError, match="sub_id"):
        derive_user_matrix_id(scope="sub", sub_id=None, server_name="tiresias.local")


def test_derive_user_matrix_id_rejects_agent_scope() -> None:
    with pytest.raises(ValueError, match="derive_agent_matrix_id"):
        derive_user_matrix_id(scope="agent", sub_id=None, server_name="tiresias.local")


@pytest.mark.parametrize(
    "matrix_id,expected",
    [
        ("@agent-memory:tiresias.local", True),
        ("@agent-research-001:tiresias.local", True),
        ("@user-primary:tiresias.local", False),
        ("@agent-:tiresias.local", False),
        ("not-a-matrix-id", False),
    ],
)
def test_is_valid_agent_id(matrix_id: str, expected: bool) -> None:
    assert is_valid_agent_id(matrix_id) is expected


@pytest.mark.parametrize(
    "matrix_id,expected",
    [
        ("@user-primary:tiresias.local", True),
        ("@user-sub-alice:tiresias.local", True),
        ("@agent-memory:tiresias.local", False),
        ("@user-other:tiresias.local", False),
    ],
)
def test_is_valid_user_id(matrix_id: str, expected: bool) -> None:
    assert is_valid_user_id(matrix_id) is expected


# ── room_provisioner ─────────────────────────────────────────────────────────

def test_pantheon_ops_alias() -> None:
    room = pantheon_ops(server_name="tiresias.local", tenant_id="t-1")
    assert room.alias == "#pantheon-ops:tiresias.local"
    assert room.kind == "pantheon-ops"
    assert room.tenant_id == "t-1"
    assert room.human_write is False
    assert "orchestrator" in room.allowed_roles


def test_console_primary_is_human_writable() -> None:
    room = console_primary(server_name="tiresias.local", tenant_id="t-1")
    assert room.alias == "#tiresias-console:tiresias.local"
    assert room.human_write is True
    assert room.allowed_roles == ("*",)


def test_console_sub_per_user() -> None:
    room = console_sub(
        server_name="tiresias.local", tenant_id="t-1", sub_id="alice"
    )
    assert room.alias == "#tiresias-console-alice:tiresias.local"
    assert room.human_write is True


def test_console_sub_requires_sub_id() -> None:
    with pytest.raises(ValueError, match="sub_id"):
        console_sub(server_name="tiresias.local", tenant_id="t-1", sub_id="")


def test_agent_role_alias_includes_tenant() -> None:
    room = agent_role(
        server_name="tiresias.local", tenant_id="acme", role="research"
    )
    assert room.alias == "#agent-research-acme:tiresias.local"
    assert room.kind == "agent-role"
    assert room.allowed_roles == ("research",)


def test_audit_room_is_read_only() -> None:
    room = audit_room(server_name="tiresias.local", tenant_id="t-1")
    assert room.alias == "#tiresias-audit:tiresias.local"
    assert room.human_write is False
    assert "soulwatch" in room.allowed_roles
