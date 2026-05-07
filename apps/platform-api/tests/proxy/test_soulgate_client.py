"""
Unit tests for tiresias.proxy.soulgate_client (Tier 2b).

Covers: allow, deny, timeout fail-open, upstream 5xx fail-open,
connect-error fail-open, messages-digest privacy, cache-hit, cache-bypass-on-deny.
"""

from __future__ import annotations

import hashlib
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from tiresias.proxy import soulgate_client as sg
from tiresias.proxy.soulgate_client import (
    SoulgateDecision,
    compute_messages_digest,
    evaluate_llm_request,
)


def _settings(fail_mode: str = "open"):
    return SimpleNamespace(
        soulgate_url="http://soulgate.tiresias.svc.cluster.local:80",
        soulgate_internal_key="test-key",
        soulgate_timeout_ms=500,
        soulgate_fail_mode=fail_mode,
    )


def _mk_response(status: int, payload: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status_code=status,
        content=json.dumps(payload or {}).encode(),
        headers={"content-type": "application/json"},
    )


@pytest.fixture(autouse=True)
def _reset_state():
    sg._reset_circuit_for_tests()
    sg._reset_cache_for_tests()
    sg._tenant_fail_mode.clear()
    yield
    sg._reset_circuit_for_tests()
    sg._reset_cache_for_tests()
    sg._tenant_fail_mode.clear()


@pytest.mark.asyncio
async def test_evaluate_allow():
    client = MagicMock()
    client.post = AsyncMock(return_value=_mk_response(200, {"verdict": "allow"}))
    d = await evaluate_llm_request(
        client=client, settings=_settings(), tenant_id="t1", model="gpt-4o",
    )
    assert d.verdict == "allow"
    assert d.source == "soulgate"
    client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_evaluate_deny():
    client = MagicMock()
    client.post = AsyncMock(return_value=_mk_response(
        200, {"verdict": "deny", "policy_id": "p1", "reason_code": "MODEL_BLOCKED"},
    ))
    d = await evaluate_llm_request(
        client=client, settings=_settings(), tenant_id="t1", model="gpt-4o",
    )
    assert d.verdict == "deny"
    assert d.policy_id == "p1"
    assert d.reason_code == "MODEL_BLOCKED"


@pytest.mark.asyncio
async def test_timeout_fail_open():
    client = MagicMock()
    client.post = AsyncMock(side_effect=httpx.TimeoutException("slow"))
    d = await evaluate_llm_request(
        client=client, settings=_settings("open"), tenant_id="t1", model="gpt-4o",
    )
    assert d.verdict == "allow"
    assert d.source == "timeout_fail_open"


@pytest.mark.asyncio
async def test_timeout_fail_closed():
    client = MagicMock()
    client.post = AsyncMock(side_effect=httpx.TimeoutException("slow"))
    d = await evaluate_llm_request(
        client=client, settings=_settings("closed"), tenant_id="t1", model="gpt-4o",
    )
    assert d.verdict == "deny"
    assert d.source == "timeout_fail_closed"
    assert d.reason_code == "soulgate_unavailable"


@pytest.mark.asyncio
async def test_upstream_5xx_fail_open():
    client = MagicMock()
    client.post = AsyncMock(return_value=_mk_response(503, {"error": "down"}))
    d = await evaluate_llm_request(
        client=client, settings=_settings(), tenant_id="t1", model="gpt-4o",
    )
    assert d.verdict == "allow"
    assert d.source == "timeout_fail_open"


@pytest.mark.asyncio
async def test_connect_error_fail_open():
    client = MagicMock()
    client.post = AsyncMock(side_effect=httpx.ConnectError("nope"))
    d = await evaluate_llm_request(
        client=client, settings=_settings(), tenant_id="t1", model="gpt-4o",
    )
    assert d.verdict == "allow"
    assert d.source == "timeout_fail_open"


@pytest.mark.asyncio
async def test_messages_digest_not_in_payload():
    """Raw messages MUST NOT be sent over the wire — only a digest."""
    client = MagicMock()
    client.post = AsyncMock(return_value=_mk_response(200, {"verdict": "allow"}))
    secret_messages = [{"role": "user", "content": "SUPER-SECRET-CREDIT-CARD-4111111111111111"}]
    await evaluate_llm_request(
        client=client, settings=_settings(),
        tenant_id="t1", model="gpt-4o", messages=secret_messages,
    )
    payload = client.post.await_args.kwargs["json"]
    serialized = json.dumps(payload)
    assert "SUPER-SECRET" not in serialized
    assert "4111111111111111" not in serialized
    # Digest present and matches local recompute
    assert payload["messages_digest"] == compute_messages_digest(secret_messages)
    assert payload["message_count"] == 1


@pytest.mark.asyncio
async def test_allow_cache_hit():
    client = MagicMock()
    client.post = AsyncMock(return_value=_mk_response(200, {"verdict": "allow"}))
    kwargs = dict(client=client, settings=_settings(), tenant_id="t1", model="gpt-4o")
    d1 = await evaluate_llm_request(**kwargs)
    d2 = await evaluate_llm_request(**kwargs)
    assert d1.source == "soulgate"
    assert d2.source == "cache"
    # Only one HTTP call total
    assert client.post.await_count == 1


@pytest.mark.asyncio
async def test_cache_bypass_on_deny():
    client = MagicMock()
    client.post = AsyncMock(return_value=_mk_response(200, {"verdict": "deny"}))
    kwargs = dict(client=client, settings=_settings(), tenant_id="t1", model="gpt-4o")
    d1 = await evaluate_llm_request(**kwargs)
    d2 = await evaluate_llm_request(**kwargs)
    assert d1.verdict == "deny"
    assert d2.verdict == "deny"
    # Both hit soulgate (deny is never cached)
    assert client.post.await_count == 2
    assert d1.source == "soulgate" and d2.source == "soulgate"


@pytest.mark.asyncio
async def test_internal_key_header_set():
    client = MagicMock()
    client.post = AsyncMock(return_value=_mk_response(200, {"verdict": "allow"}))
    await evaluate_llm_request(
        client=client, settings=_settings(), tenant_id="t1", model="gpt-4o",
    )
    headers = client.post.await_args.kwargs["headers"]
    assert headers["X-Internal-Key"] == "test-key"


def test_compute_messages_digest_stable():
    a = compute_messages_digest([{"role": "user", "content": "hi"}])
    b = compute_messages_digest([{"role": "user", "content": "hi"}])
    c = compute_messages_digest([{"role": "user", "content": "bye"}])
    assert a == b
    assert a != c
    # Proven SHA-256 output shape
    assert len(a) == 64
