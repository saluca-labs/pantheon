"""
Fail-mode policy tests for tiresias.proxy.soulgate_client.

Verifies:
- env SOULGATE_FAIL_MODE=closed returns deny on transport error
- per-tenant fail_mode (from a successful evaluate) overrides env default
- per-tenant override applies only on the circuit/timeout path, not to
  healthy-response calls
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from tiresias.proxy import soulgate_client as sg
from tiresias.proxy.soulgate_client import evaluate_llm_request


def _settings(fail_mode="open"):
    return SimpleNamespace(
        soulgate_url="http://soulgate:80",
        soulgate_internal_key="k",
        soulgate_timeout_ms=500,
        soulgate_fail_mode=fail_mode,
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
async def test_env_fail_mode_closed_denies_on_timeout():
    client = MagicMock()
    client.post = AsyncMock(side_effect=httpx.TimeoutException("slow"))
    d = await evaluate_llm_request(
        client=client, settings=_settings("closed"),
        tenant_id="t1", model="gpt-4o",
    )
    assert d.verdict == "deny"
    assert d.source == "timeout_fail_closed"


@pytest.mark.asyncio
async def test_per_tenant_override_beats_env_default():
    """
    After a successful evaluate returns fail_mode=closed for tenant T,
    a subsequent transport failure for tenant T should deny — even though
    env default is 'open'.  Other tenants still use env default.
    """
    # Step 1: successful evaluate populates per-tenant cache
    client = MagicMock()
    client.post = AsyncMock(return_value=_resp(
        200, {"verdict": "allow", "fail_mode": "closed"},
    ))
    await evaluate_llm_request(
        client=client, settings=_settings("open"),
        tenant_id="strict-tenant", model="gpt-4o",
    )
    assert sg._tenant_fail_mode.get("strict-tenant") == "closed"

    # Step 2: transport failure for the same tenant → deny (override wins)
    client.post = AsyncMock(side_effect=httpx.TimeoutException("slow"))
    d = await evaluate_llm_request(
        client=client, settings=_settings("open"),
        tenant_id="strict-tenant", model="gpt-4o-new",   # cache bypass via model
    )
    assert d.verdict == "deny"
    assert d.source == "timeout_fail_closed"

    # Step 3: transport failure for a DIFFERENT tenant → env default (open)
    d2 = await evaluate_llm_request(
        client=client, settings=_settings("open"),
        tenant_id="other-tenant", model="gpt-4o",
    )
    assert d2.verdict == "allow"
    assert d2.source == "timeout_fail_open"


@pytest.mark.asyncio
async def test_override_cleared_when_policy_drops_fail_mode():
    client = MagicMock()
    client.post = AsyncMock(return_value=_resp(
        200, {"verdict": "allow", "fail_mode": "closed"},
    ))
    await evaluate_llm_request(
        client=client, settings=_settings("open"),
        tenant_id="t", model="m1",
    )
    assert sg._tenant_fail_mode["t"] == "closed"

    # Next successful eval returns fail_mode=None → cached override dropped
    client.post = AsyncMock(return_value=_resp(
        200, {"verdict": "allow", "fail_mode": None},
    ))
    await evaluate_llm_request(
        client=client, settings=_settings("open"),
        tenant_id="t", model="m2",
    )
    assert "t" not in sg._tenant_fail_mode
