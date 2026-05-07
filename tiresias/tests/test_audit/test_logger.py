"""
Tests for audit event logging.
"""
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.pool import StaticPool

from src.database.connection import Base
from src.database.models import AuditLog
from src.audit.logger import log_auth_event, query_audit_log


@pytest.mark.asyncio
async def test_log_auth_event(db_session):
    """Test logging an audit event."""
    tenant_id = uuid.uuid4()
    soulkey_id = uuid.uuid4()

    # Log the event
    async with db_session as session:
        audit_id = await log_auth_event(
            db=session,
            tenant_id=tenant_id,
            event_type="auth_grant",
            soulkey_id=soulkey_id,
            persona_id="alfred",
            resource="memory",
            action="read",
            scope="cs:algorithms",
            decision="grant",
            reason="test",
            capability_id=uuid.uuid4(),
            context={"test": "value"},
        )
        await session.commit()

    assert isinstance(audit_id, uuid.UUID)

    # Query the audit log
    async with db_session as session:
        events = await query_audit_log(session, tenant_id=tenant_id)
        assert len(events) == 1
        event = events[0]
        assert event.event_type == "auth_grant"
        assert event.soulkey_id == soulkey_id
        assert event.id == audit_id


@pytest.mark.asyncio
async def test_query_audit_log_with_filters(db_session):
    """Test querying audit log with various filters."""
    tenant_id = uuid.uuid4()
    another_tenant = uuid.uuid4()

    # Log events for two different tenants using the same session
    async with db_session as session:
        grant_event_1 = await log_auth_event(
            db=session,
            tenant_id=tenant_id,
            event_type="auth_grant",
            soulkey_id=uuid.uuid4(),
            persona_id="alfred",
            resource="memory",
            action="read",
            scope="cs:algorithms",
            decision="grant",
            reason="test",
        )
        await log_auth_event(
            db=session,
            tenant_id=another_tenant,
            event_type="auth_grant",
            soulkey_id=uuid.uuid4(),
            persona_id="alfred",
            resource="memory",
            action="read",
            scope="cs:algorithms",
            decision="grant",
            reason="test",
        )
        await log_auth_event(
            db=session,
            tenant_id=tenant_id,
            event_type="auth_deny",
            soulkey_id=uuid.uuid4(),
            persona_id="alfred",
            resource="memory",
            action="write",
            scope="cs:algorithms",
            decision="deny",
            reason="test",
        )
        await session.commit()

    # Query by tenant
    events = await query_audit_log(db_session, tenant_id=tenant_id)
    assert len(events) == 2  # grant and deny

    # Query by event type
    events = await query_audit_log(db_session, tenant_id=tenant_id, event_type="auth_grant")
    assert len(events) == 1
    assert events[0].event_type == "auth_grant"

    # Query by multiple filters (using available parameters)
    events = await query_audit_log(
        db_session,
        tenant_id=tenant_id,
        event_type="auth_grant",
    )
    assert len(events) == 1