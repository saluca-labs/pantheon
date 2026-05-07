"""
Soulgate LLM policy-evaluation client (proxy side, Tier 2b).

Responsibilities
----------------
- Single shared httpx.AsyncClient (reused from caller; per-request timeout override).
- Circuit breaker: open after 5 consecutive failures, half-open probe after 30s.
- In-memory TTL cache of allow decisions (60s), keyed on a sha256 digest of the
  request shape.  Deny decisions are never cached.
- Fail-mode policy:
    * env ``SOULGATE_FAIL_MODE`` is the default when soulgate is unreachable /
      the circuit is open.
    * If a previous successful evaluate returned ``fail_mode="open|closed"``
      for this tenant, that per-tenant override wins (cached in
      ``_tenant_fail_mode``).
- Privacy: raw ``messages`` never leave the proxy.  Only the JSON-sorted SHA-256
  digest is transmitted.

Metrics / logs (INFO by default, WARNING on circuit events):
    soulgate_eval verdict=<> source=<> latency_ms=<>
    soulgate_circuit_open consecutive_failures=<>
    soulgate_circuit_half_open
    soulgate_circuit_closed
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Decision dataclass
# ---------------------------------------------------------------------------


@dataclass
class SoulgateDecision:
    verdict: str = "allow"           # "allow" | "deny" | "modify"
    policy_id: str | None = None
    policy_name: str | None = None
    reason_code: str | None = None
    reason: str | None = None
    fail_mode_override: str | None = None
    source: str = "soulgate"         # soulgate | cache | circuit_open_fail_open
                                     #   | circuit_open_fail_closed | timeout_fail_open
                                     #   | timeout_fail_closed | off
    latency_ms: float = 0.0


# ---------------------------------------------------------------------------
# Circuit breaker (module-level, per-process)
# ---------------------------------------------------------------------------


@dataclass
class _CircuitState:
    consecutive_failures: int = 0
    state: str = "closed"            # "closed" | "open" | "half_open"
    opened_at: float = 0.0
    failure_threshold: int = 5
    cooldown_seconds: int = 30


_circuit = _CircuitState()


def _record_success() -> None:
    if _circuit.state != "closed":
        logger.info("soulgate_circuit_closed previous_state=%s", _circuit.state)
    _circuit.state = "closed"
    _circuit.consecutive_failures = 0
    _circuit.opened_at = 0.0


def _record_failure() -> None:
    _circuit.consecutive_failures += 1
    if _circuit.consecutive_failures >= _circuit.failure_threshold and _circuit.state != "open":
        _circuit.state = "open"
        _circuit.opened_at = time.monotonic()
        logger.warning(
            "soulgate_circuit_open consecutive_failures=%d cooldown_s=%d severity=WARNING",
            _circuit.consecutive_failures,
            _circuit.cooldown_seconds,
        )


def _circuit_allows_call() -> bool:
    """True if we should make the HTTP call.  False = skip, use fail-mode."""
    if _circuit.state == "closed":
        return True
    if _circuit.state == "open":
        if time.monotonic() - _circuit.opened_at >= _circuit.cooldown_seconds:
            _circuit.state = "half_open"
            logger.info("soulgate_circuit_half_open")
            return True
        return False
    # half_open: allow a single probe
    return True


def _reset_circuit_for_tests() -> None:
    """Test helper only."""
    _circuit.state = "closed"
    _circuit.consecutive_failures = 0
    _circuit.opened_at = 0.0


# ---------------------------------------------------------------------------
# TTL cache (allow-only, 60s)
# ---------------------------------------------------------------------------


_CACHE_TTL_SECONDS = 60.0
_cache: dict[str, tuple[float, SoulgateDecision]] = {}


def _cache_key(
    tenant_id: str,
    model: str,
    endpoint: str,
    persona_id: str | None,
    soulkey_id: str | None,
) -> str:
    raw = f"{tenant_id}|{model}|{endpoint}|{persona_id or ''}|{soulkey_id or ''}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> SoulgateDecision | None:
    hit = _cache.get(key)
    if not hit:
        return None
    ts, decision = hit
    if time.monotonic() - ts > _CACHE_TTL_SECONDS:
        _cache.pop(key, None)
        return None
    return decision


def _cache_put(key: str, decision: SoulgateDecision) -> None:
    if decision.verdict != "allow":
        return   # never cache deny/modify
    _cache[key] = (time.monotonic(), decision)


def _reset_cache_for_tests() -> None:
    _cache.clear()


# ---------------------------------------------------------------------------
# Per-tenant fail-mode override cache (populated from successful evaluates)
# ---------------------------------------------------------------------------


_tenant_fail_mode: dict[str, str] = {}


# ---------------------------------------------------------------------------
# Messages digest (privacy preserving)
# ---------------------------------------------------------------------------


def compute_messages_digest(messages: list[dict[str, Any]] | None) -> str:
    try:
        payload = json.dumps(messages or [], sort_keys=True, default=str)
    except Exception:
        payload = str(messages)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Core entrypoint
# ---------------------------------------------------------------------------


async def evaluate_llm_request(
    *,
    client: httpx.AsyncClient,
    settings: Any,
    tenant_id: str,
    model: str,
    endpoint: str = "/v1/chat/completions",
    persona_id: str | None = None,
    soulkey_id: str | None = None,
    session_id: str | None = None,
    messages: list[dict[str, Any]] | None = None,
    stream: bool = False,
    source_ip: str | None = None,
) -> SoulgateDecision:
    """
    Call POST {SOULGATE_URL}/gate/v1/llm/evaluate.

    Returns a ``SoulgateDecision``.  Never raises — network failures are
    translated into a decision with ``source=timeout_fail_open`` (or _closed)
    per the effective fail_mode.
    """
    t0 = time.monotonic()

    # Cache lookup (allow-only hot path)
    ck = _cache_key(tenant_id, model, endpoint, persona_id, soulkey_id)
    cached = _cache_get(ck)
    if cached is not None:
        return SoulgateDecision(
            verdict=cached.verdict,
            policy_id=cached.policy_id,
            policy_name=cached.policy_name,
            reason_code=cached.reason_code,
            reason=cached.reason,
            fail_mode_override=cached.fail_mode_override,
            source="cache",
            latency_ms=(time.monotonic() - t0) * 1000.0,
        )

    # Circuit breaker — skip HTTP if open and cooldown not elapsed
    if not _circuit_allows_call():
        return _fail_mode_decision(
            tenant_id=tenant_id,
            settings=settings,
            source_prefix="circuit_open",
            started=t0,
        )

    url = settings.soulgate_url.rstrip("/") + "/gate/v1/llm/evaluate"
    headers = {"Content-Type": "application/json"}
    if getattr(settings, "soulgate_internal_key", None):
        headers["X-Internal-Key"] = settings.soulgate_internal_key

    payload = {
        "tenant_id": tenant_id,
        "soulkey_id": soulkey_id,
        "persona_id": persona_id,
        "model": model,
        "session_id": session_id,
        "endpoint": endpoint,
        "messages_digest": compute_messages_digest(messages),
        "message_count": len(messages or []),
        "stream": stream,
        "source_ip": source_ip,
    }
    timeout_s = max(0.05, settings.soulgate_timeout_ms / 1000.0)

    try:
        resp = await client.post(
            url,
            json=payload,
            headers=headers,
            timeout=httpx.Timeout(timeout_s),
        )
    except (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError, httpx.RemoteProtocolError) as exc:
        _record_failure()
        logger.warning(
            "soulgate_eval_transport_error tenant=%s error=%s severity=WARNING",
            tenant_id, type(exc).__name__,
        )
        return _fail_mode_decision(
            tenant_id=tenant_id,
            settings=settings,
            source_prefix="timeout",
            started=t0,
        )
    except Exception as exc:  # noqa: BLE001 — last-chance guard
        _record_failure()
        logger.warning(
            "soulgate_eval_unexpected_error tenant=%s error=%s severity=WARNING",
            tenant_id, type(exc).__name__,
        )
        return _fail_mode_decision(
            tenant_id=tenant_id,
            settings=settings,
            source_prefix="timeout",
            started=t0,
        )

    if resp.status_code >= 500:
        _record_failure()
        logger.warning(
            "soulgate_eval_upstream_5xx tenant=%s status=%d severity=WARNING",
            tenant_id, resp.status_code,
        )
        return _fail_mode_decision(
            tenant_id=tenant_id,
            settings=settings,
            source_prefix="timeout",
            started=t0,
        )

    if resp.status_code >= 400:
        # 4xx from soulgate = misconfigured proxy or bad payload.  Treat as
        # failure for circuit accounting but do NOT trip fail-mode — the
        # proxy sent a bad request, not soulgate misbehaving.  Fail-open.
        _record_failure()
        logger.warning(
            "soulgate_eval_client_error tenant=%s status=%d body=%s severity=WARNING",
            tenant_id, resp.status_code, resp.text[:200],
        )
        return SoulgateDecision(
            verdict="allow",
            source=f"client_error_{resp.status_code}_fail_open",
            latency_ms=(time.monotonic() - t0) * 1000.0,
        )

    try:
        data = resp.json()
    except Exception:
        _record_failure()
        return _fail_mode_decision(
            tenant_id=tenant_id,
            settings=settings,
            source_prefix="timeout",
            started=t0,
        )

    _record_success()

    # Populate per-tenant fail_mode override cache
    fm = data.get("fail_mode")
    if fm in ("open", "closed"):
        _tenant_fail_mode[tenant_id] = fm
    elif fm is None and tenant_id in _tenant_fail_mode:
        # Policy no longer sets an override — drop cached one.
        _tenant_fail_mode.pop(tenant_id, None)

    decision = SoulgateDecision(
        verdict=str(data.get("verdict", "allow")),
        policy_id=data.get("policy_id"),
        policy_name=data.get("policy_name"),
        reason_code=data.get("reason_code"),
        reason=data.get("reason"),
        fail_mode_override=fm,
        source="soulgate",
        latency_ms=(time.monotonic() - t0) * 1000.0,
    )
    _cache_put(ck, decision)
    return decision


def _fail_mode_decision(
    *,
    tenant_id: str,
    settings: Any,
    source_prefix: str,
    started: float,
) -> SoulgateDecision:
    """Build a decision when soulgate is unreachable or the circuit is open."""
    override = _tenant_fail_mode.get(tenant_id)
    env_default = getattr(settings, "soulgate_fail_mode", "open")
    effective = override or env_default
    verdict = "deny" if effective == "closed" else "allow"
    source = f"{source_prefix}_fail_{'closed' if effective == 'closed' else 'open'}"
    return SoulgateDecision(
        verdict=verdict,
        source=source,
        fail_mode_override=override,
        reason_code="soulgate_unavailable" if verdict == "deny" else None,
        latency_ms=(time.monotonic() - started) * 1000.0,
    )


# ---------------------------------------------------------------------------
# Request-id helper (for deny response body)
# ---------------------------------------------------------------------------


def new_request_id() -> str:
    return str(uuid.uuid4())
