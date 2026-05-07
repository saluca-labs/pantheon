"""
MiroShark -> Tiresias App Proxy bridge.

Drop-in replacement for MiroShark's direct action executor.
Each simulated agent action becomes a /v1/tools/call request,
which the App Proxy evaluates against Cedar policies, scores for
risk, optionally queues for approval, and logs to the audit trail
before executing.

Usage:
    from integrations.miroshark.client import TiresiasActionClient

    client = TiresiasActionClient(
        app_proxy_url="http://app-proxy.saluca.local:8400",
        api_key="sk-..."
    )
    result = await client.post_message("analyst-a", "#threat-intel", "New IOC found")
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger("miroshark.app_proxy_client")


class TiresiasActionClient:
    """Routes MiroShark agent actions through Tiresias App Proxy.

    Drop-in replacement for MiroShark's direct action executor.
    Each simulated agent action becomes a /v1/tools/call request.
    """

    def __init__(self, app_proxy_url: str, api_key: str | None = None):
        self._url = app_proxy_url.rstrip("/")
        self._api_key = api_key
        self._client = httpx.AsyncClient(timeout=15.0)

    # ------------------------------------------------------------------
    # High-level action methods
    # ------------------------------------------------------------------

    async def post_message(
        self,
        agent_id: str,
        channel: str,
        text: str,
        thread_ts: str | None = None,
    ) -> dict[str, Any]:
        """Route a simulated agent's post through the App Proxy."""
        return await self._call_tool(
            agent_id=agent_id,
            tool_name="slack_send_rich_message",
            arguments={
                "channel": channel,
                "text": text,
                "thread_ts": thread_ts,
                "username": agent_id,
            },
        )

    async def add_reaction(
        self,
        agent_id: str,
        channel: str,
        timestamp: str,
        emoji: str,
    ) -> dict[str, Any]:
        """Route a simulated agent's reaction through the App Proxy."""
        return await self._call_tool(
            agent_id=agent_id,
            tool_name="slack_add_reaction",
            arguments={
                "channel": channel,
                "timestamp": timestamp,
                "emoji": emoji,
            },
        )

    async def read_messages(
        self,
        agent_id: str,
        channel: str,
        limit: int = 10,
    ) -> dict[str, Any]:
        """Read channel messages on behalf of a simulated agent."""
        return await self._call_tool(
            agent_id=agent_id,
            tool_name="slack_read_messages",
            arguments={"channel": channel, "limit": limit},
        )

    # ------------------------------------------------------------------
    # Generic tool call
    # ------------------------------------------------------------------

    async def _call_tool(
        self,
        agent_id: str,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> dict[str, Any]:
        """Send a tool-call request to the App Proxy.

        The proxy evaluates Cedar policy, computes a risk score,
        optionally queues for human approval, logs to the audit
        trail, and then executes the underlying MCP tool.
        """
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        payload = {
            "tool_name": tool_name,
            "arguments": {k: v for k, v in arguments.items() if v is not None},
            "agent_id": agent_id,
            "tenant_id": "saluca",
        }

        try:
            resp = await self._client.post(
                f"{self._url}/v1/tools/call",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json()

        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            body = exc.response.text[:300]
            logger.warning(
                "App Proxy returned %d for agent=%s tool=%s: %s",
                status, agent_id, tool_name, body,
            )
            return {"status": "error", "http_status": status, "detail": body}

        except httpx.ConnectError as exc:
            logger.error("Cannot reach App Proxy at %s: %s", self._url, exc)
            return {"status": "connection_error", "error": str(exc)}

        except httpx.TimeoutException as exc:
            logger.error("Timeout calling App Proxy: %s", exc)
            return {"status": "timeout", "error": str(exc)}

        except Exception as exc:
            logger.error("Unexpected error calling App Proxy: %s", exc)
            return {"status": "error", "error": str(exc)}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def close(self) -> None:
        """Shut down the underlying HTTP client."""
        await self._client.aclose()

    async def __aenter__(self) -> TiresiasActionClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.close()
