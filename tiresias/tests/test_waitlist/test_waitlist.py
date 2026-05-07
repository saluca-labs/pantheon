"""Tests for beta waitlist functionality."""

import uuid
import pytest
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.models import Waitlist


class TestWaitlistModel:
    """Test Waitlist ORM model."""

    async def test_create_waitlist_entry(self, db_session: AsyncSession):
        entry = Waitlist(
            contact_name="Jane Smith",
            contact_email="jane@acme.com",
            company_name="Acme Corp",
            company_domain="acme.com",
            use_case="Securing our AI agent fleet",
            status="pending",
        )
        db_session.add(entry)
        await db_session.flush()
        await db_session.refresh(entry)

        assert entry.id is not None
        assert isinstance(entry.id, uuid.UUID)
        assert entry.contact_name == "Jane Smith"
        assert entry.contact_email == "jane@acme.com"
        assert entry.company_name == "Acme Corp"
        assert entry.company_domain == "acme.com"
        assert entry.use_case == "Securing our AI agent fleet"
        assert entry.status == "pending"
        assert entry.created_at is not None
        assert entry.invited_at is None

    async def test_waitlist_email_unique(self, db_session: AsyncSession):
        entry1 = Waitlist(
            contact_name="Jane Smith",
            contact_email="jane@acme.com",
            company_name="Acme Corp",
            company_domain="acme.com",
        )
        db_session.add(entry1)
        await db_session.flush()

        entry2 = Waitlist(
            contact_name="Jane Doe",
            contact_email="jane@acme.com",
            company_name="Other Corp",
            company_domain="other.com",
        )
        db_session.add(entry2)
        with pytest.raises(Exception):  # IntegrityError
            await db_session.flush()

    async def test_waitlist_position_counting(self, db_session: AsyncSession):
        for i in range(5):
            entry = Waitlist(
                contact_name=f"User {i}",
                contact_email=f"user{i}@test.com",
                company_name=f"Company {i}",
                company_domain=f"company{i}.com",
                status="pending",
            )
            db_session.add(entry)
        await db_session.flush()

        count = await db_session.execute(
            select(func.count(Waitlist.id)).where(Waitlist.status == "pending")
        )
        assert count.scalar() == 5

    async def test_waitlist_use_case_optional(self, db_session: AsyncSession):
        entry = Waitlist(
            contact_name="Bob",
            contact_email="bob@test.com",
            company_name="Test Inc",
            company_domain="test.com",
        )
        db_session.add(entry)
        await db_session.flush()
        await db_session.refresh(entry)

        assert entry.use_case is None
        assert entry.status == "pending"
