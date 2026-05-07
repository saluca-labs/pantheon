"""
Tests for Aletheia persistence handlers in the SoulWatch pipeline.

Covers:
- _handle_tool_invocation: persists tool_invocation events to aletheia_tool_invocations
- _handle_cot_event: persists cot_turn events to aletheia_cot_chain
- Missing tenant_id: WARN + no insert (returns persisted=False)
- process_event routing: both event types reach the correct handler
"""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_tool_event(
    tenant_id=None,
    invocation_id=None,
    command="bash",
    args=None,
):
    tid = tenant_id or str(uuid.uuid4())
    return {
        "event_type": "tool_invocation",
        "version": "1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent_id": "agent-test-001",
        "tenant_id": tid,
        "invocation_id": invocation_id or f"inv_{uuid.uuid4().hex[:12]}",
        "command": command,
        "args": args or ["--version"],
        "full_command": f"{command} --version",
        "working_directory": "/tmp",
        "execution": {
            "exit_code": 0,
            "duration_ms": 42,
            "stdout_bytes": 10,
            "stderr_bytes": 0,
        },
        "policy": {"evaluated": True, "verdict": "allow", "rules_matched": []},
        "sanitizer": {"mode": "passthrough", "verdict": "skipped", "patterns_matched": []},
    }


def _make_cot_event(
    tenant_id=None,
    chain_id=None,
    entry_index=0,
    cot_content="I should think about this carefully...",
    prev_hash=None,
):
    tid = tenant_id or str(uuid.uuid4())
    return {
        "event_type": "cot_turn",
        "version": "1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "tenant_id": tid,
        "agent_id": "agent-test-001",
        "chain_id": chain_id or str(uuid.uuid4()),
        "entry_index": entry_index,
        "request_id": str(uuid.uuid4()),
        "model": "claude-opus-4",
        "provider": "anthropic",
        "cot_content": cot_content,
        "cot_token_count": max(1, len(cot_content) // 4),
        "prev_hash": prev_hash or "0" * 64,
    }


# ---------------------------------------------------------------------------
# Unit tests for _handle_tool_invocation
# ---------------------------------------------------------------------------


class TestHandleToolInvocation:

    @pytest.mark.asyncio
    async def test_persists_tool_event(self):
        """A valid tool_invocation event should execute an INSERT statement."""
        from soulWatch.src.pipeline.processor import _handle_tool_invocation

        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock())

        event = _make_tool_event()
        result = await _handle_tool_invocation(event, db)

        assert result["persisted"] is True
        assert "invocation_id" in result
        db.execute.assert_called_once()

        # Verify the SQL contains ON CONFLICT DO NOTHING
        call_args = db.execute.call_args[0]
        stmt_text = str(call_args[0].text) if hasattr(call_args[0], "text") else str(call_args[0])
        assert "ON CONFLICT" in stmt_text
        assert "DO NOTHING" in stmt_text

    @pytest.mark.asyncio
    async def test_missing_tenant_id_returns_no_persist(self):
        """When tenant_id is absent, handler must WARN and not insert."""
        from soulWatch.src.pipeline.processor import _handle_tool_invocation

        db = AsyncMock()

        event = _make_tool_event()
        event.pop("tenant_id")

        with patch("soulWatch.src.pipeline.processor.logger") as mock_log:
            result = await _handle_tool_invocation(event, db)

        assert result["persisted"] is False
        assert result["reason"] == "missing_tenant_id"
        db.execute.assert_not_called()
        mock_log.warning.assert_called_once()

    @pytest.mark.asyncio
    async def test_none_tenant_id_returns_no_persist(self):
        """When tenant_id is None, handler must WARN and not insert."""
        from soulWatch.src.pipeline.processor import _handle_tool_invocation

        db = AsyncMock()

        event = _make_tool_event()
        event["tenant_id"] = None

        with patch("soulWatch.src.pipeline.processor.logger") as mock_log:
            result = await _handle_tool_invocation(event, db)

        assert result["persisted"] is False
        assert result["reason"] == "missing_tenant_id"
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_uses_provided_invocation_id(self):
        """The invocation_id from the event should be forwarded to the INSERT."""
        from soulWatch.src.pipeline.processor import _handle_tool_invocation

        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock())

        inv_id = f"inv_explicit_{uuid.uuid4().hex[:8]}"
        event = _make_tool_event(invocation_id=inv_id)
        result = await _handle_tool_invocation(event, db)

        assert result["invocation_id"] == inv_id

        params = db.execute.call_args[0][1]
        assert params["invocation_id"] == inv_id

    @pytest.mark.asyncio
    async def test_args_serialized_as_json(self):
        """args list must be JSON-serialised before passing to the SQL parameter."""
        from soulWatch.src.pipeline.processor import _handle_tool_invocation

        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock())

        event = _make_tool_event(args=["--flag", "--value=42"])
        await _handle_tool_invocation(event, db)

        params = db.execute.call_args[0][1]
        # args param is a JSON string, not a list
        parsed = json.loads(params["args"])
        assert parsed == ["--flag", "--value=42"]


