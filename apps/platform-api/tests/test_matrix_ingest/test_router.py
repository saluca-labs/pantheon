"""Tests for the /ingest/matrix router used by the matrix-bridge appservice.

License: Apache-2.0
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.matrix_ingest.router import router


@pytest.fixture()
def client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


# ── happy paths ────────────────────────────────────────────────────────────


def test_ingest_returns_202_and_event_id(client: TestClient) -> None:
    payload = {
        "source": "matrix_appservice",
        "txn_id": "txn-001",
        "event": {
            "type": "m.room.message",
            "sender": "@agent-memory:tiresias.local",
            "room_id": "!abc:tiresias.local",
            "event_id": "$evt-001:tiresias.local",
            "content": {"body": "hello", "msgtype": "m.text"},
        },
    }
    resp = client.post("/ingest/matrix", json=payload)
    assert resp.status_code == 202
    body = resp.json()
    assert body["accepted"] is True
    assert body["event_id"] == "$evt-001:tiresias.local"
    assert body["soulwatch_envelope_kind"] == "matrix_event"


def test_ingest_synthesises_event_id_when_missing(client: TestClient) -> None:
    resp = client.post(
        "/ingest/matrix",
        json={
            "txn_id": "txn-002",
            "event": {
                "type": "m.room.member",
                "sender": "@user-primary:tiresias.local",
                "room_id": "!def:tiresias.local",
                "content": {"membership": "join"},
            },
        },
    )
    assert resp.status_code == 202
    assert resp.json()["event_id"].startswith("evt_")


def test_ingest_handles_minimal_event(client: TestClient) -> None:
    """A nearly-empty event must not crash the normaliser."""
    resp = client.post(
        "/ingest/matrix",
        json={"txn_id": "txn-003", "event": {}},
    )
    assert resp.status_code == 202


def test_ingest_handles_unknown_sender_namespace(client: TestClient) -> None:
    resp = client.post(
        "/ingest/matrix",
        json={
            "txn_id": "txn-004",
            "event": {
                "type": "m.room.message",
                "sender": "@stranger:tiresias.local",
                "room_id": "!ghi:tiresias.local",
                "content": {"body": "x"},
            },
        },
    )
    assert resp.status_code == 202


# ── auth ───────────────────────────────────────────────────────────────────


def test_ingest_rejects_bad_internal_key(monkeypatch, client: TestClient) -> None:
    monkeypatch.setenv("INTERNAL_API_KEY", "expected-secret")
    resp = client.post(
        "/ingest/matrix",
        json={"txn_id": "txn-005", "event": {}},
        headers={"X-Internal-Key": "wrong"},
    )
    assert resp.status_code == 403


def test_ingest_accepts_correct_internal_key(monkeypatch, client: TestClient) -> None:
    monkeypatch.setenv("INTERNAL_API_KEY", "expected-secret")
    resp = client.post(
        "/ingest/matrix",
        json={"txn_id": "txn-006", "event": {}},
        headers={"X-Internal-Key": "expected-secret"},
    )
    assert resp.status_code == 202


def test_ingest_falls_back_to_soulwatch_internal_key(
    monkeypatch, client: TestClient
) -> None:
    monkeypatch.delenv("INTERNAL_API_KEY", raising=False)
    monkeypatch.setenv("SOULWATCH_INTERNAL_API_KEY", "shared-with-soulwatch")
    resp_bad = client.post(
        "/ingest/matrix",
        json={"txn_id": "txn-007", "event": {}},
        headers={"X-Internal-Key": "no"},
    )
    assert resp_bad.status_code == 403
    resp_ok = client.post(
        "/ingest/matrix",
        json={"txn_id": "txn-007", "event": {}},
        headers={"X-Internal-Key": "shared-with-soulwatch"},
    )
    assert resp_ok.status_code == 202


def test_ingest_skips_auth_when_no_key_configured(
    monkeypatch, client: TestClient
) -> None:
    """First-boot dev: no key set → bridge can come up before secrets exist."""
    monkeypatch.delenv("INTERNAL_API_KEY", raising=False)
    monkeypatch.delenv("SOULWATCH_INTERNAL_API_KEY", raising=False)
    resp = client.post(
        "/ingest/matrix", json={"txn_id": "txn-008", "event": {}}
    )
    assert resp.status_code == 202


# ── normalisation ──────────────────────────────────────────────────────────


def test_normalise_classifies_agent_namespace() -> None:
    from src.matrix_ingest.router import MatrixIngestRequest, _normalise

    req = MatrixIngestRequest(
        txn_id="t",
        event={
            "type": "m.room.message",
            "sender": "@agent-memory:tiresias.local",
            "room_id": "!r:tiresias.local",
            "content": {"body": "x"},
            "tiresias_tenant_id": "t1",
        },
    )
    env = _normalise(req)
    assert env["sender_namespace"] == "agent"
    assert env["sender_localpart"] == "agent-memory"
    assert env["tenant_id"] == "t1"
    assert env["event_subtype"] == "m.room.message"


def test_normalise_classifies_user_namespace() -> None:
    from src.matrix_ingest.router import MatrixIngestRequest, _normalise

    req = MatrixIngestRequest(
        txn_id="t",
        event={
            "type": "m.room.member",
            "sender": "@user-primary:tiresias.local",
            "room_id": "!r:tiresias.local",
            "content": {"membership": "invite"},
        },
    )
    env = _normalise(req)
    assert env["sender_namespace"] == "user"
    assert env["membership"] == "invite"


def test_normalise_handles_other_namespace() -> None:
    from src.matrix_ingest.router import MatrixIngestRequest, _normalise

    req = MatrixIngestRequest(
        txn_id="t",
        event={
            "type": "m.room.message",
            "sender": "@bot:tiresias.local",
            "room_id": "!r:tiresias.local",
            "content": {},
        },
    )
    env = _normalise(req)
    assert env["sender_namespace"] == "other"
