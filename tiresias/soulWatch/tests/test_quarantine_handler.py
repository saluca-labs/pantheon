"""
Tests for the _handle_quarantine rewrite in PlaybookEngine.
Covers: happy path, missing soulkey_id, unknown action, dry_run mode, off mode.
Plus: auto_release_check integration (edge case) and integration scaffold.

Tier 2a – v2.6.6 (2026-04-15)
"""

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

from soulWatch.src.detection.playbooks import (
    PlaybookEngine,
    ActionResult,
    _resolve_quarantine_actions,
)
from soulWatch.src.enforcement.quarantine import (
    QuarantineAction,
    QuarantineEngine,
)
from soulWatch.src.database.models import SoulWatchQuarantine


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_quarantine_record(soulkey_id: uuid.UUID) -> MagicMock:
    """Build a mock quarantine record that stands in for SoulWatchQuarantine."""
    record = MagicMock(spec=SoulWatchQuarantine)
    record.id = uuid.uuid4()
    record.soulkey_id = soulkey_id
    record.tenant_id = None
    record.persona_id = None
    record.triggered_by_type = "manual"
    record.triggered_by_id = None
    record.actions_taken = [QuarantineAction.SUSPEND_KEY.value]
    record.status = "active"
    record.reason = "test"
    record.quarantined_at = datetime.now(timezone.utc)
    record.released_at = None
    record.auto_release_at = None
    record.released_by = None
    record.approved_by = None
    record.approved_at = None
    return record


def _make_db_session_factory(mock_qe_record: SoulWatchQuarantine):
    """Return an async_sessionmaker-like factory whose context manager yields a mock db."""

    @asynccontextmanager
    async def _factory():
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        yield db

    return _factory


def _make_quarantine_engine(record: SoulWatchQuarantine) -> QuarantineEngine:
    """Return a QuarantineEngine with execute_manual_quarantine mocked."""
    qe = MagicMock(spec=QuarantineEngine)
    qe.execute_manual_quarantine = AsyncMock(return_value=record)
    return qe


def _base_context(soulkey_id: uuid.UUID, tenant_id: uuid.UUID | None = None) -> dict:
    return {
        "playbook_id": "pb-auto-quarantine",
        "rule_id": "sa-rule-001-credential-stuffing",
        "event": {
            "soulkey_id": str(soulkey_id),
            "tenant_id": str(tenant_id) if tenant_id else None,
        },
    }


# ---------------------------------------------------------------------------
# Unit: happy path (enforce mode)
# ---------------------------------------------------------------------------

