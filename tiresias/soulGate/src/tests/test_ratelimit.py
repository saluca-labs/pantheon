"""
Rate limiter unit tests.
"""

import time
import pytest

from soulGate.src.ratelimit.engine import (
    SlidingWindow,
    RateLimitResult,
    check_rate_limit,
    reset_windows,
)


class TestSlidingWindow:
    """Tests for the sliding window rate limiter."""

    def test_allows_under_limit(self):
        """Requests under the limit should be allowed."""
        window = SlidingWindow(requests_per_minute=5, burst_size=0)
        for i in range(5):
            result = window.check_and_record()
            assert result.allowed is True
            assert result.remaining == 4 - i

    def test_blocks_over_limit(self):
        """Requests over the limit should be blocked."""
        window = SlidingWindow(requests_per_minute=3, burst_size=0)
        for _ in range(3):
            window.check_and_record()

        result = window.check_and_record()
        assert result.allowed is False
        assert result.remaining == 0
        assert result.retry_after > 0

    def test_burst_allows_extra(self):
        """Burst size should allow extra requests above RPM."""
        window = SlidingWindow(requests_per_minute=3, burst_size=2)
        # Should allow 3 + 2 = 5
        for i in range(5):
            result = window.check_and_record()
            assert result.allowed is True

        # 6th should be blocked
        result = window.check_and_record()
        assert result.allowed is False

    def test_window_expiry(self):
        """Old timestamps should be pruned from the window."""
        window = SlidingWindow(requests_per_minute=2, burst_size=0)

        # Manually add old timestamps
        now = time.monotonic()
        window.timestamps = [now - 120.0, now - 90.0]  # Older than 60s

        # Should be allowed since old entries are pruned
        result = window.check_and_record()
        assert result.allowed is True
        assert len(window.timestamps) == 1  # Only the new one

    def test_remaining_count(self):
        """Remaining count should be accurate."""
        window = SlidingWindow(requests_per_minute=10, burst_size=0)
        result = window.check_and_record()
        assert result.remaining == 9
        assert result.limit == 10


class TestRateLimitCheck:
    """Integration tests for the check_rate_limit function."""

    @pytest.fixture(autouse=True)
    def _reset(self):
        """Reset windows before each test."""
        reset_windows()
        yield
        reset_windows()

    @pytest.mark.asyncio
    async def test_default_limits(self):
        """Default rate limits should apply when no policy exists."""
        result = await check_rate_limit(tenant_id="test-tenant")
        assert result.allowed is True

    @pytest.mark.asyncio
    async def test_different_tenants_independent(self):
        """Different tenants should have independent rate limits."""
        # Exhaust tenant A with a tight window
        reset_windows()
        from soulGate.src.ratelimit.engine import _windows, SlidingWindow
        from collections import defaultdict

        # Create windows with low limits for testing
        _windows.default_factory = lambda: SlidingWindow(
            requests_per_minute=2, burst_size=0,
        )

        for _ in range(2):
            await check_rate_limit(tenant_id="tenant-a")

        # Tenant A should be blocked
        result_a = await check_rate_limit(tenant_id="tenant-a")
        assert result_a.allowed is False

        # Tenant B should still be allowed
        result_b = await check_rate_limit(tenant_id="tenant-b")
        assert result_b.allowed is True