# ---------------------------------------------------------------------------
# Unit tests for _handle_cot_event
# ---------------------------------------------------------------------------


class TestHandleCotEvent:

    @pytest.mark.asyncio
    async def test_persists_cot_event(self):
        """A valid cot_turn event should execute an INSERT statement."""
        from soulWatch.src.pipeline.processor import _handle_cot_event

        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock())

        event = _make_cot_event()
        result = await _handle_cot_event(event, db)

        assert result["persisted"] is True
        assert "chain_id" in result
        assert "entry_hash" in result
        assert result["entry_index"] == 0
        db.execute.assert_called_once()

        call_args = db.execute.call_args[0]
        stmt_text = str(call_args[0].text) if hasattr(call_args[0], "text") else str(call_args[0])
        assert "ON CONFLICT" in stmt_text
        assert "DO NOTHING" in stmt_text

    @pytest.mark.asyncio
    async def test_missing_tenant_id_returns_no_persist(self):
        """When tenant_id is absent, handler must WARN and not insert."""
        from soulWatch.src.pipeline.processor import _handle_cot_event

        db = AsyncMock()

        event = _make_cot_event()
        event.pop("tenant_id")

        with patch("soulWatch.src.pipeline.processor.logger") as mock_log:
            result = await _handle_cot_event(event, db)

        assert result["persisted"] is False
        assert result["reason"] == "missing_tenant_id"
        db.execute.assert_not_called()
        mock_log.warning.assert_called_once()

    @pytest.mark.asyncio
    async def test_none_tenant_id_returns_no_persist(self):
        """When tenant_id is None, handler must WARN and not insert."""
        from soulWatch.src.pipeline.processor import _handle_cot_event

        db = AsyncMock()

        event = _make_cot_event()
        event["tenant_id"] = None

        with patch("soulWatch.src.pipeline.processor.logger") as mock_log:
            result = await _handle_cot_event(event, db)

        assert result["persisted"] is False
        assert result["reason"] == "missing_tenant_id"
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_hash_chain_is_deterministic(self):
        """Given same inputs, cot_hash and entry_hash must be identical."""
        from soulWatch.src.pipeline.processor import _compute_cot_hashes

        args = dict(
            tenant_id=str(uuid.uuid4()),
            chain_id=str(uuid.uuid4()),
            entry_index=0,
            request_id=str(uuid.uuid4()),
            timestamp="2026-04-14T12:00:00+00:00",
            model="claude-opus-4",
            provider="anthropic",
            cot_content="Let me think step by step.",
            prev_hash="0" * 64,
        )

        cot_hash_1, entry_hash_1 = _compute_cot_hashes(**args)
        cot_hash_2, entry_hash_2 = _compute_cot_hashes(**args)

        assert cot_hash_1 == cot_hash_2
        assert entry_hash_1 == entry_hash_2

    @pytest.mark.asyncio
    async def test_different_content_yields_different_hashes(self):
        """Different CoT content must yield different cot_hash values."""
        from soulWatch.src.pipeline.processor import _compute_cot_hashes

        base_args = dict(
            tenant_id=str(uuid.uuid4()),
            chain_id=str(uuid.uuid4()),
            entry_index=0,
            request_id=str(uuid.uuid4()),
            timestamp="2026-04-14T12:00:00+00:00",
            model="claude-opus-4",
            provider="anthropic",
            prev_hash="0" * 64,
        )

        cot_hash_a, _ = _compute_cot_hashes(**{**base_args, "cot_content": "Thinking A"})
        cot_hash_b, _ = _compute_cot_hashes(**{**base_args, "cot_content": "Thinking B"})

        assert cot_hash_a != cot_hash_b

    @pytest.mark.asyncio
    async def test_entry_hash_includes_prev_hash(self):
        """entry_hash must change when prev_hash changes (chain linkage)."""
        from soulWatch.src.pipeline.processor import _compute_cot_hashes

        base_args = dict(
            tenant_id=str(uuid.uuid4()),
            chain_id=str(uuid.uuid4()),
            entry_index=1,
            request_id=str(uuid.uuid4()),
            timestamp="2026-04-14T12:00:00+00:00",
            model="claude-opus-4",
            provider="anthropic",
            cot_content="Consistent reasoning content",
        )

        _, entry_hash_a = _compute_cot_hashes(**{**base_args, "prev_hash": "a" * 64})
        _, entry_hash_b = _compute_cot_hashes(**{**base_args, "prev_hash": "b" * 64})

        assert entry_hash_a != entry_hash_b

    @pytest.mark.asyncio
    async def test_params_passed_to_db_execute(self):
        """Key params (chain_id, entry_index, tenant_id) must be forwarded to DB."""
        from soulWatch.src.pipeline.processor import _handle_cot_event

        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock())

        tid = str(uuid.uuid4())
        cid = str(uuid.uuid4())
        event = _make_cot_event(tenant_id=tid, chain_id=cid, entry_index=3)

        result = await _handle_cot_event(event, db)

        assert result["entry_index"] == 3

        params = db.execute.call_args[0][1]
        assert params["entry_index"] == 3
        assert params["tenant_id"] == tid
        assert str(params["chain_id"]) == cid