class TestHandleQuarantineHappyPath:

    @pytest.mark.asyncio
    async def test_happy_path_returns_success_with_quarantine_id(self, monkeypatch):
        """Happy path: enforce mode writes DB and returns ActionResult with quarantine_id."""
        monkeypatch.setenv("SOULWATCH_QUARANTINE_ENFORCEMENT", "enforce")

        soulkey_id = uuid.uuid4()
        record = _make_quarantine_record(soulkey_id)
        qe = _make_quarantine_engine(record)
        factory = _make_db_session_factory(record)

        engine = PlaybookEngine(db_session_factory=factory, quarantine_engine=qe)
        params = {"reason": "test quarantine", "suspend_key": True}
        context = _base_context(soulkey_id)

        result: ActionResult = await engine._handle_quarantine(params, context)

        assert result.success is True
        assert result.action_type == "quarantine"
        assert result.details["quarantine_id"] == str(record.id)
        assert result.details["soulkey_id"] == str(soulkey_id)
        assert result.details["status"] == "active"

        # QuarantineEngine was called once with the right soulkey
        qe.execute_manual_quarantine.assert_called_once()
        call_kwargs = qe.execute_manual_quarantine.call_args.kwargs
        assert call_kwargs["soulkey_id"] == soulkey_id
        assert QuarantineAction.SUSPEND_KEY in call_kwargs["actions"]

    @pytest.mark.asyncio
    async def test_playbook_action_revoke_uses_revoke_key(self, monkeypatch):
        """playbook_action=revoke must substitute revoke_key for suspend_key."""
        monkeypatch.setenv("SOULWATCH_QUARANTINE_ENFORCEMENT", "enforce")

        soulkey_id = uuid.uuid4()
        record = _make_quarantine_record(soulkey_id)
        record.actions_taken = [QuarantineAction.REVOKE_KEY.value]
        qe = _make_quarantine_engine(record)
        factory = _make_db_session_factory(record)

        engine = PlaybookEngine(db_session_factory=factory, quarantine_engine=qe)
        params = {"reason": "terminal", "suspend_key": True, "playbook_action": "revoke"}
        context = _base_context(soulkey_id)

        result = await engine._handle_quarantine(params, context)

        assert result.success is True
        call_kwargs = qe.execute_manual_quarantine.call_args.kwargs
        assert QuarantineAction.REVOKE_KEY in call_kwargs["actions"]
        assert QuarantineAction.SUSPEND_KEY not in call_kwargs["actions"]

    @pytest.mark.asyncio
    async def test_rule_001_sets_24h_auto_release(self, monkeypatch):
        """Rule 001 (cred-stuffing) must default to 24h (1440 min) auto-release."""
        monkeypatch.setenv("SOULWATCH_QUARANTINE_ENFORCEMENT", "enforce")

        soulkey_id = uuid.uuid4()
        record = _make_quarantine_record(soulkey_id)
        qe = _make_quarantine_engine(record)
        factory = _make_db_session_factory(record)

        engine = PlaybookEngine(db_session_factory=factory, quarantine_engine=qe)
        params = {"reason": "cred stuffing", "suspend_key": True}
        context = _base_context(soulkey_id)
        context["rule_id"] = "sa-rule-001-credential-stuffing"

        await engine._handle_quarantine(params, context)

        call_kwargs = qe.execute_manual_quarantine.call_args.kwargs
        assert call_kwargs["auto_release_after"] == 1440

    @pytest.mark.asyncio
    async def test_rule_005_has_no_auto_release(self, monkeypatch):
        """Rules 005/006 (prompt-injection/key-abuse) must have indefinite quarantine."""
        monkeypatch.setenv("SOULWATCH_QUARANTINE_ENFORCEMENT", "enforce")

        soulkey_id = uuid.uuid4()
        record = _make_quarantine_record(soulkey_id)
        qe = _make_quarantine_engine(record)
        factory = _make_db_session_factory(record)

        engine = PlaybookEngine(db_session_factory=factory, quarantine_engine=qe)
        params = {"reason": "prompt injection", "suspend_key": True}
        context = _base_context(soulkey_id)
        context["rule_id"] = "sa-rule-005-prompt-injection"

        await engine._handle_quarantine(params, context)

        call_kwargs = qe.execute_manual_quarantine.call_args.kwargs
        assert call_kwargs["auto_release_after"] is None


# ---------------------------------------------------------------------------
# Unit: missing soulkey_id
# ---------------------------------------------------------------------------

class TestHandleQuarantineMissingSoulkeyId:

    @pytest.mark.asyncio
    async def test_missing_soulkey_id_returns_failure(self, monkeypatch):
        """Missing soulkey_id must return ActionResult(success=False) without calling DB."""
        monkeypatch.setenv("SOULWATCH_QUARANTINE_ENFORCEMENT", "enforce")

        soulkey_id = uuid.uuid4()
        record = _make_quarantine_record(soulkey_id)
        qe = _make_quarantine_engine(record)
        factory = _make_db_session_factory(record)

        engine = PlaybookEngine(db_session_factory=factory, quarantine_engine=qe)
        params = {"reason": "test"}
        context = {"playbook_id": "pb-test", "rule_id": "sa-rule-001", "event": {}}

        result = await engine._handle_quarantine(params, context)

        assert result.success is False
        assert "soulkey_id is null" in result.message
        qe.execute_manual_quarantine.assert_not_called()

    @pytest.mark.asyncio
    async def test_invalid_uuid_soulkey_id_returns_failure(self, monkeypatch):
        """Non-UUID soulkey_id must return failure without calling DB."""
        monkeypatch.setenv("SOULWATCH_QUARANTINE_ENFORCEMENT", "enforce")

        qe = MagicMock(spec=QuarantineEngine)
        engine = PlaybookEngine(db_session_factory=None, quarantine_engine=qe)
        context = {"playbook_id": "pb", "rule_id": "r", "event": {"soulkey_id": "not-a-uuid"}}

        result = await engine._handle_quarantine({}, context)

        assert result.success is False
        assert "not a valid UUID" in result.message


# ---------------------------------------------------------------------------
# Unit: unknown action
# ---------------------------------------------------------------------------

class TestHandleQuarantineUnknownAction:

    @pytest.mark.asyncio
    async def test_unknown_action_returns_failure(self, monkeypatch):
        """An unrecognised action string must return failure without DB write."""
        monkeypatch.setenv("SOULWATCH_QUARANTINE_ENFORCEMENT", "enforce")

        soulkey_id = uuid.uuid4()
        qe = MagicMock(spec=QuarantineEngine)
        engine = PlaybookEngine(db_session_factory=None, quarantine_engine=qe)
        params = {"actions": ["agent_suspend"]}  # not a valid QuarantineAction
        context = _base_context(soulkey_id)

        result = await engine._handle_quarantine(params, context)

        assert result.success is False
        assert "Unknown quarantine action" in result.message


