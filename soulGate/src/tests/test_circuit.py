"""
Circuit breaker unit tests.
"""

import time
import pytest

from soulGate.src.circuit.breaker import (
    CircuitBreaker,
    CircuitOpenError,
    get_breaker,
    list_breakers,
    reset_all_breakers,
)


class TestCircuitBreaker:
    """Tests for the three-state circuit breaker."""

    @pytest.fixture(autouse=True)
    def _reset(self):
        """Reset circuit breakers before each test."""
        reset_all_breakers()
        yield
        reset_all_breakers()

    def test_starts_closed(self):
        """Circuit breaker should start in closed state."""
        cb = CircuitBreaker(upstream_id="test", failure_threshold=3)
        assert cb.state == "closed"
        assert cb.failure_count == 0

    def test_stays_closed_under_threshold(self):
        """Should stay closed when failures are below threshold."""
        cb = CircuitBreaker(upstream_id="test", failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == "closed"
        assert cb.failure_count == 2

    def test_opens_at_threshold(self):
        """Should open when failures reach threshold."""
        cb = CircuitBreaker(upstream_id="test", failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        cb.record_failure()
        assert cb.state == "open"

    def test_open_blocks_requests(self):
        """Open circuit should raise CircuitOpenError."""
        cb = CircuitBreaker(upstream_id="test", failure_threshold=1, cooldown_seconds=60)
        cb.record_failure()
        assert cb.state == "open"

        with pytest.raises(CircuitOpenError):
            cb.check()

    def test_half_open_after_cooldown(self):
        """Should transition to half-open after cooldown."""
        cb = CircuitBreaker(upstream_id="test", failure_threshold=1, cooldown_seconds=0)
        cb.record_failure()
        assert cb.state == "open"

        # Simulate cooldown elapsed
        cb.opened_at = time.monotonic() - 1.0
        cb.check()  # Should not raise, transitions to half_open
        assert cb.state == "half_open"

    def test_half_open_success_closes(self):
        """Successful probe in half-open should close circuit."""
        cb = CircuitBreaker(upstream_id="test", failure_threshold=1, cooldown_seconds=0)
        cb.record_failure()
        cb.opened_at = time.monotonic() - 1.0
        cb.check()  # -> half_open
        assert cb.state == "half_open"

        cb.record_success()
        assert cb.state == "closed"
        assert cb.failure_count == 0

    def test_half_open_failure_reopens(self):
        """Failed probe in half-open should reopen circuit."""
        cb = CircuitBreaker(upstream_id="test", failure_threshold=1, cooldown_seconds=0)
        cb.record_failure()
        cb.opened_at = time.monotonic() - 1.0
        cb.check()  # -> half_open

        cb.record_failure()
        assert cb.state == "open"

    def test_manual_trip(self):
        """Manual trip should open circuit."""
        cb = CircuitBreaker(upstream_id="test", failure_threshold=100)
        cb.manual_trip()
        assert cb.state == "open"

    def test_manual_reset(self):
        """Manual reset should close circuit and clear counters."""
        cb = CircuitBreaker(upstream_id="test", failure_threshold=1)
        cb.record_failure()
        assert cb.state == "open"

        cb.manual_reset()
        assert cb.state == "closed"
        assert cb.failure_count == 0

    def test_success_resets_nothing_when_closed(self):
        """Recording success in closed state should just increment counter."""
        cb = CircuitBreaker(upstream_id="test", failure_threshold=5)
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        assert cb.state == "closed"
        assert cb.failure_count == 2  # Success doesn't reset failure count in closed

    def test_to_dict(self):
        """Serialization should include all fields."""
        cb = CircuitBreaker(upstream_id="test-123", failure_threshold=5, cooldown_seconds=30)
        d = cb.to_dict()
        assert d["upstream_id"] == "test-123"
        assert d["state"] == "closed"
        assert d["failure_threshold"] == 5
        assert d["cooldown_seconds"] == 30


class TestBreakerRegistry:
    """Tests for the breaker registry."""

    @pytest.fixture(autouse=True)
    def _reset(self):
        reset_all_breakers()
        yield
        reset_all_breakers()

    def test_get_breaker_creates(self):
        """get_breaker should create a new breaker if not found."""
        breaker = get_breaker("new-upstream")
        assert breaker.upstream_id == "new-upstream"
        assert breaker.state == "closed"

    def test_get_breaker_returns_same(self):
        """get_breaker should return the same breaker for the same key."""
        b1 = get_breaker("test")
        b2 = get_breaker("test")
        assert b1 is b2

    def test_list_breakers(self):
        """list_breakers should return all registered breakers."""
        get_breaker("a")
        get_breaker("b")
        breakers = list_breakers()
        assert len(breakers) == 2
