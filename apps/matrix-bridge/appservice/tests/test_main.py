"""HTTP-level tests for the Tiresias Matrix appservice.

License: Apache-2.0.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_healthz_ok(client: TestClient) -> None:
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_transactions_rejects_missing_auth(client: TestClient) -> None:
    resp = client.put("/transactions/txn-1", json={"events": []})
    assert resp.status_code == 403


def test_transactions_rejects_wrong_token(client: TestClient) -> None:
    resp = client.put(
        "/transactions/txn-1",
        json={"events": []},
        headers={"Authorization": "Bearer not-the-real-token"},
    )
    assert resp.status_code == 403


def test_transactions_accepts_valid_token_empty_batch(
    client: TestClient, hs_token: str
) -> None:
    resp = client.put(
        "/transactions/txn-1",
        json={"events": []},
        headers={"Authorization": f"Bearer {hs_token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"processed": 0}


def test_transactions_accepts_valid_token_with_events(
    client: TestClient, hs_token: str
) -> None:
    body = {
        "events": [
            {
                "type": "m.room.message",
                "event_id": "$evt-1",
                "sender": "@agent-test:tiresias.local",
                "room_id": "!room-1:tiresias.local",
                "content": {"msgtype": "m.text", "body": "hello"},
            },
            {
                "type": "m.room.message",
                "event_id": "$evt-2",
                "sender": "@agent-test:tiresias.local",
                "room_id": "!room-1:tiresias.local",
                "content": {"msgtype": "m.text", "body": "world"},
            },
        ]
    }
    resp = client.put(
        "/transactions/txn-2",
        json=body,
        headers={"Authorization": f"Bearer {hs_token}"},
    )
    assert resp.status_code == 200
    # SoulWatch URL not configured in tests → forwarder reports the count it
    # would have forwarded but does not actually call out.
    assert resp.json() == {"processed": 2}


def test_user_query_returns_404_during_scaffolding(
    client: TestClient, hs_token: str
) -> None:
    resp = client.get(
        "/_matrix/app/v1/users/@agent-test:tiresias.local",
        headers={"Authorization": f"Bearer {hs_token}"},
    )
    assert resp.status_code == 404


def test_user_query_rejects_missing_auth(client: TestClient) -> None:
    resp = client.get("/_matrix/app/v1/users/@agent-test:tiresias.local")
    assert resp.status_code == 403


def test_room_query_returns_404_during_scaffolding(
    client: TestClient, hs_token: str
) -> None:
    resp = client.get(
        "/_matrix/app/v1/rooms/%23pantheon-ops:tiresias.local",
        headers={"Authorization": f"Bearer {hs_token}"},
    )
    assert resp.status_code == 404