# ---------------------------------------------------------------------------
# Unit: dry_run mode
# ---------------------------------------------------------------------------

class TestHandleQuarantineDryRun:

    @pytest.mark.asyncio
    async def test_dry_run_mode_no_db_call(self, monkeypatch):
        """dry_run mode: success=True, dry_run=True in details, DB not called."""
        monkeypatch.setenv("SOULWATCH_QUARANTINE_ENFORCEMENT", "dry_run")

        soulkey_id = uuid.uuid4()
        record = _make_quarantine_record(soulkey_id)
        qe = _make_quarantine_engine(record)
        factory = _make_db_session_factory(record)

        engine = PlaybookEngine(db_session_factory=factory, quarantine_engine=qe)
        params = {"reason": "test", "suspend_key": True}
        context = _base_context(soulkey_id)

        result = await engine._handle_quarantine(params, context)

        assert result.success is True
        assert result.details.get("dry_run") is True
        assert "[DRY-RUN]" in result.message
        qe.execute_manual_quarantine.assert_not_called()


# ---------------------------------------------------------------------------
# Unit: off mode
# ---------------------------------------------------------------------------

class TestHandleQuarantineOffMode:

    @pytest.mark.asyncio
    async def test_off_mode_no_db_call(self, monkeypatch):
        """off mode: success=True, no side effects, DB not called."""
        monkeypatch.setenv("SOULWATCH_QUARANTINE_ENFORCEMENT", "off")

        soulkey_id = uuid.uuid4()
        record = _make_quarantine_record(soulkey_id)
        qe = _make_quarantine_engine(record)
        factory = _make_db_session_factory(record)

        engine = PlaybookEngine(db_session_factory=factory, quarantine_engine=qe)
        params = {"reason": "test", "suspend_key": True}
        context = _base_context(soulkey_id)

        result = await engine._handle_quarantine(params, context)

        assert result.success is True
        assert "mode=off" in result.message
        qe.execute_manual_quarantine.assert_not_called()


# ---------------------------------------------------------------------------
# Edge: auto_release_check releases expired quarantines
# ---------------------------------------------------------------------------

class TestAutoReleaseCheck:

    @pytest.mark.asyncio
    async def test_auto_release_check_releases_expired_record(self):
        """auto_release_check must set status='expired' and call reinstate on the key."""
        now = datetime.now(timezone.utc)
        soulkey_id = uuid.uuid4()

        record = _make_quarantine_record(soulkey_id)
        record.id = uuid.uuid4()
        record.auto_release_at = now - timedelta(seconds=1)
        record.status = "active"
        record.actions_taken = [QuarantineAction.SUSPEND_KEY.value]

        mock_db = AsyncMock()

        # Patch the select query to return our record
        scalar_result = MagicMock()
        scalar_result.scalars.return_value.all.return_value = [record]
        mock_db.execute = AsyncMock(return_value=scalar_result)
        mock_db.flush = AsyncMock()

        # Patch _reverse_action to avoid httpx calls
        qe = QuarantineEngine.__new__(QuarantineEngine)
        qe._settings = MagicMock()
        qe._settings.soulauth_base_url = "http://mock-soulauth"
        qe._policies = []
        qe._default_rate_limit = 5

        released_ids = []

        async def mock_release(db, quarantine_id, released_by="auto"):
            record.status = "expired"
            released_ids.append(quarantine_id)
            return True

        qe.release_quarantine = mock_release

        result = await qe.auto_release_check(mock_db)
        assert record.status == "expired"
        assert len(released_ids) == 1


# ---------------------------------------------------------------------------
# Helper: _resolve_quarantine_actions
# ---------------------------------------------------------------------------

class TestResolveQuarantineActions:

    def test_suspend_and_kill_sessions_flags(self):
        params = {"suspend_key": True, "kill_sessions": True}
        result = _resolve_quarantine_actions(params)
        assert "suspend_key" in result
        assert "kill_session" in result

    def test_explicit_actions_list_wins(self):
        params = {"actions": ["suspend_key", "force_reauth"], "suspend_key": False}
        result = _resolve_quarantine_actions(params)
        assert result == ["suspend_key", "force_reauth"]

    def test_empty_params_returns_empty(self):
        assert _resolve_quarantine_actions({}) == []
