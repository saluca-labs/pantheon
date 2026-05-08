"""Forwards Matrix events to the SoulWatch ingest pipeline.

PR A status: stub. The forwarder accepts events and returns the count it would
have forwarded. When ``soulwatch_url`` is configured (PR D) it will POST each
event individually so SoulWatch can apply detection rules per event.

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
    break Synapse's appservice protocol. Failures are logged; the transaction
    handler still returns 200 so Synapse does not retry indefinitely.
    """

    def __init__(self, soulwatch_url: str | None, timeout_seconds: float = 5.0) -> None:
        self._url = soulwatch_url
        self._timeout = timeout_seconds

    async def forward(self, *, txn_id: str, events: Iterable[dict[str, Any]]) -> int:
        """Forward each event and return the number forwarded."""
        events_list = list(events)
        if not self._url:
            log.debug("SoulWatch URL not configured; dropping %d events", len(events_list))
            return len(events_list)

        async with httpx.AsyncClient(timeout=self._timeout) as client:
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
