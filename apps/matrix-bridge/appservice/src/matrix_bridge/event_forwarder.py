"""Forwards Matrix events to the SoulWatch ingest pipeline.

PR D wired this up against ``platform-api`` ``/ingest/matrix``. PR G hardens
it: the forwarder now keeps a single long-lived ``httpx.AsyncClient`` so
each appservice transaction reuses an open connection instead of doing
three-way handshakes per request. The client is constructed lazily on the
first call so unit tests that exercise ``forward()`` against a mock
transport keep working without any extra plumbing.

When ``soulwatch_url`` is unset (e.g. during PR A scaffolding or in tests)
the forwarder no-ops and returns the count it would have forwarded —
callers rely on that for the appservice ``processed`` response.

License: Apache-2.0.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable

import httpx

log = logging.getLogger("matrix_bridge.event_forwarder")


class EventForwarder:
    """Async forwarder for Matrix appservice transactions.

    The forwarder is intentionally tolerant — a SoulWatch outage must not
    break Synapse's appservice protocol. Failures are logged; the
    transaction handler still returns 200 so Synapse does not retry
    indefinitely.

    The owning ``AsyncClient`` is created on first use and then reused for
    the life of the process. ``aclose()`` releases it cleanly during
    application shutdown; calling ``forward()`` again after ``aclose()``
    transparently re-creates the client.
    """

    def __init__(
        self,
        soulwatch_url: str | None,
        timeout_seconds: float = 5.0,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._url = soulwatch_url
        self._timeout = timeout_seconds
        # ``client`` is exposed for tests that want to inject a mock
        # transport; production code leaves this None so the forwarder
        # owns the lifecycle of the underlying client.
        self._client: httpx.AsyncClient | None = client
        self._owns_client = client is None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._timeout)
            self._owns_client = True
        return self._client

    async def forward(self, *, txn_id: str, events: Iterable[dict[str, Any]]) -> int:
        """Forward each event and return the number forwarded."""
        events_list = list(events)
        if not self._url:
            log.debug(
                "SoulWatch URL not configured; dropping %d events", len(events_list)
            )
            return len(events_list)

        client = self._get_client()
        forwarded = 0
        for event in events_list:
            payload = {
                "source": "matrix_appservice",
                "txn_id": txn_id,
                "event": event,
            }
            try:
                resp = await client.post(self._url, json=payload)
                resp.raise_for_status()
                forwarded += 1
            except httpx.HTTPError as exc:
                log.warning(
                    "soulwatch forward failed: txn=%s event_id=%s err=%s",
                    txn_id,
                    event.get("event_id"),
                    exc,
                )
        return forwarded

    async def aclose(self) -> None:
        """Release the underlying client. Idempotent."""
        if self._client is not None and self._owns_client:
            await self._client.aclose()
        self._client = None
