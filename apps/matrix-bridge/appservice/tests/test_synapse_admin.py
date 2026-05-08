"""Tests for SynapseAdminClient against a mock httpx transport.

We avoid talking to a real Synapse — every test wires
``httpx.MockTransport`` so requests are intercepted in-process.

License: Apache-2.0.
"""

from __future__ import annotations

import json
from typing import Callable

import httpx
import pytest

from matrix_bridge.synapse_admin import SynapseAdminClient, SynapseAdminError


def _client(handler: Callable[[httpx.Request], httpx.Response]) -> SynapseAdminClient:
    transport = httpx.MockTransport(handler)
    http = httpx.AsyncClient(
        base_url="http://synapse:8008",
        transport=transport,
        headers={"Authorization": "Bearer test-as"},
    )
    return SynapseAdminClient(
        base_url="http://synapse:8008",
        as_token="test-as",
        client=http,
    )


@pytest.mark.asyncio
async def test_whoami_returns_user_id() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        assert req.url.path == "/_matrix/client/v3/account/whoami"
        return httpx.Response(200, json={"user_id": "@tiresias-bot:tiresias.local"})

    admin = _client(handler)
    try:
        assert await admin.whoami() == "@tiresias-bot:tiresias.local"
    finally:
        await admin.aclose()


@pytest.mark.asyncio
async def test_whoami_raises_on_non_200() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"errcode": "M_UNKNOWN_TOKEN"})

    admin = _client(handler)
    try:
        with pytest.raises(SynapseAdminError) as exc:
            await admin.whoami()
        assert exc.value.status_code == 401
    finally:
        await admin.aclose()


@pytest.mark.asyncio
async def test_resolve_alias_returns_none_on_404() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"errcode": "M_NOT_FOUND"})

    admin = _client(handler)
    try:
        assert await admin.resolve_alias("#missing:tiresias.local") is None
    finally:
        await admin.aclose()


@pytest.mark.asyncio
async def test_resolve_alias_returns_room_id_on_200() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        # The alias is percent-encoded into the URL path.
        raw = req.url.raw_path.decode("ascii")
        assert "%23tiresias-console" in raw
        return httpx.Response(
            200,
            json={"room_id": "!abc:tiresias.local", "servers": ["tiresias.local"]},
        )

    admin = _client(handler)
    try:
        room = await admin.resolve_alias("#tiresias-console:tiresias.local")
        assert room == "!abc:tiresias.local"
    finally:
        await admin.aclose()


@pytest.mark.asyncio
async def test_create_room_posts_expected_payload() -> None:
    captured: dict = {}

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path != "/_matrix/client/v3/createRoom":
            return httpx.Response(404)
        captured["body"] = json.loads(req.content)
        return httpx.Response(200, json={"room_id": "!new:tiresias.local"})

    admin = _client(handler)
    try:
        rid = await admin.create_room(
            alias_localpart="tiresias-console",
            name="Tiresias Console",
            topic="primary <-> agents",
            invite=["@user-primary:tiresias.local"],
            initial_state=[
                {"type": "m.room.history_visibility", "state_key": "",
                 "content": {"history_visibility": "invited"}}
            ],
        )
        assert rid == "!new:tiresias.local"
        body = captured["body"]
        assert body["room_alias_name"] == "tiresias-console"
        assert body["preset"] == "private_chat"
        assert body["visibility"] == "private"
        assert body["invite"] == ["@user-primary:tiresias.local"]
        assert body["initial_state"][0]["type"] == "m.room.history_visibility"
    finally:
        await admin.aclose()


@pytest.mark.asyncio
async def test_create_room_raises_on_alias_conflict() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            409,
            json={"errcode": "M_ROOM_IN_USE", "error": "Alias already taken"},
        )

    admin = _client(handler)
    try:
        with pytest.raises(SynapseAdminError) as exc:
            await admin.create_room(
                alias_localpart="dup", name="x", topic="x"
            )
        assert exc.value.status_code == 409
        assert isinstance(exc.value.body, dict)
        assert exc.value.body.get("errcode") == "M_ROOM_IN_USE"
    finally:
        await admin.aclose()


@pytest.mark.asyncio
async def test_set_state_returns_event_id() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        assert req.method == "PUT"
        raw = req.url.raw_path.decode("ascii")
        assert "%21r1" in raw  # room_id encoded
        assert "m.room.power_levels" in raw
        return httpx.Response(200, json={"event_id": "$evt-123"})

    admin = _client(handler)
    try:
        evt = await admin.set_state(
            room_id="!r1:tiresias.local",
            event_type="m.room.power_levels",
            content={"users_default": 0},
        )
        assert evt == "$evt-123"
    finally:
        await admin.aclose()


@pytest.mark.asyncio
async def test_invite_user_swallows_already_in_room() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            403,
            json={
                "errcode": "M_FORBIDDEN",
                "error": "@user-primary:tiresias.local is already in the room.",
            },
        )

    admin = _client(handler)
    try:
        # Should NOT raise — already-in-room is a benign no-op.
        await admin.invite_user(
            room_id="!r1:tiresias.local",
            user_id="@user-primary:tiresias.local",
        )
    finally:
        await admin.aclose()


@pytest.mark.asyncio
async def test_invite_user_raises_on_other_403() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(
            403,
            json={"errcode": "M_FORBIDDEN", "error": "Banned from room"},
        )

    admin = _client(handler)
    try:
        with pytest.raises(SynapseAdminError) as exc:
            await admin.invite_user(
                room_id="!r1:tiresias.local",
                user_id="@evil:tiresias.local",
            )
        assert exc.value.status_code == 403
    finally:
        await admin.aclose()


@pytest.mark.asyncio
async def test_invite_user_succeeds_on_200() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={})

    admin = _client(handler)
    try:
        await admin.invite_user(
            room_id="!r1:tiresias.local",
            user_id="@user-primary:tiresias.local",
        )
    finally:
        await admin.aclose()
