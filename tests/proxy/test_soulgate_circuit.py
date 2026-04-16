"""
Circuit-breaker tests for tiresias.proxy.soulgate_client.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from tiresias.proxy import soulgate_client as sg
from tiresias.proxy.soulgate_client import evaluate_llm_request


def _settings():
    return SimpleNamespace(
        soulgate_url="http://soulgate:80",
        soulgate_internal_key="k",
        soulgate_timeout_ms=500,
        soulgate_fail_mode="open",
    )


def _resp(s: int, p: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status_code=s, content=json.dumps(p or {}).encode(),
        headers={"content-type": "application/json"},
    )


@pytest.fixture(autouse=True)
def _reset():
    sg._reset_circuit_for_tests()
    sg._reset_cache_for_tests()
    sg._tenant_fail_mode.clear()
    yield
    sg._reset_circuit_for_tests()
    sg._reset_cache_for_tests()
    sg._tenant_fail_mode.clear()


@pytest.mark.asyncio
async def test_circuit_opens_after_n_failures():
    client = MagicMock()
    client.post = AsyncMock(side_effect=httpx.ConnectError("down"))
    # 5 consecutive failures → trip circuit
    for i in range(5):
        await evaluate_llm_request(
            client=client, settings=_settings(),
            tenant_id=f"t{i}", model="gpt-4o",
        )
    assert sg._circuit.state == "open"
    assert client.post.await_count == 5

    # Next call: circuit open, no HTTP call made
    d = await evaluate_llm_request(
        client=client, settings=_settings(),
        tenant_id="t-post-open", model="gpt-4o",
    )
    assert d.source == "circuit_open_fail_open"
    assert client.post.await_count == 5   # unchanged


@pytest.mark.asyncio
async def test_circuit_half_open_after_cooldown(monkeypatch):
    client = MagicMock()
    client.post = AsyncMock(side_effect=httpx.ConnectError("down"))
    for _ in range(5):
        await evaluate_llm_request(
            client=client, settings=_settings(), tenant_id="t", model="x",
        )
    assert sg._circuit.state == "open"

    # Fast-forward monotonic beyond cooldown
    current = [sg._circuit.opened_at + sg._circuit.cooldown_seconds + 1]
    monkeypatch.setattr(sg.time, "monotonic", lambda: current[0])

    # Next call should transition to half_open and attempt the probe
    client.post = AsyncMock(return_value=_resp(200, {"verdict": "allow"}))
    d = await evaluate_llm_request(
        client=client, settings=_settings(), tenant_id="t", model="x",
    )
    # Probe succeeded → circuit closes
    assert d.verdict == "allow"
    assert sg._circuit.state == "closed"


@pytest.mark.asyncio
async def test_circuit_closes_on_success_after_half_open(monkeypatch):
    # Start open
    sg._circuit.state = "open"
    sg._circuit.consecutive_failures = 5
    sg._circuit.opened_at = 0.0
    monkeypatch.setattr(sg.time, "monotonic", lambda: sg._circuit.cooldown_seconds + 1)

    client = MagicMock()
    client.post = AsyncMock(return_value=_resp(200, {"verdict": "allow"}))
    await evaluate_llm_request(
        client=client, settings=_settings(), tenant_id="t", model="x",
    )
    assert sg._circuit.state == "closed"
    assert sg._circuit.consecutive_failures == 0
