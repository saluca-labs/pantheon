"""Tests for the SoulWatch event forwarder.

License: Apache-2.0.
"""

from __future__ import annotations

import httpx
import pytest

from matrix_bridge.event_forwarder import EventForwarder


@pytest.mark.asyncio
async def test_forwarder_no_url_drops_silently() -> None:
    fwd = EventForwarder(soulwatch_url=None)
    count = await fwd.forward(
        txn_id="t1",
        events=[{"event_id": "$1"}, {"event_id": "$2"}],
    )
    # Returns the number of events it would have forwarded (callers rely on
    # this for the appservice "processed" response).
    assert count == 2


@pytest.mark.asyncio
async def test_forwarder_posts_each_event_to_soulwatch(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[dict] = []

    class _MockTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            seen.append(
                {
                    "url": str(request.url),
                    "json": request.content.decode(),
                }
            )
            return httpx.Response(200, json={"ok": True})

    # Patch httpx.AsyncClient to use the mock transport.
    real_init = httpx.AsyncClient.__init__

    def _init(self: httpx.AsyncClient, *args, **kwargs) -> None:
        kwargs["transport"] = _MockTransport()
        real_init(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _init)

    fwd = EventForwarder(soulwatch_url="http://soulwatch.test/ingest/matrix")
    count = await fwd.forward(
        txn_id="txn-7",
        events=[{"event_id": "$1"}, {"event_id": "$2"}],
    )
    assert count == 2
    assert len(seen) == 2
    assert all(call["url"] == "http://soulwatch.test/ingest/matrix" for call in seen)
    assert "$1" in seen[0]["json"]
    assert "$2" in seen[1]["json"]


@pytest.mark.asyncio
async def test_forwarder_tolerates_soulwatch_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    """A SoulWatch outage must not break the appservice protocol."""

    class _Failing(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            return httpx.Response(503, json={"error": "down"})

    real_init = httpx.AsyncClient.__init__

    def _init(self: httpx.AsyncClient, *args, **kwargs) -> None:
        kwargs["transport"] = _Failing()
        real_init(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _init)

    fwd = EventForwarder(soulwatch_url="http://soulwatch.test/ingest/matrix")
    count = await fwd.forward(
        txn_id="txn-9", events=[{"event_id": "$1"}]
    )
    # Forwarding failed, so the count is 0 — but no exception bubbled up.
    assert count == 0
