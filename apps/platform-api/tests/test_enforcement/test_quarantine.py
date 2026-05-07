"""
Tests for the Quarantine Engine — automated incident response.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio

from src.analytics.detector import Anomaly, AnomalyType
from src.database.models import Soulkey, SoulTenant
from src.enforcement.quarantine import (
    QuarantineAction,
    QuarantineEngine,
    QuarantinePolicy,
    QuarantineStatus,
    QuarantineRecord,
    DEFAULT_QUARANTINE_POLICIES,
    _quarantine_store,
    _rate_limits,
    _force_reauth_flags,
    _isolation_flags,
    _reset_context_signals,
    _killed_sessions,
    _clear_stores,
)


@pytest.fixture(autouse=True)
def clean_stores():
    """Clean in-memory quarantine stores before each test."""
    _clear_stores()
    yield
    _clear_stores()


@pytest_asyncio.fixture
async def tenant_and_key(db_session):
    """Create a tenant + active soulkey for quarantine tests."""
    tenant = SoulTenant(
        id=uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
        name="QuarantineTest Corp",
        slug="qtest",
        tier="enterprise",
        status="active",
    )
    db_session.add(tenant)
    await db_session.flush()

    sk = Soulkey(
        id=uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
        tenant_id=tenant.id,
        persona_id="test-agent",
        key_hash="fakehash_quarantine_test",
        label="Quarantine test key",
        status="active",
    )
    db_session.add(sk)
    await db_session.flush()
    return tenant, sk


def _make_anomaly(
    soulkey_id: uuid.UUID,
    anomaly_type: AnomalyType = AnomalyType.CREDENTIAL_STUFFING,
    severity: str = "high",
) -> Anomaly:
    return Anomaly(
        type=anomaly_type,
        severity=severity,
        soulkey_id=soulkey_id,
        description=f"Test anomaly: {anomaly_type.value}",
        evidence={"test": True},
    )


# ---------------------------------------------------------------------------
# Test 1: Execute quarantine with SUSPEND_KEY
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_execute_quarantine_suspend_key(db_session, tenant_and_key):
    tenant, sk = tenant_and_key
    engine = QuarantineEngine()

    record = await engine.execute_quarantine(
        db=db_session,
        soulkey_id=sk.id,
        tenant_id=tenant.id,
        persona_id=sk.persona_id,
        actions=[QuarantineAction.SUSPEND_KEY],
        reason="test suspend",
    )

    assert record.status == QuarantineStatus.ACTIVE
    assert QuarantineAction.SUSPEND_KEY in record.actions_taken
    # Soulkey should now be suspended
    await db_session.refresh(sk)
    assert sk.status == "suspended"


# ---------------------------------------------------------------------------
# Test 2: Execute quarantine with KILL_SESSION
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_execute_quarantine_kill_session(db_session, tenant_and_key):
    tenant, sk = tenant_and_key
    engine = QuarantineEngine()

    await engine.execute_quarantine(
        db=db_session,
        soulkey_id=sk.id,
        tenant_id=tenant.id,
        persona_id=sk.persona_id,
        actions=[QuarantineAction.KILL_SESSION],
        reason="test kill session",
    )

    assert engine.is_session_killed(sk.id)


# ---------------------------------------------------------------------------
# Test 3: Execute quarantine with RATE_LIMIT
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_execute_quarantine_rate_limit(db_session, tenant_and_key):
    tenant, sk = tenant_and_key
    engine = QuarantineEngine(default_rate_limit=10)

    await engine.execute_quarantine(
        db=db_session,
        soulkey_id=sk.id,
        tenant_id=tenant.id,
        persona_id=sk.persona_id,
        actions=[QuarantineAction.RATE_LIMIT],
        reason="test rate limit",
    )

    assert engine.is_rate_limited(sk.id) == 10


# ---------------------------------------------------------------------------
# Test 4: Auto-release after timeout
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_auto_release_expired(db_session, tenant_and_key):
    tenant, sk = tenant_and_key
    engine = QuarantineEngine()

    record = await engine.execute_quarantine(
        db=db_session,
        soulkey_id=sk.id,
        tenant_id=tenant.id,
        persona_id=sk.persona_id,
        actions=[QuarantineAction.RATE_LIMIT],
        reason="will auto-release",
        auto_release_after=0,  # 0 minutes = immediate
    )

    # Manually set auto_release_at to the past
    record.auto_release_at = datetime.now(timezone.utc) - timedelta(minutes=1)

    released = await engine.auto_release_check(db_session)
    assert record.id in released
    assert record.status == QuarantineStatus.EXPIRED


# ---------------------------------------------------------------------------
# Test 5: Manual release
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_manual_release(db_session, tenant_and_key):
    tenant, sk = tenant_and_key
    engine = QuarantineEngine()

    record = await engine.execute_quarantine(
        db=db_session,
        soulkey_id=sk.id,
        tenant_id=tenant.id,
        persona_id=sk.persona_id,
        actions=[QuarantineAction.SUSPEND_KEY, QuarantineAction.RATE_LIMIT],
        reason="test manual release",
    )

    ok = await engine.release_quarantine(db_session, record.id, released_by="admin_user")
    assert ok is True
    assert record.status == QuarantineStatus.RELEASED
    assert record.released_by == "admin_user"
    # Rate limit should be cleared
    assert engine.is_rate_limited(sk.id) is None


# ---------------------------------------------------------------------------
# Test 6: Release non-existent quarantine returns False
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_release_nonexistent(db_session):
    engine = QuarantineEngine()
    ok = await engine.release_quarantine(db_session, uuid.uuid4(), released_by="admin")
    assert ok is False


# ---------------------------------------------------------------------------
# Test 7: Default policy — CREDENTIAL_STUFFING at high
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_default_policy_credential_stuffing(db_session, tenant_and_key):
    tenant, sk = tenant_and_key
    engine = QuarantineEngine()

    anomaly = _make_anomaly(sk.id, AnomalyType.CREDENTIAL_STUFFING, "high")
    result = await engine.evaluate_and_respond(db_session, anomaly)

    assert result.triggered is True
    assert result.record is not None
    assert QuarantineAction.SUSPEND_KEY in result.record.actions_taken
    assert QuarantineAction.KILL_SESSION in result.record.actions_taken


# ---------------------------------------------------------------------------
# Test 8: Default policy — SCOPE_ESCALATION at high
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_default_policy_scope_escalation(db_session, tenant_and_key):
    tenant, sk = tenant_and_key
    engine = QuarantineEngine()

    anomaly = _make_anomaly(sk.id, AnomalyType.SCOPE_ESCALATION, "high")
    result = await engine.evaluate_and_respond(db_session, anomaly)

    assert result.triggered is True
    assert QuarantineAction.RATE_LIMIT in result.record.actions_taken
    assert QuarantineAction.FORCE_REAUTH in result.record.actions_taken


# ---------------------------------------------------------------------------
# Test 9: No policy match for low-severity anomaly
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_no_match_low_severity(db_session, tenant_and_key):
    tenant, sk = tenant_and_key
    engine = QuarantineEngine()

    anomaly = _make_anomaly(sk.id, AnomalyType.OFF_HOURS, "low")
    result = await engine.evaluate_and_respond(db_session, anomaly)

    assert result.triggered is False


# ---------------------------------------------------------------------------
# Test 10: Catch-all critical policy triggers for any anomaly type
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_catchall_critical(db_session, tenant_and_key):
    tenant, sk = tenant_and_key
    engine = QuarantineEngine()

    anomaly = _make_anomaly(sk.id, AnomalyType.IMPOSSIBLE_TRAVEL, "critical")
    result = await engine.evaluate_and_respond(db_session, anomaly)

    assert result.triggered is True
    assert QuarantineAction.SUSPEND_KEY in result.record.actions_taken


# ---------------------------------------------------------------------------
# Test 11: list_quarantined filters by tenant
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_list_quarantined_filter(db_session, tenant_and_key):
    tenant, sk = tenant_and_key
    engine = QuarantineEngine()

    await engine.execute_quarantine(
        db=db_session,
        soulkey_id=sk.id,
        tenant_id=tenant.id,
        persona_id=sk.persona_id,
        actions=[QuarantineAction.ISOLATE],
        reason="list test",
    )

    all_records = await engine.list_quarantined()
    assert len(all_records) == 1

    filtered = await engine.list_quarantined(tenant_id=uuid.uuid4())
    assert len(filtered) == 0

    filtered_match = await engine.list_quarantined(tenant_id=tenant.id)
    assert len(filtered_match) == 1


# ---------------------------------------------------------------------------
# Test 12: QuarantineRecord lifecycle (active -> released)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_record_lifecycle(db_session, tenant_and_key):
    tenant, sk = tenant_and_key
    engine = QuarantineEngine()

    record = await engine.execute_quarantine(
        db=db_session,
        soulkey_id=sk.id,
        tenant_id=tenant.id,
        persona_id=sk.persona_id,
        actions=[QuarantineAction.FORCE_REAUTH, QuarantineAction.RESET_CONTEXT],
        reason="lifecycle test",
    )

    assert record.status == QuarantineStatus.ACTIVE
    assert record.quarantined_at is not None
    assert record.released_at is None
    assert engine.needs_reauth(sk.id) is True
    assert engine.should_reset_context(sk.id) is True

    # Serialize round-trip
    d = record.to_dict()
    assert d["status"] == "active"
    assert "force_reauth" in d["actions_taken"]
    assert "reset_context" in d["actions_taken"]

    # Release
    await engine.release_quarantine(db_session, record.id, released_by="ops")
    assert record.status == QuarantineStatus.RELEASED
    assert record.released_at is not None
    assert engine.needs_reauth(sk.id) is False
    assert engine.should_reset_context(sk.id) is False


# ---------------------------------------------------------------------------
# Test 13: REVOKE_KEY is terminal — cannot be reversed
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_revoke_key_terminal(db_session, tenant_and_key):
    tenant, sk = tenant_and_key
    engine = QuarantineEngine()

    record = await engine.execute_quarantine(
        db=db_session,
        soulkey_id=sk.id,
        tenant_id=tenant.id,
        persona_id=sk.persona_id,
        actions=[QuarantineAction.REVOKE_KEY],
        reason="confirmed compromise",
    )

    await db_session.refresh(sk)
    assert sk.status == "revoked"

    # Release should succeed (record level) but key stays revoked
    await engine.release_quarantine(db_session, record.id, released_by="admin")
    await db_session.refresh(sk)
    assert sk.status == "revoked"


# ---------------------------------------------------------------------------
# Test 14: Requires-approval policy queues for human review
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_requires_approval(db_session, tenant_and_key):
    tenant, sk = tenant_and_key

    approval_policy = [
        QuarantinePolicy(
            trigger=AnomalyType.NEW_RESOURCE,
            severity_threshold="medium",
            actions=[QuarantineAction.ISOLATE],
            requires_approval=True,
            notification_priority="high",
        ),
    ]
    engine = QuarantineEngine(policies=approval_policy)

    anomaly = _make_anomaly(sk.id, AnomalyType.NEW_RESOURCE, "medium")
    result = await engine.evaluate_and_respond(db_session, anomaly)

    assert result.triggered is True
    assert result.pending_approval is True
    assert result.record.status == QuarantineStatus.PENDING_APPROVAL
