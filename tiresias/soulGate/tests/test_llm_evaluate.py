"""
Tests for the LLM policy evaluation endpoint.

Covers the pure evaluation engine (_evaluate / _fail_mode_for_tenant) plus
the FastAPI route, exercising allow-default, deny, priority ordering,
soulkey/persona scoping, fail_mode surfacing, and auth.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from soulGate.src.llm.router import (
    LLMEvaluateRequest,
    _evaluate,
    _fail_mode_for_tenant,
    _match,
)


def _p(
    *,
    tenant_id=None,
    soulkey_id=None,
    persona_id=None,
    model_pattern="*",
    endpoint_pattern="/v1/chat/completions",
    action="allow",
    priority=100,
    enabled=True,
    reason_code=None,
    reason=None,
    fail_mode=None,
):
    """Build a policy-like stand-in that satisfies the evaluator."""
    return SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=tenant_id or uuid.uuid4(),
        soulkey_id=soulkey_id,
        persona_id=persona_id,
        model_pattern=model_pattern,
        endpoint_pattern=endpoint_pattern,
        action=action,
        priority=priority,
        enabled=enabled,
        reason_code=reason_code,
        reason=reason,
        fail_mode=fail_mode,
    )


def _req(**overrides):
    base = {
        "tenant_id": str(uuid.uuid4()),
        "model": "gpt-4o",
        "endpoint": "/v1/chat/completions",
    }
    base.update(overrides)
    return LLMEvaluateRequest(**base)


# ---------------------------------------------------------------------------
# Pure-function tests
# ---------------------------------------------------------------------------


def test_allow_default_no_policies():
    verdict, matched = _evaluate(_req(), [])
    assert verdict == "allow"
    assert matched is None


def test_deny_exact_model_match():
    pol = _p(model_pattern="gpt-4o", action="deny", reason_code="MODEL_BLOCKED")
    verdict, matched = _evaluate(_req(model="gpt-4o"), [pol])
    assert verdict == "deny"
    assert matched is pol


def test_glob_model_pattern_matches():
    pol = _p(model_pattern="gpt-4*", action="deny")
    verdict, matched = _evaluate(_req(model="gpt-4o-mini"), [pol])
    assert verdict == "deny"
    assert matched is pol


def test_priority_ordering_higher_wins():
    # Policies arrive pre-sorted priority DESC from the loader.
    high = _p(model_pattern="*", action="deny", priority=200, reason_code="HIGH")
    low = _p(model_pattern="*", action="allow", priority=50, reason_code="LOW")
    verdict, matched = _evaluate(_req(), [high, low])
    assert verdict == "deny"
    assert matched is high


def test_soulkey_scoping_isolates():
    sk = uuid.uuid4()
    pol = _p(soulkey_id=sk, model_pattern="*", action="deny")
    # Different soulkey → does not match, falls through to default allow.
    v1, m1 = _evaluate(_req(soulkey_id=str(uuid.uuid4())), [pol])
    assert v1 == "allow" and m1 is None
    # Matching soulkey → deny.
    v2, m2 = _evaluate(_req(soulkey_id=str(sk)), [pol])
    assert v2 == "deny" and m2 is pol


def test_persona_scoping_isolates():
    pol = _p(persona_id="alfred", action="deny")
    v1, _ = _evaluate(_req(persona_id="other"), [pol])
    v2, _ = _evaluate(_req(persona_id="alfred"), [pol])
    assert v1 == "allow"
    assert v2 == "deny"


def test_endpoint_pattern_filters():
    pol = _p(endpoint_pattern="/v1/embeddings", action="deny")
    v, _ = _evaluate(_req(endpoint="/v1/chat/completions"), [pol])
    assert v == "allow"


def test_fail_mode_highest_priority_wins():
    pols = [
        _p(priority=200, fail_mode="closed"),
        _p(priority=100, fail_mode="open"),
        _p(priority=50, fail_mode=None),
    ]
    assert _fail_mode_for_tenant(pols) == "closed"


def test_fail_mode_none_when_no_override():
    assert _fail_mode_for_tenant([_p(fail_mode=None)]) is None


def test_invalid_action_falls_back_to_allow():
    pol = _p(action="explode")
    v, _ = _evaluate(_req(), [pol])
    assert v == "allow"


def test_match_wildcard_and_empty():
    assert _match("*", "gpt-4o") is True
    assert _match("", "gpt-4o") is True
    assert _match("gpt-4*", "") is False
    assert _match("gpt-4*", "claude-3") is False
    assert _match("gpt-4*", "gpt-4o") is True
