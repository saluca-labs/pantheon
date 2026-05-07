"""
Tests for trial registration rate limiting and disposable email blocking.
"""

import time
import pytest
from unittest.mock import MagicMock, AsyncMock

from src.middleware.rate_limit import (
    SlidingWindowRateLimiter,
    is_disposable_email,
    validate_email_domain,
    get_client_ip,
    check_trial_rate_limit,
    get_trial_limiter,
)
from fastapi import HTTPException


# ---------------------------------------------------------------------------
# SlidingWindowRateLimiter
# ---------------------------------------------------------------------------

class TestSlidingWindowRateLimiter:
    def setup_method(self):
        self.limiter = SlidingWindowRateLimiter(per_hour=3, per_day=10)

    def test_first_request_allowed(self):
        error = self.limiter.check_and_record("192.168.1.1")
        assert error is None

    def test_within_hourly_limit(self):
        for _ in range(3):
            error = self.limiter.check_and_record("10.0.0.1")
            if error:
                break
        # First 3 should succeed
        remaining = self.limiter.get_remaining("10.0.0.1")
        assert remaining["hourly_remaining"] == 0

    def test_fourth_request_blocked_hourly(self):
        ip = "10.0.0.2"
        for _ in range(3):
            result = self.limiter.check_and_record(ip)
            assert result is None  # first 3 succeed

        # 4th should be blocked
        error = self.limiter.check_and_record(ip)
        assert error is not None
        assert "Hourly" in error

    def test_daily_limit_enforcement(self):
        ip = "10.0.0.3"
        # Use a limiter with higher hourly limit to test daily
        limiter = SlidingWindowRateLimiter(per_hour=100, per_day=10)

        for i in range(10):
            result = limiter.check_and_record(ip)
            assert result is None, f"Request {i+1} should succeed"

        # 11th should be blocked
        error = limiter.check_and_record(ip)
        assert error is not None
        assert "Daily" in error

    def test_different_ips_independent(self):
        for _ in range(3):
            self.limiter.check_and_record("10.0.0.10")

        # Different IP should not be affected
        error = self.limiter.check_and_record("10.0.0.11")
        assert error is None

    def test_get_remaining(self):
        ip = "10.0.0.20"
        remaining = self.limiter.get_remaining(ip)
        assert remaining["hourly_remaining"] == 3
        assert remaining["daily_remaining"] == 10
        assert remaining["hourly_limit"] == 3
        assert remaining["daily_limit"] == 10

        self.limiter.check_and_record(ip)
        remaining = self.limiter.get_remaining(ip)
        assert remaining["hourly_remaining"] == 2
        assert remaining["daily_remaining"] == 9

    def test_reset_single_ip(self):
        ip = "10.0.0.30"
        for _ in range(3):
            self.limiter.check_and_record(ip)

        # Should be blocked
        assert self.limiter.check_and_record(ip) is not None

        # Reset and try again
        self.limiter.reset(ip)
        assert self.limiter.check_and_record(ip) is None

    def test_reset_all(self):
        for ip in ["1.1.1.1", "2.2.2.2", "3.3.3.3"]:
            for _ in range(3):
                self.limiter.check_and_record(ip)

        self.limiter.reset()

        # All should be allowed again
        for ip in ["1.1.1.1", "2.2.2.2", "3.3.3.3"]:
            assert self.limiter.check_and_record(ip) is None


# ---------------------------------------------------------------------------
# Disposable email detection
# ---------------------------------------------------------------------------

class TestDisposableEmail:
    def test_mailinator_blocked(self):
        assert is_disposable_email("test@mailinator.com") is True

    def test_guerrillamail_blocked(self):
        assert is_disposable_email("test@guerrillamail.com") is True

    def test_tempmail_blocked(self):
        assert is_disposable_email("test@tempmail.com") is True

    def test_yopmail_blocked(self):
        assert is_disposable_email("test@yopmail.com") is True

    def test_throwaway_blocked(self):
        assert is_disposable_email("test@throwaway.email") is True

    def test_maildrop_blocked(self):
        assert is_disposable_email("test@maildrop.cc") is True

    def test_gmail_allowed(self):
        assert is_disposable_email("user@gmail.com") is False

    def test_company_email_allowed(self):
        assert is_disposable_email("admin@acme.com") is False

    def test_outlook_allowed(self):
        assert is_disposable_email("user@outlook.com") is False

    def test_empty_email(self):
        assert is_disposable_email("") is False

    def test_no_at_sign(self):
        assert is_disposable_email("notanemail") is False

    def test_case_insensitive(self):
        assert is_disposable_email("test@MAILINATOR.COM") is True

    def test_validate_email_domain_raises(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_email_domain("test@mailinator.com")
        assert exc_info.value.status_code == 400
        assert "disposable" in exc_info.value.detail.lower()

    def test_validate_email_domain_passes(self):
        # Should not raise for valid domains
        validate_email_domain("user@acme.com")


# ---------------------------------------------------------------------------
# Client IP extraction
# ---------------------------------------------------------------------------

class TestGetClientIP:
    def test_direct_client(self):
        request = MagicMock()
        request.headers = {}
        request.client = MagicMock()
        request.client.host = "192.168.1.100"
        assert get_client_ip(request) == "192.168.1.100"

    def test_forwarded_for(self):
        request = MagicMock()
        request.headers = {"x-forwarded-for": "10.0.0.1, 192.168.1.1"}
        # X-Forwarded-For is only trusted when direct connection is from a trusted proxy
        request.client.host = "127.0.0.1"
        assert get_client_ip(request) == "10.0.0.1"

    def test_no_client(self):
        request = MagicMock()
        request.headers = {}
        request.client = None
        assert get_client_ip(request) == "unknown"


# ---------------------------------------------------------------------------
# check_trial_rate_limit dependency
# ---------------------------------------------------------------------------

class TestCheckTrialRateLimit:
    @pytest.mark.asyncio
    async def test_rate_limit_raises_429(self):
        limiter = get_trial_limiter()
        limiter.reset()

        request = MagicMock()
        request.headers = {}
        request.client = MagicMock()
        request.client.host = "10.99.99.1"

        # Use up the limit
        for _ in range(3):
            await check_trial_rate_limit(request)

        # Next should raise
        with pytest.raises(HTTPException) as exc_info:
            await check_trial_rate_limit(request)
        assert exc_info.value.status_code == 429

        # Cleanup
        limiter.reset()
