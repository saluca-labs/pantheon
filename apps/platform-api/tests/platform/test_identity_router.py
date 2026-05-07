"""Tests for the BFF identity echo router (src.platform.identity_router).

The router is exercised in isolation against a minimal FastAPI app to
avoid booting the whole soulauth stack.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.platform.identity_router import router as identity_router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(identity_router)
    return TestClient(app)


def test_identity_echo_returns_parsed_headers() -> None:
    response = _client().get(
        "/v1/platform/identity",
        headers={
            "X-Tiresias-User-Id": "user-42",
            "X-Tiresias-Role": "operator",
            "X-Tiresias-Team-Id": "team-blue",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["identity"] == {
        "user_id": "user-42",
        "role": "operator",
        "team_id": "team-blue",
    }
    assert "server_time" in body


def test_identity_echo_missing_user_id_returns_401() -> None:
    response = _client().get("/v1/platform/identity")
    assert response.status_code == 401
    assert "X-Tiresias-User-Id" in response.json()["detail"]


def test_identity_echo_defaults_when_only_user_id() -> None:
    response = _client().get(
        "/v1/platform/identity",
        headers={"X-Tiresias-User-Id": "user-1"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["identity"]["role"] == "viewer"
    assert body["identity"]["team_id"] == ""
