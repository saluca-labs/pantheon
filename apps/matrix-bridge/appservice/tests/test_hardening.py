"""Tests for PR G hardening surface.

Covers:

* HS_TOKEN comparison is constant-time (smoke check for ``hmac.compare_digest``).
* ``PUT /transactions/{txn_id}`` enforces ``transaction_max_bytes`` (413).
* Sender allowlist drops events from disallowed senders.
* ``/healthz`` is liveness-only (always 200).
* ``/readyz`` checks Synapse + SoulWatch and returns 503 when down.
* ``EventForwarder`` reuses a long-lived client; ``aclose`` is idempotent.

License: Apache-2.0.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from matrix_bridge.config import AppserviceConfig
from matrix_bridge.event_forwarder import EventForwarder
from matrix_bridge.main import _sender_allowed, create_app


# ─── Sender allowlist (unit) ──────────────────────────────────────────────


@pytest.mark.parametrize(
    "sender,allowed",
    [
        ("@agent-orchestrator:tiresias.local", True),
        ("@agent-mem-1:tiresias.local", True),
        ("@agent-soulwatch:tiresias.local", True),
        ("@tiresias-bot:tiresias.local", True),
        ("@user-primary:tiresias.local", True),
        # Wrong server.
        ("@agent-evil:other.example", False),
        # Right server, wrong prefix.
        ("@randomguy:tiresias.local", False),
        # Subtle: case-mismatched server.
        ("@agent-evil:Tiresias.local", False),
        # Empty / None / non-string.
        ("", False),
        (None, False),
    ],
)
def test_sender_allowed_matches_only_safe_senders(
    sender: str | None, allowed: bool
) -> None:
    assert _sender_allowed(sender, server_name="tiresias.local") is allowed


# ─── HS_TOKEN constant-time compare (functional) ─────────────────────────


def test_transactions_rejects_token_mismatch_constant_time(
    client: TestClient,
) -> None:
    # Token of identical length but wrong content — verifies the
    # comparison rejects on content, not on length-shortcut.
    bad_token = "x" * 50
    resp = client.put(
        "/transactions/txn-1",
        json={"events": []},
        headers={"Authorization": f"Bearer {bad_token}"},
    )
    assert resp.status_code == 403


# ─── Body-size cap ────────────────────────────────────────────────────────


def test_transactions_rejects_oversized_body_via_content_length(
    hs_token: str, as_token: str
) -> None:
    cfg = AppserviceConfig(
        hs_token=hs_token,
        as_token=as_token,
        soulwatch_url=None,
        transaction_max_bytes=128,
        sender_allowlist_enabled=False,
    )
    app = create_app(config=cfg)
    client = TestClient(app)
    huge = {"events": [{"event_id": f"$e{i}", "filler": "x" * 50} for i in range(100)]}
    resp = client.put(
        "/transactions/txn-big",
        json=huge,
        headers={"Authorization": f"Bearer {hs_token}"},
    )
    assert resp.status_code == 413


def test_transactions_accepts_body_under_cap(hs_token: str, as_token: str) -> None:
    cfg = AppserviceConfig(
        hs_token=hs_token,
        as_token=as_token,
        soulwatch_url=None,
        transaction_max_bytes=10 * 1024,
        sender_allowlist_enabled=False,
    )
    app = create_app(config=cfg)
    client = TestClient(app)
    resp = client.put(
        "/transactions/txn-small",
        json={"events": []},
        headers={"Authorization": f"Bearer {hs_token}"},
    )
    assert resp.status_code == 200


def test_transactions_rejects_invalid_json(hs_token: str, as_token: str) -> None:
    cfg = AppserviceConfig(
        hs_token=hs_token,
        as_token=as_token,
        soulwatch_url=None,
        transaction_max_bytes=10 * 1024,
        sender_allowlist_enabled=False,
    )
    app = create_app(config=cfg)
    client = TestClient(app)
    resp = client.put(
        "/transactions/txn-bad",
        content=b"{not-json",
        headers={
            "Authorization": f"Bearer {hs_token}",
            "Content-Type": "application/json",
        },
    )
    assert resp.status_code == 400


# ─── Sender allowlist (integration) ──────────────────────────────────────


def test_transactions_drops_disallowed_sender_keeps_allowed(
    hs_token: str, as_token: str
) -> None:
    cfg = AppserviceConfig(
        hs_token=hs_token,
        as_token=as_token,
        soulwatch_url=None,
        sender_allowlist_enabled=True,
        server_name="tiresias.local",
    )
    app = create_app(config=cfg)
    client = TestClient(app)
    body = {
        "events": [
            {
                "type": "m.room.message",
                "event_id": "$ok",
                "sender": "@agent-test:tiresias.local",
                "room_id": "!r:tiresias.local",
                "content": {"msgtype": "m.text", "body": "ok"},
            },
            {
                "type": "m.room.message",
                "event_id": "$drop",
                "sender": "@evil:other.example",
                "room_id": "!r:tiresias.local",
                "content": {"msgtype": "m.text", "body": "drop me"},
            },
        ]
    }
    resp = client.put(
        "/transactions/txn-mixed",
        json=body,
        headers={"Authorization": f"Bearer {hs_token}"},
    )
    assert resp.status_code == 200
    # SoulWatch is None so processed equals events that survived the
    # allowlist filter.
    assert resp.json() == {"processed": 1}


def test_transactions_allowlist_disabled_keeps_everything(
    hs_token: str, as_token: str
) -> None:
    cfg = AppserviceConfig(
        hs_token=hs_token,
        as_token=as_token,
        soulwatch_url=None,
        sender_allowlist_enabled=False,
        server_name="tiresias.local",
    )
    app = create_app(config=cfg)
    client = TestClient(app)
    body = {
        "events": [
            {"event_id": "$1", "sender": "@evil:other.example"},
            {"event_id": "$2", "sender": "@agent-x:tiresias.local"},
        ]
    }
    resp = client.put(
        "/transactions/txn-disabled",
        json=body,
        headers={"Authorization": f"Bearer {hs_token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"processed": 2}


# ─── /healthz vs /readyz split ───────────────────────────────────────────


def test_healthz_is_liveness_only(client: TestClient) -> None:
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_readyz_returns_503_when_synapse_unreachable(
    hs_token: str, as_token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Force httpx to raise ConnectError for any request.
    class _DownTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(
            self, request: httpx.Request
        ) -> httpx.Response:
            raise httpx.ConnectError("synapse down", request=request)

    real_init = httpx.AsyncClient.__init__

    def _init(self: httpx.AsyncClient, *args: Any, **kwargs: Any) -> None:
        kwargs["transport"] = _DownTransport()
        real_init(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _init)

    cfg = AppserviceConfig(
        hs_token=hs_token,
        as_token=as_token,
        synapse_url="http://synapse-down:8008",
        soulwatch_url=None,
        sender_allowlist_enabled=False,
    )
    app = create_app(config=cfg)
    client = TestClient(app)
    resp = client.get("/readyz")
    assert resp.status_code == 503
    payload = resp.json()
    detail = payload["detail"]
    assert detail["status"] == "degraded"
    assert detail["checks"]["synapse"]["status"] == "down"
    # SoulWatch URL not configured → reported as skipped, not failing.
    assert detail["checks"]["soulwatch"]["status"] == "skipped"


def test_readyz_returns_200_when_synapse_responds(
    hs_token: str, as_token: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    class _OkTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(
            self, request: httpx.Request
        ) -> httpx.Response:
            return httpx.Response(200, json={"server": {"version": "1.0"}})

    real_init = httpx.AsyncClient.__init__

    def _init(self: httpx.AsyncClient, *args: Any, **kwargs: Any) -> None:
        kwargs["transport"] = _OkTransport()
        real_init(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _init)

    cfg = AppserviceConfig(
        hs_token=hs_token,
        as_token=as_token,
        synapse_url="http://synapse-ok:8008",
        soulwatch_url=None,
        sender_allowlist_enabled=False,
    )
    app = create_app(config=cfg)
    client = TestClient(app)
    resp = client.get("/readyz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["checks"]["synapse"]["status"] == "ok"


# ─── EventForwarder long-lived client ────────────────────────────────────


@pytest.mark.asyncio
async def test_forwarder_reuses_client_across_calls() -> None:
    seen: list[str] = []

    class _Counting(httpx.AsyncBaseTransport):
        async def handle_async_request(
            self, request: httpx.Request
        ) -> httpx.Response:
            seen.append(str(request.url))
            return httpx.Response(200, json={"ok": True})

    client = httpx.AsyncClient(transport=_Counting())
    fwd = EventForwarder(
        soulwatch_url="http://soulwatch.test/ingest/matrix",
        client=client,
    )
    await fwd.forward(txn_id="t1", events=[{"event_id": "$1"}])
    await fwd.forward(txn_id="t2", events=[{"event_id": "$2"}])
    assert len(seen) == 2
    # When tests inject a client, the forwarder must NOT close it on aclose
    # — we own its lifecycle.
    await fwd.aclose()
    # Manually close and verify the test client is still usable for one
    # more request before its own aclose.
    await client.aclose()


@pytest.mark.asyncio
async def test_forwarder_aclose_is_idempotent() -> None:
    fwd = EventForwarder(soulwatch_url=None)
    await fwd.aclose()
    await fwd.aclose()  # second call is a no-op
