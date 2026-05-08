"""Thin async client for Synapse admin + client/v3 APIs.

The bridge talks to Synapse with the appservice ``AS_TOKEN`` (acting as
``@tiresias-bot:{server_name}`` per the appservice registration). All
requests target the **internal** Compose URL — the client never touches
the public web.

Surface implemented today:

* :py:meth:`create_room`            — POST /_matrix/client/v3/createRoom
* :py:meth:`resolve_alias`          — GET  /_matrix/client/v3/directory/room/{alias}
* :py:meth:`set_state`              — PUT  /_matrix/client/v3/rooms/{room_id}/state/{event_type}
* :py:meth:`set_power_levels`       — sugar over :py:meth:`set_state` for ``m.room.power_levels``
* :py:meth:`invite_user`            — POST /_matrix/client/v3/rooms/{room_id}/invite
* :py:meth:`whoami`                 — GET  /_matrix/client/v3/account/whoami (readiness probe)

Only the operations the seed-room bootstrap needs are exposed. Future
work (per-tenant onboarding, deactivation flows) can extend this class
without touching call sites.

License: Apache-2.0.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

log = logging.getLogger("matrix_bridge.synapse_admin")


class SynapseAdminError(RuntimeError):
    """Raised when a Synapse admin / client API call fails non-recoverably."""

    def __init__(self, message: str, *, status_code: int | None = None, body: Any = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class SynapseAdminClient:
    """Async wrapper around the Synapse admin + client/v3 REST API.

    Intended to be constructed once at application startup and reused —
    the underlying ``httpx.AsyncClient`` keeps its connection pool warm.
    """

    def __init__(
        self,
        *,
        base_url: str,
        as_token: str,
        timeout_seconds: float = 10.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._as_token = as_token
        self._timeout = timeout_seconds
        # Allow tests to inject a mock transport via the client kwarg.
        self._client = client or httpx.AsyncClient(
            base_url=self._base_url,
            timeout=timeout_seconds,
            headers={"Authorization": f"Bearer {as_token}"},
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    # ── client/v3 ────────────────────────────────────────────────────────────

    async def whoami(self) -> str:
        """Return the Matrix ID the appservice is authenticated as.

        Used by ``/readyz`` to confirm the AS_TOKEN is still valid
        without requiring a write.
        """
        resp = await self._client.get("/_matrix/client/v3/account/whoami")
        if resp.status_code != 200:
            raise SynapseAdminError(
                "whoami failed", status_code=resp.status_code, body=_safe_body(resp)
            )
        data = resp.json()
        user_id = data.get("user_id")
        if not isinstance(user_id, str):
            raise SynapseAdminError("whoami response missing user_id", body=data)
        return user_id

    async def resolve_alias(self, alias: str) -> str | None:
        """Resolve a room alias (``#foo:server``) to its room id.

        Returns ``None`` when the alias is not registered. Other failures
        raise :class:`SynapseAdminError` so callers can decide whether to
        retry or abort the bootstrap.
        """
        # Matrix requires the alias to be URL-encoded as a path segment;
        # httpx handles that for us when we pass the raw alias via params.
        resp = await self._client.get(
            f"/_matrix/client/v3/directory/room/{_quote(alias)}"
        )
        if resp.status_code == 404:
            return None
        if resp.status_code != 200:
            raise SynapseAdminError(
                f"alias resolution failed: {alias}",
                status_code=resp.status_code,
                body=_safe_body(resp),
            )
        data = resp.json()
        room_id = data.get("room_id")
        if not isinstance(room_id, str):
            raise SynapseAdminError(
                f"alias response missing room_id: {alias}", body=data
            )
        return room_id

    async def create_room(
        self,
        *,
        alias_localpart: str,
        name: str,
        topic: str,
        preset: str = "private_chat",
        visibility: str = "private",
        invite: list[str] | None = None,
        initial_state: list[dict[str, Any]] | None = None,
    ) -> str:
        """Create a Matrix room and return its room id.

        Caller is responsible for passing only the **localpart** of the
        alias — Synapse derives the full alias from the request server
        name. Pass ``initial_state`` to seed power levels, history
        visibility, and join rules atomically with room creation.
        """
        body: dict[str, Any] = {
            "room_alias_name": alias_localpart,
            "name": name,
            "topic": topic,
            "preset": preset,
            "visibility": visibility,
        }
        if invite:
            body["invite"] = invite
        if initial_state:
            body["initial_state"] = initial_state

        resp = await self._client.post("/_matrix/client/v3/createRoom", json=body)
        if resp.status_code != 200:
            raise SynapseAdminError(
                f"createRoom failed for #{alias_localpart}",
                status_code=resp.status_code,
                body=_safe_body(resp),
            )
        data = resp.json()
        room_id = data.get("room_id")
        if not isinstance(room_id, str):
            raise SynapseAdminError(
                f"createRoom response missing room_id for #{alias_localpart}",
                body=data,
            )
        return room_id

    async def set_state(
        self,
        *,
        room_id: str,
        event_type: str,
        content: dict[str, Any],
        state_key: str = "",
    ) -> str:
        """PUT a state event into a room. Returns the resulting event_id."""
        path = (
            f"/_matrix/client/v3/rooms/{_quote(room_id)}/state/{_quote(event_type)}"
        )
        if state_key:
            path = f"{path}/{_quote(state_key)}"
        resp = await self._client.put(path, json=content)
        if resp.status_code != 200:
            raise SynapseAdminError(
                f"set_state {event_type} failed for {room_id}",
                status_code=resp.status_code,
                body=_safe_body(resp),
            )
        data = resp.json()
        event_id = data.get("event_id")
        if not isinstance(event_id, str):
            raise SynapseAdminError(
                f"set_state response missing event_id for {room_id}",
                body=data,
            )
        return event_id

    async def set_power_levels(
        self, *, room_id: str, content: dict[str, Any]
    ) -> str:
        """Convenience wrapper around set_state for m.room.power_levels."""
        return await self.set_state(
            room_id=room_id,
            event_type="m.room.power_levels",
            content=content,
        )

    async def invite_user(self, *, room_id: str, user_id: str) -> None:
        """Invite ``user_id`` into ``room_id``.

        Already-joined or already-invited users return 403 with errcode
        ``M_FORBIDDEN``; we treat that as a no-op so the bootstrap is
        idempotent. Network / 5xx errors still raise.
        """
        resp = await self._client.post(
            f"/_matrix/client/v3/rooms/{_quote(room_id)}/invite",
            json={"user_id": user_id},
        )
        if resp.status_code == 200:
            return
        # Treat "already in room" as success — Synapse returns 403
        # M_FORBIDDEN with a distinct error message for this case.
        if resp.status_code == 403:
            body = _safe_body(resp)
            errcode = body.get("errcode") if isinstance(body, dict) else None
            error_msg = (
                body.get("error", "") if isinstance(body, dict) else ""
            )
            already_member = (
                "already in the room" in error_msg.lower()
                or "is already" in error_msg.lower()
            )
            if errcode == "M_FORBIDDEN" and already_member:
                log.debug(
                    "invite no-op (already in room): user=%s room=%s",
                    user_id,
                    room_id,
                )
                return
        raise SynapseAdminError(
            f"invite failed: user={user_id} room={room_id}",
            status_code=resp.status_code,
            body=_safe_body(resp),
        )


def _safe_body(resp: httpx.Response) -> Any:
    """Best-effort JSON decode for error reporting; falls back to text."""
    try:
        return resp.json()
    except (ValueError, TypeError):
        try:
            return resp.text
        except Exception:  # pragma: no cover — extremely defensive
            return None


def _quote(value: str) -> str:
    """Percent-encode a path segment for Matrix REST URLs."""
    from urllib.parse import quote

    return quote(value, safe="")
