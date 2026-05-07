"""
IP-based sliding window rate limiter for trial registration.
In-memory implementation with per-IP tracking.
"""

import time
from collections import defaultdict
from typing import Optional

import structlog
from fastapi import Request, HTTPException

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Disposable email domain blocklist
# ---------------------------------------------------------------------------

DISPOSABLE_EMAIL_DOMAINS: set[str] = {
    "mailinator.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "guerrillamail.org",
    "guerrillamail.de",
    "grr.la",
    "guerrillamailblock.com",
    "tempmail.com",
    "temp-mail.org",
    "temp-mail.io",
    "throwaway.email",
    "throwawaymail.com",
    "yopmail.com",
    "yopmail.fr",
    "yopmail.net",
    "sharklasers.com",
    "guerrillamail.info",
    "spam4.me",
    "trashmail.com",
    "trashmail.me",
    "trashmail.net",
    "trashymail.com",
    "10minutemail.com",
    "10minutemail.net",
    "minutemail.com",
    "dispostable.com",
    "maildrop.cc",
    "mailnesia.com",
    "fakeinbox.com",
    "tempail.com",
    "tempr.email",
    "discard.email",
    "discardmail.com",
    "discardmail.de",
    "emailondeck.com",
    "getnada.com",
    "mohmal.com",
    "burnermail.io",
    "inboxbear.com",
    "mailcatch.com",
    "mailexpire.com",
    "mailnull.com",
    "guerrillamailblock.com",
    "spamgourmet.com",
    "harakirimail.com",
    "jetable.org",
    "mytemp.email",
    "nada.email",
    "tmpmail.net",
    "tmpmail.org",
    "tmail.ws",
}


def is_disposable_email(email: str) -> bool:
    """Check if an email address uses a known disposable email provider."""
    if not email or "@" not in email:
        return False
    domain = email.rsplit("@", 1)[1].lower().strip()
    return domain in DISPOSABLE_EMAIL_DOMAINS


# ---------------------------------------------------------------------------
# Sliding window rate limiter
# ---------------------------------------------------------------------------

class SlidingWindowRateLimiter:
    """
    In-memory IP-based sliding window rate limiter.
    Tracks timestamps of requests per IP and enforces per-hour and per-day limits.
    """

    def __init__(self, per_hour: int = 3, per_day: int = 10):
        self.per_hour = per_hour
        self.per_day = per_day
        # IP -> list of request timestamps
        self._requests: dict[str, list[float]] = defaultdict(list)

    def _cleanup(self, ip: str, now: float) -> None:
        """Remove timestamps older than 24 hours."""
        day_ago = now - 86400
        self._requests[ip] = [ts for ts in self._requests[ip] if ts > day_ago]

    def check_and_record(self, ip: str) -> Optional[str]:
        """
        Check if the request from this IP is allowed.
        If allowed, records the timestamp and returns None.
        If rate-limited, returns a descriptive error message.
        """
        now = time.time()
        self._cleanup(ip, now)

        timestamps = self._requests[ip]

        # Check daily limit
        day_ago = now - 86400
        day_count = sum(1 for ts in timestamps if ts > day_ago)
        if day_count >= self.per_day:
            remaining = min(ts for ts in timestamps if ts > day_ago) + 86400 - now
            hours = int(remaining / 3600)
            minutes = int((remaining % 3600) / 60)
            logger.warning(
                "rate_limit.daily_exceeded",
                ip=ip,
                count=day_count,
                limit=self.per_day,
            )
            return f"Daily registration limit exceeded. Try again in {hours}h {minutes}m."

        # Check hourly limit
        hour_ago = now - 3600
        hour_count = sum(1 for ts in timestamps if ts > hour_ago)
        if hour_count >= self.per_hour:
            remaining = min(ts for ts in timestamps if ts > hour_ago) + 3600 - now
            minutes = int(remaining / 60)
            seconds = int(remaining % 60)
            logger.warning(
                "rate_limit.hourly_exceeded",
                ip=ip,
                count=hour_count,
                limit=self.per_hour,
            )
            return f"Hourly registration limit exceeded. Try again in {minutes}m {seconds}s."

        # Record this request
        timestamps.append(now)
        return None

    def get_remaining(self, ip: str) -> dict:
        """Get remaining quota for an IP address."""
        now = time.time()
        self._cleanup(ip, now)
        timestamps = self._requests[ip]

        hour_ago = now - 3600
        day_ago = now - 86400
        hour_count = sum(1 for ts in timestamps if ts > hour_ago)
        day_count = sum(1 for ts in timestamps if ts > day_ago)

        return {
            "hourly_remaining": max(0, self.per_hour - hour_count),
            "daily_remaining": max(0, self.per_day - day_count),
            "hourly_limit": self.per_hour,
            "daily_limit": self.per_day,
        }

    def reset(self, ip: Optional[str] = None) -> None:
        """Reset rate limit state. If ip is None, resets all."""
        if ip:
            self._requests.pop(ip, None)
        else:
            self._requests.clear()


# Module-level instance for trial registration
_trial_limiter = SlidingWindowRateLimiter(per_hour=3, per_day=10)


def get_trial_limiter() -> SlidingWindowRateLimiter:
    """Get the global trial registration rate limiter."""
    return _trial_limiter


# Trusted proxy IPs that are allowed to set X-Forwarded-For.
# Add your reverse proxy / load balancer IPs here.
# Only requests from these IPs will have X-Forwarded-For honored.
TRUSTED_PROXIES: set[str] = {
    "127.0.0.1",
    "::1",
    # Cloudflare, nginx, etc. - add actual proxy IPs in production
}


def get_client_ip(request: Request) -> str:
    """
    Extract real client IP from request.
    Only trusts X-Forwarded-For if the direct connection comes from a
    known trusted proxy IP. Otherwise uses the direct connection IP to
    prevent rate limit bypass via header spoofing.
    """
    direct_ip = request.client.host if request.client else "unknown"

    # Only trust X-Forwarded-For from known proxy IPs
    if direct_ip in TRUSTED_PROXIES:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # Take the first IP (original client)
            client_ip = forwarded.split(",")[0].strip()
            if client_ip:
                return client_ip

    return direct_ip


async def check_trial_rate_limit(request: Request) -> None:
    """
    FastAPI dependency that checks trial registration rate limit.
    Raises HTTPException(429) if the limit is exceeded.
    """
    ip = get_client_ip(request)
    limiter = get_trial_limiter()
    error = limiter.check_and_record(ip)
    if error:
        remaining = limiter.get_remaining(ip)
        raise HTTPException(
            status_code=429,
            detail=error,
            headers={
                "Retry-After": "3600",
                "X-RateLimit-Hourly-Remaining": str(remaining["hourly_remaining"]),
                "X-RateLimit-Daily-Remaining": str(remaining["daily_remaining"]),
            },
        )


def validate_email_domain(email: str) -> None:
    """
    Validate that the email domain is not a known disposable provider.
    Raises HTTPException(400) if the domain is blocked.
    """
    if is_disposable_email(email):
        domain = email.rsplit("@", 1)[1] if "@" in email else email
        raise HTTPException(
            status_code=400,
            detail=f"Registration with disposable email providers is not allowed. "
                   f"Please use a company or permanent email address.",
        )
