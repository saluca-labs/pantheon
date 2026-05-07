"""Enhanced outbound Slack operations with PicoClaw-level features."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)

SLACK_API_BASE = "https://slack.com/api"


class SlackOutbound:
    """Handles all outbound Slack operations with PicoClaw-level features.

    Includes persona posting, typing indicators, message editing (placeholder
    pattern), file uploads, and reaction management.  Rate-limited to 1 msg/s
    via an asyncio semaphore.
    """

    def __init__(self, bot_token: str, rate_limit: float = 1.0) -> None:
        self._bot_token = bot_token
        self._rate_limit = rate_limit
        self._send_semaphore = asyncio.Semaphore(1)
        self._last_send: float = 0.0
        self._client: httpx.AsyncClient | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=SLACK_API_BASE,
                headers={"Authorization": f"Bearer {self._bot_token}"},
                timeout=15.0,
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _rate_wait(self) -> None:
        """Enforce minimum interval between outbound messages."""
        now = time.monotonic()
        elapsed = now - self._last_send
        if elapsed < self._rate_limit:
            await asyncio.sleep(self._rate_limit - elapsed)
        self._last_send = time.monotonic()

    async def _api_call(
        self,
        method: str,
        *,
        json_body: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        files: dict[str, Any] | None = None,
        rate_limited: bool = True,
    ) -> dict[str, Any]:
        """Make an authenticated Slack API call."""
        client = await self._ensure_client()

        if rate_limited:
            async with self._send_semaphore:
                await self._rate_wait()
                return await self._do_request(client, method, json_body=json_body, data=data, files=files)
        else:
            return await self._do_request(client, method, json_body=json_body, data=data, files=files)

    async def _do_request(
        self,
        client: httpx.AsyncClient,
        method: str,
        *,
        json_body: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        files: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f"/{method}"
        try:
            if files:
                resp = await client.post(url, data=data or {}, files=files)
            elif json_body is not None:
                resp = await client.post(
                    url,
                    json=json_body,
                    headers={"Content-Type": "application/json; charset=utf-8"},
                )
            else:
                resp = await client.post(url, data=data or {})

            resp.raise_for_status()
            result = resp.json()

            if not result.get("ok"):
                logger.warning(
                    "slack_api_error",
                    method=method,
                    error=result.get("error", "unknown"),
                )

            return result

        except httpx.HTTPStatusError as exc:
            logger.error("slack_http_error", method=method, status=exc.response.status_code)
            raise
        except Exception as exc:
            logger.error("slack_request_error", method=method, error=str(exc))
            raise

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def send_message(
        self,
        channel: str,
        text: str,
        *,
        thread_ts: str | None = None,
        username: str | None = None,
        icon_emoji: str | None = None,
    ) -> dict[str, Any]:
        """Post a message with optional persona (username + emoji).

        The persona fields require ``chat:write.customize`` scope on the bot token.
        """
        body: dict[str, Any] = {"channel": channel, "text": text}
        if thread_ts:
            body["thread_ts"] = thread_ts
        if username:
            body["username"] = username
        if icon_emoji:
            body["icon_emoji"] = icon_emoji

        result = await self._api_call("chat.postMessage", json_body=body)
        logger.debug(
            "message_sent",
            channel=channel,
            ts=result.get("ts"),
            persona=username,
        )
        return result

    async def send_typing(self, channel: str) -> None:
        """Show typing indicator in a channel.

        This uses the undocumented ``chat.meMessage`` approach combined
        with a short-lived placeholder.  Slack does not expose a first-class
        typing API for bots, so this is best-effort.
        """
        # Slack has no official bot typing endpoint. We log intent for
        # observability but skip the actual call to avoid API errors.
        logger.debug("typing_indicator_requested", channel=channel)

    async def edit_message(
        self,
        channel: str,
        ts: str,
        text: str,
    ) -> dict[str, Any]:
        """Edit an existing message (useful for the placeholder pattern)."""
        body: dict[str, Any] = {"channel": channel, "ts": ts, "text": text}
        result = await self._api_call("chat.update", json_body=body)
        logger.debug("message_edited", channel=channel, ts=ts)
        return result

    async def upload_file(
        self,
        channel: str,
        content: str | bytes,
        filename: str,
        *,
        title: str | None = None,
        thread_ts: str | None = None,
    ) -> dict[str, Any]:
        """Upload a file to a channel using files.uploadV2."""
        if isinstance(content, str):
            content = content.encode("utf-8")

        # Step 1: get upload URL
        length = len(content)
        url_result = await self._api_call(
            "files.getUploadURLExternal",
            json_body={"filename": filename, "length": length},
            rate_limited=False,
        )

        if not url_result.get("ok"):
            return url_result

        upload_url = url_result["upload_url"]
        file_id = url_result["file_id"]

        # Step 2: upload content to the presigned URL
        client = await self._ensure_client()
        await client.post(upload_url, content=content)

        # Step 3: complete the upload
        channel_str = channel
        if thread_ts:
            channel_str = f"{channel}:{thread_ts}"

        complete_body: dict[str, Any] = {
            "files": [{"id": file_id, "title": title or filename}],
            "channel_id": channel,
        }
        if thread_ts:
            complete_body["thread_ts"] = thread_ts

        result = await self._api_call(
            "files.completeUploadExternal",
            json_body=complete_body,
            rate_limited=False,
        )
        logger.debug("file_uploaded", channel=channel, filename=filename)
        return result

    async def add_reaction(
        self,
        channel: str,
        ts: str,
        emoji: str,
    ) -> dict[str, Any]:
        """Add an emoji reaction to a message."""
        return await self._api_call(
            "reactions.add",
            json_body={"channel": channel, "timestamp": ts, "name": emoji},
            rate_limited=False,
        )

    async def remove_reaction(
        self,
        channel: str,
        ts: str,
        emoji: str,
    ) -> dict[str, Any]:
        """Remove an emoji reaction from a message."""
        return await self._api_call(
            "reactions.remove",
            json_body={"channel": channel, "timestamp": ts, "name": emoji},
            rate_limited=False,
        )
