"""
Three-state circuit breaker per upstream.
States: Closed -> Open -> Half-Open -> Closed

Security hardening:
- Minimum request threshold before circuit can open (prevents low-volume tripping)
- Per-source failure tracking so one bad actor cannot trip the breaker for everyone
- Admin-only manual override via router-level auth
"""

import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

import structlog

from soulGate.config.settings import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()


class CircuitOpenError(Exception):
    """Raised when circuit is open and request should be rejected."""
    pass


@dataclass
class CircuitBreaker:
    """
    Three-state circuit breaker with anti-weaponization protections.
    - Closed: requests flow normally, failures are counted
    - Open: requests are rejected, timer counts down
    - Half-Open: one probe request is allowed through

    Anti-weaponization:
    - min_request_threshold: Circuit won't open until at least this many total
      requests have been seen (prevents tripping on low volume).
    - Per-source failure tracking: failures from a single source (IP/soulkey)
      are tracked separately; a single source cannot contribute more than
      max_source_failure_ratio of the total failure count.
    - Admin-locked state: when locked by admin, automatic transitions are blocked.
    """
    upstream_id: str
    failure_threshold: int = field(default_factory=lambda: settings.circuit_failure_threshold)
    cooldown_seconds: int = field(default_factory=lambda: settings.circuit_cooldown_seconds)
    min_request_threshold: int = 20  # Minimum total requests before circuit can open

    state: str = "closed"  # closed, open, half_open
    failure_count: int = 0
    success_count: int = 0
    total_requests: int = 0
    last_failure_at: Optional[float] = None
    opened_at: Optional[float] = None
    admin_locked: bool = False  # When True, automatic transitions are blocked

    # Per-source failure tracking
    _source_failures: dict = field(default_factory=lambda: defaultdict(int))
    max_source_failure_ratio: float = 0.6  # One source can cause at most 60% of failures

    def check(self):
        """Check if request should be allowed through. Raises CircuitOpenError if not."""
        if self.state == "closed":
            return  # Allow

        if self.state == "open":
            # Check if cooldown has elapsed
            if self.opened_at and (time.monotonic() - self.opened_at) >= self.cooldown_seconds:
                self._transition("half_open")
                return  # Allow probe request
            raise CircuitOpenError(f"Circuit open for upstream {self.upstream_id}")

        if self.state == "half_open":
            # Only one probe at a time - already in half_open means probe is allowed
            return

    def record_success(self, source: str = "unknown"):
        """Record a successful request."""
        self.success_count += 1
        self.total_requests += 1

        if self.state == "half_open" and not self.admin_locked:
            # Probe succeeded - close circuit
            self._transition("closed")
            self.failure_count = 0
            self.success_count = 0
            self.total_requests = 0
            self._source_failures.clear()
            logger.info("circuit.closed", upstream=self.upstream_id)

    def record_failure(self, source: str = "unknown"):
        """
        Record a failed request with per-source tracking.
        A single source cannot cause the circuit to open by itself if its
        failures exceed max_source_failure_ratio of total failures.
        """
        self.failure_count += 1
        self.total_requests += 1
        self.last_failure_at = time.monotonic()
        self._source_failures[source] += 1

        if self.admin_locked:
            return  # Admin has locked the state - no automatic transitions

        if self.state == "half_open":
            # Probe failed - reopen circuit
            self._transition("open")
            logger.warning("circuit.reopened", upstream=self.upstream_id)
            return

        if self.state == "closed" and self.failure_count >= self.failure_threshold:
            # Anti-weaponization: require minimum total requests before opening
            if self.total_requests < self.min_request_threshold:
                logger.debug(
                    "circuit.open_deferred",
                    upstream=self.upstream_id,
                    reason="below_min_request_threshold",
                    total_requests=self.total_requests,
                    min_required=self.min_request_threshold,
                )
                return

            # Anti-weaponization: check if failures are dominated by a single source
            if self.failure_count > 0:
                max_source_count = max(self._source_failures.values()) if self._source_failures else 0
                source_ratio = max_source_count / self.failure_count
                if source_ratio > self.max_source_failure_ratio:
                    dominant_source = max(self._source_failures, key=self._source_failures.get)
                    logger.warning(
                        "circuit.open_blocked",
                        upstream=self.upstream_id,
                        reason="single_source_dominance",
                        dominant_source=dominant_source,
                        source_ratio=round(source_ratio, 2),
                        threshold=self.max_source_failure_ratio,
                    )
                    return

            self._transition("open")
            logger.warning(
                "circuit.opened",
                upstream=self.upstream_id,
                failure_count=self.failure_count,
                total_requests=self.total_requests,
            )

    def manual_trip(self):
        """Manually trip the circuit breaker to open state (admin action)."""
        self.admin_locked = True
        self._transition("open")
        logger.info("circuit.manual_trip", upstream=self.upstream_id)

    def manual_reset(self):
        """Manually reset the circuit breaker to closed state (admin action)."""
        self.admin_locked = False
        self._transition("closed")
        self.failure_count = 0
        self.success_count = 0
        self.total_requests = 0
        self._source_failures.clear()
        logger.info("circuit.manual_reset", upstream=self.upstream_id)

    def admin_lock(self):
        """Lock the circuit in its current state. Automatic transitions are blocked."""
        self.admin_locked = True
        logger.info("circuit.admin_locked", upstream=self.upstream_id, state=self.state)

    def admin_unlock(self):
        """Unlock the circuit, allowing automatic transitions again."""
        self.admin_locked = False
        logger.info("circuit.admin_unlocked", upstream=self.upstream_id, state=self.state)

    def _transition(self, new_state: str):
        """Transition to a new state."""
        old_state = self.state
        self.state = new_state
        if new_state == "open":
            self.opened_at = time.monotonic()
        elif new_state == "closed":
            self.opened_at = None
            self.failure_count = 0
        logger.debug(
            "circuit.transition",
            upstream=self.upstream_id,
            from_state=old_state,
            to_state=new_state,
        )

    def to_dict(self) -> dict:
        """Serialize state for API responses."""
        return {
            "upstream_id": self.upstream_id,
            "state": self.state,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "total_requests": self.total_requests,
            "failure_threshold": self.failure_threshold,
            "cooldown_seconds": self.cooldown_seconds,
            "min_request_threshold": self.min_request_threshold,
            "admin_locked": self.admin_locked,
        }


# In-memory circuit breaker registry
_breakers: dict[str, CircuitBreaker] = {}


def get_breaker(upstream_id: str) -> CircuitBreaker:
    """Get or create a circuit breaker for an upstream."""
    if upstream_id not in _breakers:
        _breakers[upstream_id] = CircuitBreaker(upstream_id=upstream_id)
    return _breakers[upstream_id]


def list_breakers() -> list[CircuitBreaker]:
    """List all circuit breakers."""
    return list(_breakers.values())


def reset_all_breakers():
    """Reset all circuit breakers. Used for testing."""
    global _breakers
    _breakers = {}