# ---------------------------------------------------------------------------
# Integration-level: process_event routing
# ---------------------------------------------------------------------------


class TestProcessEventRouting:

    @pytest.mark.asyncio
    async def test_process_event_routes_tool_invocation(self):
        """process_event must call _handle_tool_invocation for tool_invocation events."""
        with (
            patch("soulWatch.src.pipeline.processor._handle_tool_invocation", new_callable=AsyncMock) as mock_tool,
            patch("soulWatch.src.pipeline.processor._handle_cot_event", new_callable=AsyncMock) as mock_cot,
            patch("soulWatch.src.pipeline.processor.get_detector", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_sigma_engine", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_alert_router", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_playbook_engine", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_event_forwarder", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_geo_enricher") as mock_geo,
        ):
            mock_geo.return_value.enabled = False
            mock_tool.return_value = {"persisted": True, "invocation_id": "inv_test"}

            db = AsyncMock()
            db.flush = AsyncMock()

            from soulWatch.src.pipeline.processor import process_event
            event = _make_tool_event()
            result = await process_event(event, db)

            mock_tool.assert_called_once_with(event, db)
            mock_cot.assert_not_called()
            assert "tool_invocation" in result

    @pytest.mark.asyncio
    async def test_process_event_routes_cot_turn(self):
        """process_event must call _handle_cot_event for cot_turn events."""
        with (
            patch("soulWatch.src.pipeline.processor._handle_tool_invocation", new_callable=AsyncMock) as mock_tool,
            patch("soulWatch.src.pipeline.processor._handle_cot_event", new_callable=AsyncMock) as mock_cot,
            patch("soulWatch.src.pipeline.processor.get_detector", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_sigma_engine", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_alert_router", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_playbook_engine", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_event_forwarder", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_geo_enricher") as mock_geo,
        ):
            mock_geo.return_value.enabled = False
            mock_cot.return_value = {
                "persisted": True,
                "chain_id": str(uuid.uuid4()),
                "entry_index": 0,
                "entry_hash": "abc" * 21 + "a",
            }

            db = AsyncMock()
            db.flush = AsyncMock()

            from soulWatch.src.pipeline.processor import process_event
            event = _make_cot_event()
            result = await process_event(event, db)

            mock_cot.assert_called_once_with(event, db)
            mock_tool.assert_not_called()
            assert "cot_turn" in result

    @pytest.mark.asyncio
    async def test_process_event_other_type_skips_aletheia(self):
        """For non-aletheia event types, neither aletheia handler should be called."""
        with (
            patch("soulWatch.src.pipeline.processor._handle_tool_invocation", new_callable=AsyncMock) as mock_tool,
            patch("soulWatch.src.pipeline.processor._handle_cot_event", new_callable=AsyncMock) as mock_cot,
            patch("soulWatch.src.pipeline.processor.get_detector", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_sigma_engine", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_alert_router", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_playbook_engine", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_event_forwarder", return_value=None),
            patch("soulWatch.src.pipeline.processor.get_geo_enricher") as mock_geo,
        ):
            mock_geo.return_value.enabled = False

            db = AsyncMock()
            db.flush = AsyncMock()

            from soulWatch.src.pipeline.processor import process_event
            event = {"event_type": "auth_deny", "tenant_id": str(uuid.uuid4())}
            await process_event(event, db)

            mock_tool.assert_not_called()
            mock_cot.assert_not_called()
