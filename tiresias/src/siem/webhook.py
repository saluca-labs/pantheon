"""
WebhookRelay — sends detection events as JSON payloads to HTTP endpoints.

Retry policy: 3 attempts with exponential backoff (1s, 2s, 4s).
Delivery outcome (success/failure) is logged via structlog.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import httpx
import structlog

logger = structlog.get_logger(__name__)


@dataclass
class DeliveryRecord:
    """Tracks a single webhook delivery attempt."""
    event_id: str
    url: str
    attempts: int = 0
    success: bool = False
    last_status_code: Optional[int] = None
    last_error: Optional[str] = None
    delivered_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "event_id": self.event_id,
            "url": self.url,
            "attempts": self.attempts,
            "success": self.success,
            "last_status_code": self.last_status_code,
            "last_error": self.last_error,
            "delivered_at": self.delivered_at,
        }


class WebhookRelay:
    """
    Sends JSON event payloads to a configured HTTP endpoint.

    Args:
        url: Webhook POST URL.
        headers: Extra HTTP headers (e.g. Authorization token).
        max_retries: Number of retry attempts after the first failure (default 3 = 4 total tries).
        base_delay: Base delay in seconds for exponential backoff.
        timeout: Per-request timeout in seconds.
        verify_ssl: Whether to verify TLS certificates.
    """

    def __init__(
        self,
        url: str,
        headers: Optional[dict[str, str]] = None,
        max_retries: int = 3,
        base_delay: float = 1.0,
        timeout: float = 10.0,
        verify_ssl: bool = True,
    ) -> None:
        self.url = url
        self.headers = headers or {}
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.timeout = timeout
        self.verify_ssl = verify_ssl

    async def send(self, payload: dict) -> DeliveryRecord:
        """
        POST payload as JSON to self.url with retry.

        Retry on: connection errors, timeouts, non-2xx responses.
        Does NOT retry on 4xx (client errors indicating bad payload/auth).

        Returns a DeliveryRecord with outcome details.
        """
        event_id = payload.get("event_id", "unknown")
        record = DeliveryRecord(event_id=event_id, url=self.url)

        for attempt in range(self.max_retries + 1):
            record.attempts += 1
            delay = self.base_delay * (2 ** attempt)

            try:
                async with httpx.AsyncClient(
                    timeout=self.timeout,
                    verify=self.verify_ssl,
                ) as client:
                    response = await client.post(
                        self.url,
                        json=payload,
                        headers={
                            "Content-Type": "application/json",
                            "User-Agent": "Tiresias-SIEM/1.0",
                            **self.headers,
                        },
                    )
                    record.last_status_code = response.status_code

                    if 200 <= response.status_code < 300:
                        record.success = True
                        record.delivered_at = datetime.now(timezone.utc).isoformat()
                        logger.info(
                            "webhook.delivered",
                            url=self.url,
                            event_id=event_id,
                            status=response.status_code,
                            attempt=attempt + 1,
                        )
                        return record

                    # 4xx = client error, no retry
                    if 400 <= response.status_code < 500:
                        record.last_error = f"HTTP {response.status_code} -- client error, no retry"
                        logger.warning(
                            "webhook.client_error",
                            url=self.url,
                            event_id=event_id,
                            status=response.status_code,
                        )
                        return record

                    # 5xx -- will retry
                    record.last_error = f"HTTP {response.status_code}"
                    logger.warning(
                        "webhook.server_error",
                        url=self.url,
                        event_id=event_id,
                        status=response.status_code,
                        attempt=attempt + 1,
                        will_retry=attempt < self.max_retries,
                    )

            except httpx.TimeoutException as exc:
                record.last_error = f"Timeout: {exc}"
                logger.warning(
                    "webhook.timeout",
                    url=self.url,
                    event_id=event_id,
                    attempt=attempt + 1,
                    will_retry=attempt < self.max_retries,
                )
            except httpx.RequestError as exc:
                record.last_error = f"Connection error: {exc}"
                logger.warning(
                    "webhook.connection_error",
                    url=self.url,
                    event_id=event_id,
                    attempt=attempt + 1,
                    error=str(exc),
                    will_retry=attempt < self.max_retries,
                )
            except Exception as exc:
                record.last_error = f"Unexpected: {exc}"
                logger.error(
                    "webhook.unexpected_error",
                    url=self.url,
                    event_id=event_id,
                    error=str(exc),
                )
                return record

            # Wait before next retry (skip after last attempt)
            if attempt < self.max_retries:
                await asyncio.sleep(delay)

        logger.error(
            "webhook.exhausted_retries",
            url=self.url,
            event_id=event_id,
            attempts=record.attempts,
            last_error=record.last_error,
        )
        return record

    async def health_check(self) -> bool:
        """
        Send a HEAD request to verify the endpoint is reachable.
        Returns True if response is any HTTP code (even 405 Method Not Allowed
        counts as reachable -- the server responded).
        """
        try:
            async with httpx.AsyncClient(timeout=5.0, verify=self.verify_ssl) as client:
                response = await client.head(self.url, headers=self.headers)
                # Any HTTP response means we connected successfully
                return True
        except Exception as exc:
            logger.warning("webhook.health_check_failed", url=self.url, error=str(exc))
            return False
