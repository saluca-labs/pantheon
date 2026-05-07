"""
Tests for anomaly detection and behavioral analytics.
Covers baseline building, all anomaly types, alert routing,
deduplication, escalation, and API endpoints.
"""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import AuditLog
from src.analytics.baseline import AgentBaseline, BaselineEngine
from src.analytics.detector import (
    AnomalyType,
    Anomaly,
    AnomalyDetector,
    SEVERITY_LOW,
    SEVERITY_MEDIUM,
    SEVERITY_HIGH,
    SEVERITY_CRITICAL,
)
from src.analytics.alerts import (
    AlertRouter,
    LogAlertSink,
    PrometheusAlertSink,
    AlertSink,
    _escalate_severity,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TENANT_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
SOULKEY_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
SOULKEY_ID_B = uuid.UUID("33333333-3333-3333-3333-333333333333")
NOW = datetime.now(timezone.utc)


def _make_audit_event(
    soulkey_id=SOULKEY_ID,
    event_type="auth_grant",
    resource="memory",
    action="read",
    scope="cs:algorithms",
    decision="grant",
    timestamp=None,
    context=None,
    reason=None,
) -> AuditLog:
    """Create a mock AuditLog event."""
    event = AuditLog(
        id=uuid.uuid4(),
        tenant_id=TENANT_ID,
        soulkey_id=soulkey_id,
        event_type=event_type,
        resource=resource,
        action=action,
        scope=scope,
        decision=decision,
        timestamp=timestamp or NOW,
        context=context or {},
        reason=reason,
    )
    return event


def _make_baseline(
    soulkey_id=SOULKEY_ID,
    request_rate=10.0,
    resources=None,
    actions=None,
    scopes=None,
    hours=None,
    denial_rate=0.05,
    burst_size=5,
) -> AgentBaseline:
    """Create a baseline with sensible defaults."""
    return AgentBaseline(
        soulkey_id=soulkey_id,
        typical_request_rate=request_rate,
        typical_resources=resources or {"memory", "vault"},
        typical_actions=actions or {"read", "write"},
        typical_scopes=scopes or {"cs:algorithms", "cs:data"},
        typical_hours=hours or {9, 10, 11, 12, 13, 14, 15, 16, 17},
        typical_denial_rate=denial_rate,
        typical_burst_size=burst_size,
        last_updated=NOW,
    )


# ---------------------------------------------------------------------------
# Baseline tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_baseline_build_from_audit_data(db_session, sample_tenant):
    """Build a baseline from actual audit trail data."""
    engine = BaselineEngine()
    sk_id = SOULKEY_ID

    # Insert some audit events
    base_time = NOW - timedelta(hours=24)
    for i in range(20):
        event = AuditLog(
            tenant_id=sample_tenant.id,
            soulkey_id=sk_id,
            event_type="auth_grant",
            resource="memory",
            action="read",
            scope="cs:algorithms",
            decision="grant",
            timestamp=base_time + timedelta(minutes=i * 30),
            context={},
        )
        db_session.add(event)

    # Add some denials
    for i in range(5):
        event = AuditLog(
            tenant_id=sample_tenant.id,
            soulkey_id=sk_id,
            event_type="auth_deny",
            resource="vault",
            action="reveal",
            scope="secrets:prod",
            decision="deny",
            timestamp=base_time + timedelta(hours=12, minutes=i * 10),
            context={},
        )
        db_session.add(event)

    await db_session.flush()

    baseline = await engine.build_baseline(db_session, sk_id)

    assert baseline.soulkey_id == sk_id
    assert baseline.typical_request_rate > 0
    assert "memory" in baseline.typical_resources
    assert "vault" in baseline.typical_resources
    assert "read" in baseline.typical_actions
    assert "reveal" in baseline.typical_actions
    assert baseline.typical_denial_rate > 0
    assert baseline.typical_denial_rate < 1.0
    assert baseline.typical_burst_size >= 1
    assert len(baseline.typical_hours) > 0


@pytest.mark.asyncio
async def test_baseline_empty_audit_data(db_session, sample_tenant):
    """Baseline for an agent with no audit data returns zeroed baseline."""
    engine = BaselineEngine()
    sk_id = uuid.uuid4()

    baseline = await engine.build_baseline(db_session, sk_id)

    assert baseline.soulkey_id == sk_id
    assert baseline.typical_request_rate == 0.0
    assert len(baseline.typical_resources) == 0
    assert baseline.typical_denial_rate == 0.0


@pytest.mark.asyncio
async def test_baseline_get_cached():
    """get_baseline returns cached baseline."""
    engine = BaselineEngine()
    baseline = _make_baseline()
    engine._baselines[SOULKEY_ID] = baseline

    result = await engine.get_baseline(SOULKEY_ID)
    assert result is baseline

    # Missing baseline returns None
    result = await engine.get_baseline(uuid.uuid4())
    assert result is None


@pytest.mark.asyncio
async def test_baseline_serialization():
    """Baseline to_dict produces valid serializable output."""
    baseline = _make_baseline()
    d = baseline.to_dict()

    assert d["soulkey_id"] == str(SOULKEY_ID)
    assert isinstance(d["typical_resources"], list)
    assert isinstance(d["typical_hours"], list)
    assert d["typical_request_rate"] == 10.0


# ---------------------------------------------------------------------------
# Anomaly detection tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_rate_spike_detection():
    """Detect when request rate exceeds 3x baseline."""
    engine = BaselineEngine()
    engine._baselines[SOULKEY_ID] = _make_baseline(request_rate=10.0)
    detector = AnomalyDetector(baseline_engine=engine, window_size=300)

    # Flood the sliding window with events to trigger rate spike
    # 10 req/hr baseline, 3x threshold = 30/hr. In a 300s window that's ~2.5 events.
    # We need > 2.5 events, so 5 should trigger it.
    for i in range(50):
        event = _make_audit_event(
            timestamp=NOW - timedelta(seconds=300 - i),
        )
        await detector.check_event(event)

    anomalies = await detector.get_recent_anomalies(anomaly_type=AnomalyType.RATE_SPIKE)
    assert len(anomalies) > 0
    assert anomalies[0].type == AnomalyType.RATE_SPIKE


@pytest.mark.asyncio
async def test_off_hours_detection():
    """Detect activity outside typical hours."""
    engine = BaselineEngine()
    engine._baselines[SOULKEY_ID] = _make_baseline(hours={9, 10, 11, 12, 13, 14, 15, 16, 17})
    detector = AnomalyDetector(baseline_engine=engine)

    # Event at 3 AM — outside typical hours
    event = _make_audit_event(
        timestamp=NOW.replace(hour=3, minute=0, second=0),
    )
    anomalies = await detector.check_event(event)

    off_hours = [a for a in anomalies if a.type == AnomalyType.OFF_HOURS]
    assert len(off_hours) == 1
    assert off_hours[0].severity == SEVERITY_MEDIUM


@pytest.mark.asyncio
async def test_new_resource_detection():
    """Detect access to a resource not in baseline."""
    engine = BaselineEngine()
    engine._baselines[SOULKEY_ID] = _make_baseline(resources={"memory", "vault"})
    detector = AnomalyDetector(baseline_engine=engine)

    event = _make_audit_event(resource="mesh")
    anomalies = await detector.check_event(event)

    new_resource = [a for a in anomalies if a.type == AnomalyType.NEW_RESOURCE]
    assert len(new_resource) == 1
    assert "mesh" in new_resource[0].description


@pytest.mark.asyncio
async def test_scope_escalation_detection():
    """Detect scope escalation — requesting broader scope than typical."""
    engine = BaselineEngine()
    engine._baselines[SOULKEY_ID] = _make_baseline(scopes={"cs:algorithms", "cs:data"})
    detector = AnomalyDetector(baseline_engine=engine)

    event = _make_audit_event(scope="secrets:prod")
    anomalies = await detector.check_event(event)

    escalation = [a for a in anomalies if a.type == AnomalyType.SCOPE_ESCALATION]
    assert len(escalation) == 1
    assert escalation[0].severity == SEVERITY_HIGH


@pytest.mark.asyncio
async def test_denial_spike_detection():
    """Detect denial rate exceeding 2x baseline."""
    engine = BaselineEngine()
    engine._baselines[SOULKEY_ID] = _make_baseline(denial_rate=0.05)
    detector = AnomalyDetector(baseline_engine=engine, window_size=600)

    # Insert events: mostly denials
    for i in range(20):
        event = _make_audit_event(
            decision="deny",
            event_type="auth_deny",
            timestamp=NOW - timedelta(seconds=600 - i * 10),
        )
        await detector.check_event(event)

    anomalies = await detector.get_recent_anomalies(anomaly_type=AnomalyType.DENIAL_SPIKE)
    assert len(anomalies) > 0


@pytest.mark.asyncio
async def test_burst_detection():
    """Detect burst of requests exceeding typical burst size."""
    engine = BaselineEngine()
    engine._baselines[SOULKEY_ID] = _make_baseline(burst_size=3)
    detector = AnomalyDetector(baseline_engine=engine, window_size=120)

    # Insert 10 events in the last 60 seconds — burst threshold is 3 * 2.0 = 6
    for i in range(10):
        event = _make_audit_event(
            timestamp=NOW - timedelta(seconds=i),
        )
        await detector.check_event(event)

    anomalies = await detector.get_recent_anomalies(anomaly_type=AnomalyType.BURST)
    assert len(anomalies) > 0
    assert anomalies[0].type == AnomalyType.BURST


@pytest.mark.asyncio
async def test_credential_stuffing_detection():
    """Detect credential stuffing — multiple failed auth attempts."""
    engine = BaselineEngine()
    detector = AnomalyDetector(baseline_engine=engine)

    # 6 failed attempts from same source (threshold default is 5)
    for i in range(6):
        event = _make_audit_event(
            soulkey_id=None,
            event_type="auth_deny",
            decision="deny",
            reason="unknown soulkey",
            context={"source_ip": "192.168.1.100"},
        )
        await detector.check_event(event)

    anomalies = await detector.get_recent_anomalies(anomaly_type=AnomalyType.CREDENTIAL_STUFFING)
    assert len(anomalies) > 0
    assert anomalies[0].severity == SEVERITY_CRITICAL


@pytest.mark.asyncio
async def test_impossible_travel_detection():
    """Detect requests from different nodes faster than possible."""
    engine = BaselineEngine()
    engine._baselines[SOULKEY_ID] = _make_baseline()
    detector = AnomalyDetector(baseline_engine=engine)

    # Two events from different nodes within 1 second
    event1 = _make_audit_event(
        timestamp=NOW - timedelta(seconds=1),
        context={"node": "gcp-us-east"},
    )
    event2 = _make_audit_event(
        timestamp=NOW,
        context={"node": "aws-eu-west"},
    )

    await detector.check_event(event1)
    anomalies = await detector.check_event(event2)

    travel = [a for a in anomalies if a.type == AnomalyType.IMPOSSIBLE_TRAVEL]
    assert len(travel) == 1
    assert travel[0].severity == SEVERITY_CRITICAL


@pytest.mark.asyncio
async def test_detector_no_baseline_graceful():
    """Detector handles events for agents with no baseline gracefully."""
    engine = BaselineEngine()
    detector = AnomalyDetector(baseline_engine=engine)

    event = _make_audit_event(soulkey_id=uuid.uuid4())
    anomalies = await detector.check_event(event)

    # Should not crash; may return a low-severity new-resource note
    assert isinstance(anomalies, list)
    if anomalies:
        assert all(a.severity == SEVERITY_LOW for a in anomalies)


@pytest.mark.asyncio
async def test_multiple_simultaneous_anomalies():
    """A single event can trigger multiple anomaly types at once."""
    engine = BaselineEngine()
    engine._baselines[SOULKEY_ID] = _make_baseline(
        hours={9, 10, 11, 12, 13, 14, 15, 16, 17},
        resources={"memory"},
        scopes={"cs:algorithms"},
    )
    detector = AnomalyDetector(baseline_engine=engine)

    # Event at 3 AM, new resource, new scope — should trigger OFF_HOURS + NEW_RESOURCE + SCOPE_ESCALATION
    event = _make_audit_event(
        timestamp=NOW.replace(hour=3, minute=0, second=0),
        resource="mesh",
        scope="secrets:prod",
    )
    anomalies = await detector.check_event(event)

    types = {a.type for a in anomalies}
    assert AnomalyType.OFF_HOURS in types
    assert AnomalyType.NEW_RESOURCE in types
    assert AnomalyType.SCOPE_ESCALATION in types


# ---------------------------------------------------------------------------
# Alert routing tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_alert_routing_by_severity():
    """Alerts are routed to sinks based on severity."""
    router = AlertRouter(cooldown_seconds=0)
    high_sink = AsyncMock(spec=AlertSink)
    high_sink.send_alert = AsyncMock()

    # Register sink for high+ severity only
    router.add_sink(high_sink, min_severity=SEVERITY_HIGH)

    low_anomaly = Anomaly(
        type=AnomalyType.NEW_RESOURCE,
        severity=SEVERITY_LOW,
        soulkey_id=SOULKEY_ID,
        description="test low",
    )
    high_anomaly = Anomaly(
        type=AnomalyType.RATE_SPIKE,
        severity=SEVERITY_HIGH,
        soulkey_id=SOULKEY_ID_B,
        description="test high",
    )

    await router.route(low_anomaly)
    # High sink should NOT be called for low severity
    high_sink.send_alert.assert_not_called()

    await router.route(high_anomaly)
    # Now it should be called
    high_sink.send_alert.assert_called_once()


@pytest.mark.asyncio
async def test_alert_deduplication():
    """Same anomaly type for same agent is deduplicated within cooldown."""
    router = AlertRouter(cooldown_seconds=300)  # 5 min cooldown
    counter_sink = AsyncMock(spec=AlertSink)
    counter_sink.send_alert = AsyncMock()
    router.add_sink(counter_sink, min_severity=SEVERITY_HIGH)

    anomaly = Anomaly(
        type=AnomalyType.RATE_SPIKE,
        severity=SEVERITY_HIGH,
        soulkey_id=SOULKEY_ID,
        description="rate spike",
    )

    # First should send
    result1 = await router.route(anomaly)
    assert result1 is True

    # Second within cooldown should be deduplicated
    anomaly2 = Anomaly(
        type=AnomalyType.RATE_SPIKE,
        severity=SEVERITY_HIGH,
        soulkey_id=SOULKEY_ID,
        description="rate spike again",
    )
    result2 = await router.route(anomaly2)
    assert result2 is False


@pytest.mark.asyncio
async def test_alert_escalation():
    """After 3 occurrences in 15 minutes, severity is escalated."""
    router = AlertRouter(cooldown_seconds=0, escalation_count=3, escalation_window_seconds=900)
    sink = AsyncMock(spec=AlertSink)
    sink.send_alert = AsyncMock()
    router.add_sink(sink, min_severity=SEVERITY_LOW)

    for i in range(4):
        anomaly = Anomaly(
            type=AnomalyType.OFF_HOURS,
            severity=SEVERITY_MEDIUM,
            soulkey_id=SOULKEY_ID,
            description=f"off hours attempt {i}",
        )
        await router.route(anomaly)

    # The 3rd alert (index 2) should have been escalated
    calls = sink.send_alert.call_args_list
    escalated_found = False
    for call in calls:
        a = call[0][0]
        if "[ESCALATED" in a.description and a.severity == SEVERITY_HIGH:
            escalated_found = True
            break
    assert escalated_found, "Expected at least one escalated alert with high severity"


def test_severity_escalation():
    """_escalate_severity bumps up correctly."""
    assert _escalate_severity(SEVERITY_LOW) == SEVERITY_MEDIUM
    assert _escalate_severity(SEVERITY_MEDIUM) == SEVERITY_HIGH
    assert _escalate_severity(SEVERITY_HIGH) == SEVERITY_CRITICAL
    assert _escalate_severity(SEVERITY_CRITICAL) == SEVERITY_CRITICAL  # can't go higher


# ---------------------------------------------------------------------------
# Dashboard stats
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_dashboard_stats():
    """Dashboard returns stats grouped by type and severity."""
    engine = BaselineEngine()
    engine._baselines[SOULKEY_ID] = _make_baseline(
        resources={"memory"},
        scopes={"cs:algorithms"},
        hours={9, 10, 11, 12, 13, 14, 15, 16, 17},
    )
    detector = AnomalyDetector(baseline_engine=engine)

    # Generate some anomalies
    event = _make_audit_event(
        resource="mesh",
        scope="secrets:prod",
        timestamp=NOW.replace(hour=3),
    )
    await detector.check_event(event)

    stats = detector.get_dashboard_stats(hours=24)

    assert stats["total_anomalies"] > 0
    assert "by_type" in stats
    assert "by_severity" in stats
    assert "top_anomalous_agents" in stats
    assert stats["tracked_baselines"] == 1


# ---------------------------------------------------------------------------
# API endpoint tests (using FastAPI TestClient pattern)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_anomaly_list_endpoint():
    """GET /v1/analytics/anomalies returns recent anomalies."""
    from src.analytics._state import init_analytics, reset_analytics

    engine = BaselineEngine()
    engine._baselines[SOULKEY_ID] = _make_baseline(resources={"memory"})
    detector = AnomalyDetector(baseline_engine=engine)
    alert_router = AlertRouter()
    init_analytics(engine, detector, alert_router)

    try:
        # Generate an anomaly
        event = _make_audit_event(resource="mesh")
        await detector.check_event(event)

        from src.analytics.router import list_anomalies
        result = await list_anomalies(type=None, severity=None, soulkey_id=None, limit=50)

        assert "anomalies" in result
        assert result["count"] > 0
        assert result["anomalies"][0]["type"] == "new_resource"
    finally:
        reset_analytics()


@pytest.mark.asyncio
async def test_baseline_endpoint():
    """GET /v1/analytics/baseline/{soulkey_id} returns baseline."""
    from src.analytics._state import init_analytics, reset_analytics

    engine = BaselineEngine()
    baseline = _make_baseline()
    engine._baselines[SOULKEY_ID] = baseline
    detector = AnomalyDetector(baseline_engine=engine)
    alert_router = AlertRouter()
    init_analytics(engine, detector, alert_router)

    try:
        from src.analytics.router import get_baseline
        result = await get_baseline(str(SOULKEY_ID))

        assert "baseline" in result
        assert result["baseline"]["soulkey_id"] == str(SOULKEY_ID)
        assert result["baseline"]["typical_request_rate"] == 10.0
    finally:
        reset_analytics()


@pytest.mark.asyncio
async def test_baseline_endpoint_not_found():
    """GET /v1/analytics/baseline/{soulkey_id} returns 404 if no baseline."""
    from fastapi import HTTPException
    from src.analytics._state import init_analytics, reset_analytics

    engine = BaselineEngine()
    detector = AnomalyDetector(baseline_engine=engine)
    alert_router = AlertRouter()
    init_analytics(engine, detector, alert_router)

    try:
        from src.analytics.router import get_baseline
        with pytest.raises(HTTPException) as exc_info:
            await get_baseline(str(uuid.uuid4()))
        assert exc_info.value.status_code == 404
    finally:
        reset_analytics()


@pytest.mark.asyncio
async def test_dashboard_endpoint():
    """GET /v1/analytics/dashboard returns summary stats."""
    from src.analytics._state import init_analytics, reset_analytics

    engine = BaselineEngine()
    engine._baselines[SOULKEY_ID] = _make_baseline(resources={"memory"}, hours={9, 10, 11})
    detector = AnomalyDetector(baseline_engine=engine)
    alert_router = AlertRouter()
    init_analytics(engine, detector, alert_router)

    try:
        # Generate anomalies
        event = _make_audit_event(resource="mesh", timestamp=NOW.replace(hour=3))
        await detector.check_event(event)

        from src.analytics.router import dashboard
        result = await dashboard(hours=24)

        assert "total_anomalies" in result
        assert result["total_anomalies"] > 0
    finally:
        reset_analytics()


@pytest.mark.asyncio
async def test_anomaly_serialization():
    """Anomaly to_dict handles all field types."""
    anomaly = Anomaly(
        type=AnomalyType.SCOPE_ESCALATION,
        severity=SEVERITY_HIGH,
        soulkey_id=SOULKEY_ID,
        description="scope escalation test",
        evidence={"scope": "secrets:prod"},
        baseline_value={"cs:algorithms", "cs:data"},
        observed_value="secrets:prod",
    )
    d = anomaly.to_dict()

    assert d["type"] == "scope_escalation"
    assert d["severity"] == "high"
    assert isinstance(d["baseline_value"], list)  # set converted to sorted list
    assert d["observed_value"] == "secrets:prod"
