"""
Tests for trial registration, verification, and activation.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio

from src.trial.service import (
    register_trial,
    verify_trial,
    activate_trial,
    expire_trials,
    TRIAL_DURATION_DAYS,
)
from src.database.models import Trial


class TestTrialRegistration:
    """Tests for trial registration flow."""

    @pytest.mark.asyncio
    async def test_register_trial(self, db_session):
        """Register a new trial returns trial and verification token."""
        trial, token = await register_trial(
            db_session,
            contact_name="John Doe",
            contact_email="john@acme.test",
            company_name="Acme Corp",
            company_domain="acme.test",
            use_case="AI agent management",
        )
        assert trial.status == "pending"
        assert trial.contact_email == "john@acme.test"
        assert trial.company_domain == "acme.test"
        assert trial.email_verified is False
        assert len(token) > 0

    @pytest.mark.asyncio
    async def test_register_trial_sets_expiry(self, db_session):
        """Trial has an expiry date set."""
        trial, _ = await register_trial(
            db_session,
            contact_name="Jane",
            contact_email="jane@newco.test",
            company_name="NewCo",
            company_domain="newco.test",
        )
        assert trial.expires_at is not None
        # Should be ~14 days from now
        expected = datetime.now(timezone.utc) + timedelta(days=TRIAL_DURATION_DAYS)
        expires = trial.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        diff = abs((expires - expected).total_seconds())
        assert diff < 60  # Within 1 minute tolerance

    @pytest.mark.asyncio
    async def test_register_trial_duplicate_email(self, db_session):
        """Cannot register two trials with same email."""
        await register_trial(
            db_session,
            contact_name="First",
            contact_email="dupe@example.test",
            company_name="First Co",
            company_domain="first.test",
        )
        await db_session.flush()

        with pytest.raises(ValueError, match="trial already exists"):
            await register_trial(
                db_session,
                contact_name="Second",
                contact_email="dupe@example.test",
                company_name="Second Co",
                company_domain="second.test",
            )

    @pytest.mark.asyncio
    async def test_register_trial_domain_limit(self, db_session):
        """Cannot exceed max trials per domain."""
        for i in range(3):
            await register_trial(
                db_session,
                contact_name=f"User {i}",
                contact_email=f"user{i}@spam.test",
                company_name=f"Company {i}",
                company_domain="spam.test",
            )
            await db_session.flush()

        with pytest.raises(ValueError, match="Maximum trials"):
            await register_trial(
                db_session,
                contact_name="User 4",
                contact_email="user4@spam.test",
                company_name="Company 4",
                company_domain="spam.test",
            )


class TestTrialVerification:
    """Tests for email verification."""

    @pytest.mark.asyncio
    async def test_verify_trial_valid_token(self, db_session):
        """Valid token verifies the trial."""
        trial, token = await register_trial(
            db_session,
            contact_name="Verify",
            contact_email="verify@test.test",
            company_name="Verify Co",
            company_domain="test.test",
        )
        await db_session.flush()

        result = await verify_trial(db_session, trial.id, token)
        assert result is not None
        assert result.status == "verified"
        assert result.email_verified is True

    @pytest.mark.asyncio
    async def test_verify_trial_invalid_token(self, db_session):
        """Invalid token returns None."""
        trial, _ = await register_trial(
            db_session,
            contact_name="Bad Token",
            contact_email="bad@token.test",
            company_name="Bad Token Co",
            company_domain="token.test",
        )
        await db_session.flush()

        result = await verify_trial(db_session, trial.id, "wrong-token")
        assert result is None

    @pytest.mark.asyncio
    async def test_verify_trial_wrong_id(self, db_session):
        """Wrong trial ID returns None."""
        result = await verify_trial(
            db_session,
            uuid.UUID("99999999-9999-9999-9999-999999999999"),
            "some-token",
        )
        assert result is None


class TestTrialActivation:
    """Tests for trial activation (tenant + soulkey provisioning)."""

    @pytest.mark.asyncio
    async def test_activate_trial(self, db_session):
        """Activate a verified trial provisions tenant and soulkey."""
        trial, token = await register_trial(
            db_session,
            contact_name="Activate",
            contact_email="activate@trial.test",
            company_name="Trial Activate Co",
            company_domain="trial.test",
        )
        await db_session.flush()

        await verify_trial(db_session, trial.id, token)
        await db_session.flush()

        result = await activate_trial(db_session, trial.id)
        assert result is not None
        assert result["status"] == "active"
        assert result["raw_key"].startswith("sk_agent_")
        assert result["tenant_id"] is not None
        assert result["soulkey_id"] is not None

    @pytest.mark.asyncio
    async def test_activate_unverified_trial_fails(self, db_session):
        """Cannot activate an unverified trial."""
        trial, _ = await register_trial(
            db_session,
            contact_name="Unverified",
            contact_email="unverified@trial.test",
            company_name="Unverified Co",
            company_domain="unverified.test",
        )
        await db_session.flush()

        result = await activate_trial(db_session, trial.id)
        assert result is None


class TestTrialExpiry:
    """Tests for trial expiration."""

    @pytest.mark.asyncio
    async def test_expire_old_trials(self, db_session):
        """Expired trials are cleaned up."""
        # Create and activate a trial
        trial, token = await register_trial(
            db_session,
            contact_name="Expiring",
            contact_email="expiring@trial.test",
            company_name="Expiring Co",
            company_domain="expiring.test",
        )
        await db_session.flush()

        await verify_trial(db_session, trial.id, token)
        await db_session.flush()

        await activate_trial(db_session, trial.id)
        await db_session.flush()

        # Manually set the trial to be expired
        trial.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        await db_session.flush()

        count = await expire_trials(db_session)
        assert count >= 1
