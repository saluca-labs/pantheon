"""
Tests for SoulWatch anomaly detection engine.
"""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from soulWatch.src.analytics.detector import (
    AnomalyDetector,
    AnomalyType,
    SEVERITY_LOW,
    SEVERITY_MEDIUM,
    SEVERITY_HIGH,
    SEVERITY_CRITICAL,
)
from soulWatch.src.analytics.baseline import AgentBaseline, BaselineEngine


@pytest.fixture
def baseline_engine():
    return BaselineEngine()


@pytest.fixture
def detector(baseline_engine):
    return AnomalyDetector(baseline_engine=baseline_engine)


@pytest.fixture
def sample_soulkey_id():
    return uuid.uuid4()


@pytest.fixture
def sample_baseline(sample_soulkey_id):
    return AgentBaseline(
        soulkey_id=sample_soulkey_id,
        typical_request_rate=10.0,
        typical_resources={"api/data", "api/users"},
        typical_actions={"read", "list"},
        typical_scopes={"data:read", "users:read"},
        typical_hours={9, 10, 11, 12, 13, 14, 15, 16, 17},
        typical_denial_rate=0.05,
        typical_burst_size=10,
    )


class TestAnomalyDetector:
    """Test the anomaly detection engine."""

    @pytest.mark.asyncio
    async def test_new_agent_detected(self, detector, sample_soulkey_id):
        """New agent with no baseline should generate low-severity anomaly."""
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()

        event = {
            "soulkey_id": str(sample_soulkey_id),
            "event_type": "auth_grant",
            "resource": "api/data",
            "action": "read",
            "decision": "allow",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        anomalies = await detector.check_event(event, db)
        assert len(anomalies) == 1
        assert anomalies[0].type == AnomalyType.NEW_RESOURCE
        assert anomalies[0].severity == SEVERITY_LOW

    @pytest.mark.asyncio
    async def test_off_hours_detection(self, detector, baseline_engine, sample_baseline):
        """Activity outside typical hours should be detected."""
        baseline_engine._baselines[sample_baseline.soulkey_id] = sample_baseline

        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()

        # 3 AM UTC - outside typical hours (9-17)
        off_hour_time = datetime.now(timezone.utc).replace(hour=3, minute=0)

        event = {
            "soulkey_id": str(sample_baseline.soulkey_id),
            "event_type": "auth_grant",
            "resource": "api/data",
            "action": "read",
            "decision": "allow",
            "timestamp": off_hour_time.isoformat(),
        }

        anomalies = await detector.check_event(event, db)
        anomaly_types = [a.type for a in anomalies]
        assert AnomalyType.OFF_HOURS in anomaly_types

    @pytest.mark.asyncio
    async def test_new_resource_detection(self, detector, baseline_engine, sample_baseline):
        """Accessing an unfamiliar resource should be detected."""
        baseline_engine._baselines[sample_baseline.soulkey_id] = sample_baseline

        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()

        event = {
            "soulkey_id": str(sample_baseline.soulkey_id),
            "event_type": "auth_grant",
            "resource": "admin/secrets",  # Not in baseline
            "action": "read",
            "decision": "allow",
            "timestamp": datetime.now(timezone.utc).replace(hour=10).isoformat(),
        }

        anomalies = await detector.check_event(event, db)
        anomaly_types = [a.type for a in anomalies]
        assert AnomalyType.NEW_RESOURCE in anomaly_types

    @pytest.mark.asyncio
    async def test_scope_escalation_detection(self, detector, baseline_engine, sample_baseline):
        """Requesting a new scope should be flagged as scope escalation."""
        baseline_engine._baselines[sample_baseline.soulkey_id] = sample_baseline

        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()

        event = {
            "soulkey_id": str(sample_baseline.soulkey_id),
            "event_type": "auth_grant",
            "resource": "api/data",
            "action": "read",
            "scope": "admin:write",  # Not in baseline
            "decision": "allow",
            "timestamp": datetime.now(timezone.utc).replace(hour=10).isoformat(),
        }

        anomalies = await detector.check_event(event, db)
        anomaly_types = [a.type for a in anomalies]
        assert AnomalyType.SCOPE_ESCALATION in anomaly_types
        # Should be high severity
        escalation = [a for a in anomalies if a.type == AnomalyType.SCOPE_ESCALATION]
        assert escalation[0].severity == SEVERITY_HIGH

    @pytest.mark.asyncio
    async def test_credential_stuffing_detection(self, detector):
        """Multiple failed auth attempts should trigger credential stuffing detection."""
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()

        # Override threshold to 3 for testing
        detector._thresholds[AnomalyType.CREDENTIAL_STUFFING] = 3

        for i in range(4):
            event = {
                "event_type": "auth_deny",
                "decision": "deny",
                "reason": f"Invalid key {i}",
                "context": {"source_ip": "10.0.0.1"},
            }
            anomalies = await detector.check_event(event, db)

        # The 3rd+ attempts should trigger
        assert len(anomalies) > 0
        assert anomalies[0].type == AnomalyType.CREDENTIAL_STUFFING
        assert anomalies[0].severity == SEVERITY_CRITICAL

    @pytest.mark.asyncio
    async def test_no_anomaly_for_normal_behavior(self, detector, baseline_engine, sample_baseline):
        """Normal behavior within baseline should not trigger anomalies."""
        baseline_engine._baselines[sample_baseline.soulkey_id] = sample_baseline

        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()

        event = {
            "soulkey_id": str(sample_baseline.soulkey_id),
            "event_type": "auth_grant",
            "resource": "api/data",
            "action": "read",
            "scope": "data:read",
            "decision": "allow",
            "timestamp": datetime.now(timezone.utc).replace(hour=10).isoformat(),
        }

        anomalies = await detector.check_event(event, db)
        assert len(anomalies) == 0

    @pytest.mark.asyncio
    async def test_anomaly_persistence(self, detector, sample_soulkey_id):
        """Anomalies should be persisted to the database."""
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()

        event = {
            "soulkey_id": str(sample_soulkey_id),
            "event_type": "auth_grant",
            "resource": "api/data",
            "action": "read",
            "decision": "allow",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        anomalies = await detector.check_event(event, db)
        if anomalies:
            # db.add should have been called for each anomaly
            assert db.add.called
            assert db.flush.called
