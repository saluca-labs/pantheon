"""
In-memory login rate limiter.
Tracks failed attempts per email and locks out after threshold.
"""

import time
import structlog
from dataclasses import dataclass, field
from threading import Lock

from config.settings import get_settings

logger = structlog.get_logger(__name__)


@dataclass
class _AttemptRecord:
    count: int = 0
    first_attempt: float = 0.0
    locked_until: float = 0.0


class LoginRateLimiter:
    """Simple in-memory rate limiter for login attempts."""

    def __init__(self):
        self._attempts: dict[str, _AttemptRecord] = {}
        self._lock = Lock()

    def check(self, email: str) -> tuple[bool, int]:
        """
        Check if login is allowed for this email.
        Returns (allowed: bool, retry_after_seconds: int).
        """
        settings = get_settings()
        now = time.time()
        lockout_seconds = settings.login_lockout_minutes * 60

        with self._lock:
            record = self._attempts.get(email)
            if not record:
                return True, 0

            # Check if locked out
            if record.locked_until > now:
                retry_after = int(record.locked_until - now)
                return False, retry_after

            # Check if window has expired — reset
            if now - record.first_attempt > lockout_seconds:
                del self._attempts[email]
                return True, 0

            return True, 0

    def record_failure(self, email: str) -> tuple[bool, int]:
        """
        Record a failed login attempt.
        Returns (locked: bool, retry_after_seconds: int).
        """
        settings = get_settings()
        now = time.time()
        lockout_seconds = settings.login_lockout_minutes * 60

        with self._lock:
            record = self._attempts.get(email)
            if not record:
                record = _AttemptRecord(count=1, first_attempt=now)
                self._attempts[email] = record
                return False, 0

            # Reset if window expired
            if now - record.first_attempt > lockout_seconds:
                record.count = 1
                record.first_attempt = now
                record.locked_until = 0.0
                return False, 0

            record.count += 1

            if record.count >= settings.login_max_attempts:
                record.locked_until = now + lockout_seconds
                retry_after = lockout_seconds
                logger.warning(
                    "rate_limit.account_locked",
                    email=email,
                    attempts=record.count,
                    lockout_minutes=settings.login_lockout_minutes,
                )
                return True, retry_after

            return False, 0

    def record_success(self, email: str) -> None:
        """Clear attempt counter on successful login."""
        with self._lock:
            self._attempts.pop(email, None)

    def cleanup(self) -> int:
        """Remove expired records. Call periodically."""
        now = time.time()
        settings = get_settings()
        lockout_seconds = settings.login_lockout_minutes * 60
        removed = 0
        with self._lock:
            expired = [
                email for email, rec in self._attempts.items()
                if now - rec.first_attempt > lockout_seconds and rec.locked_until < now
            ]
            for email in expired:
                del self._attempts[email]
                removed += 1
        return removed


# Module-level singleton
login_rate_limiter = LoginRateLimiter()
