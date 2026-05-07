"""Tests for the BFF identity-header dependency (platform_auth.bff).

Covers the D-06 contract between platform-web (BFF) and platform-api:
the BFF authenticates the user via local session, then proxies upstream
with X-Tiresias-User-Id / -Role / -Team-Id identity headers.
"""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from platform_auth.bff import (
    BffIdentity,
    get_bff_identity,
    require_bff_role,
)


# ── BffIdentity model ────────────────────────────────────────────────────────


def test_bff_identity_has_role_admin_always_passes() -> None:
    identity = BffIdentity(user_id="u1", role="admin")
    assert identity.has_role("operator") is True
    assert identity.has_role("viewer") is True
    # Even with no roles requested, admin matches its own role.
    assert identity.has_role("admin") is True


def test_bff_identity_has_role_membership() -> None:
    identity = BffIdentity(user_id="u1", role="operator")
    assert identity.has_role("operator") is True
    assert identity.has_role("operator", "viewer") is True
    assert identity.has_role("admin") is False
    assert identity.has_role("viewer") is False


def test_bff_identity_is_frozen() -> None:
    identity = BffIdentity(user_id="u1", role="viewer")
    with pytest.raises(Exception):  # pydantic ValidationError on frozen
        identity.role = "admin"  # type: ignore[misc]


# ── get_bff_identity dependency ───────────────────────────────────────────────


@pytest.fixture
def app_with_identity() -> FastAPI:
    app = FastAPI()

    @app.get("/me")
    async def me(identity: BffIdentity = Depends(get_bff_identity)) -> dict:
        return identity.model_dump()

    return app


def test_get_bff_identity_missing_user_id_returns_401(app_with_identity: FastAPI) -> None:
    client = TestClient(app_with_identity)
    response = client.get("/me")
    assert response.status_code == 401
    assert "X-Tiresias-User-Id" in response.json()["detail"]


def test_get_bff_identity_empty_user_id_returns_401(app_with_identity: FastAPI) -> None:
    client = TestClient(app_with_identity)
    response = client.get("/me", headers={"X-Tiresias-User-Id": ""})
    assert response.status_code == 401


def test_get_bff_identity_full_headers(app_with_identity: FastAPI) -> None:
    client = TestClient(app_with_identity)
    response = client.get(
        "/me",
        headers={
            "X-Tiresias-User-Id": "user-123",
            "X-Tiresias-Role": "operator",
            "X-Tiresias-Team-Id": "team-A",
        },
    )
    assert response.status_code == 200
    assert response.json() == {
        "user_id": "user-123",
        "role": "operator",
        "team_id": "team-A",
    }


def test_get_bff_identity_defaults_when_only_user_id(
    app_with_identity: FastAPI,
) -> None:
    client = TestClient(app_with_identity)
    response = client.get("/me", headers={"X-Tiresias-User-Id": "user-123"})
    assert response.status_code == 200
    assert response.json() == {
        "user_id": "user-123",
        "role": "viewer",
        "team_id": "",
    }


# ── require_bff_role factory ─────────────────────────────────────────────────


@pytest.fixture
def app_with_admin_only() -> FastAPI:
    app = FastAPI()

    @app.get("/admin")
    async def admin_only(
        identity: BffIdentity = Depends(require_bff_role("admin")),
    ) -> dict:
        return {"ok": True, "user": identity.user_id}

    return app


@pytest.fixture
def app_with_operator() -> FastAPI:
    app = FastAPI()

    @app.get("/ops")
    async def operator(
        identity: BffIdentity = Depends(require_bff_role("operator")),
    ) -> dict:
        return {"ok": True, "user": identity.user_id, "role": identity.role}

    return app


def test_require_bff_role_admin_passes_admin_user(app_with_admin_only: FastAPI) -> None:
    client = TestClient(app_with_admin_only)
    response = client.get(
        "/admin",
        headers={"X-Tiresias-User-Id": "u1", "X-Tiresias-Role": "admin"},
    )
    assert response.status_code == 200
    assert response.json() == {"ok": True, "user": "u1"}


def test_require_bff_role_admin_blocks_viewer(app_with_admin_only: FastAPI) -> None:
    client = TestClient(app_with_admin_only)
    response = client.get(
        "/admin",
        headers={"X-Tiresias-User-Id": "u1", "X-Tiresias-Role": "viewer"},
    )
    assert response.status_code == 403
    assert "admin" in response.json()["detail"]


def test_require_bff_role_operator_blocks_viewer(app_with_operator: FastAPI) -> None:
    client = TestClient(app_with_operator)
    response = client.get(
        "/ops",
        headers={"X-Tiresias-User-Id": "u1", "X-Tiresias-Role": "viewer"},
    )
    assert response.status_code == 403


def test_require_bff_role_operator_passes_operator(app_with_operator: FastAPI) -> None:
    client = TestClient(app_with_operator)
    response = client.get(
        "/ops",
        headers={"X-Tiresias-User-Id": "u1", "X-Tiresias-Role": "operator"},
    )
    assert response.status_code == 200
    assert response.json()["role"] == "operator"


def test_require_bff_role_admin_always_allowed_even_when_role_is_operator(
    app_with_operator: FastAPI,
) -> None:
    """Admin is universally allowed: a user tagged 'admin' bypasses any role gate."""
    client = TestClient(app_with_operator)
    response = client.get(
        "/ops",
        headers={"X-Tiresias-User-Id": "u1", "X-Tiresias-Role": "admin"},
    )
    assert response.status_code == 200
    assert response.json()["role"] == "admin"


def test_require_bff_role_missing_user_id_returns_401(app_with_admin_only: FastAPI) -> None:
    """Missing identity should still 401 (auth) before 403 (authz)."""
    client = TestClient(app_with_admin_only)
    response = client.get("/admin")
    assert response.status_code == 401
