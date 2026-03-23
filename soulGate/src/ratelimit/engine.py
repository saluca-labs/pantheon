"""
Sliding window rate limiter.
In-memory counters with DB-backed policy configuration.
"""

import time
from dataclasses import dataclass, field
from typing import Optional
from collections import defaultdict

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from soulGate.config.settings import get_settings
from soulGate.src.database.models import SoulGateRateLimit

logger = structlog.get_logger(__name__)
settings = get_settings()


@dataclass
class RateLimitResult:
    """Result of a rate limit check."""
    allowed: bool
    remaining: int = 0
    limit: int = 0
    retry_after: int = 0


@dataclass
class SlidingWindow:
    """Sliding window counter for a single rate limit key."""
    timestamps: list = field(default_factory=list)
    requests_per_minute: int = 60
    burst_size: int = 10

    def check_and_record(self) -> RateLimitResult:
        """Check if this request fits within the sliding window and record it.

        Prunes timestamps older than 60s, then compares the current count
        against total_limit. If allowed, appends the current timestamp and
        returns remaining capacity. If denied, calculates a Retry-After
        value based on when the oldest request in the window will expire.
        """
        now = time.monotonic()
        window_start = now - 60.0

        # Prune old timestamps
        self.timestamps = [ts for ts in self.timestamps if ts > window_start]

        current_count = len(self.timestamps)
        # Effective limit = sustained RPM + burst headroom. The burst_size
        # allows short spikes above the steady-state rate before throttling.
        total_limit = self.requests_per_minute + self.burst_size

        if current_count >= total_limit:
            # Calculate retry-after based on oldest timestamp in window
            if self.timestamps:
                oldest = self.timestamps[0]
                retry_after = max(1, int(oldest + 60.0 - now))
            else:
                retry_after = 1

            return RateLimitResult(
                allowed=False,
                remaining=0,
                limit=total_limit,
                retry_after=retry_after,
            )

        self.timestamps.append(now)
        return RateLimitResult(
            allowed=True,
            remaining=total_limit - current_count - 1,
            limit=total_limit,
        )


# In-memory state
_policies: list[SoulGateRateLimit] = []
_windows: dict[str, SlidingWindow] = defaultdict(
    lambda: SlidingWindow(
        requests_per_minute=settings.default_rate_limit_rpm,
        burst_size=settings.default_burst_size,
    )
)


async def load_rate_limit_policies(db: AsyncSession) -> int:
    """Load enabled rate limit policies from DB."""
    global _policies
    result = await db.execute(
        select(SoulGateRateLimit).where(SoulGateRateLimit.enabled == True)
    )
    _policies = list(result.scalars().all())
    logger.info("ratelimit.policies_loaded", count=len(_policies))
    return len(_policies)


def _find_policy(
    tenant_id: str,
    soulkey_id: Optional[str],
    endpoint: str,
) -> Optional[SoulGateRateLimit]:
    """Find the most specific matching rate limit policy."""
    best: Optional[SoulGateRateLimit] = None
    best_specificity = -1

    for policy in _policies:
        specificity = 0
        # Specificity scoring weights:
        #   tenant match  = +1 (required baseline)
        #   soulkey match = +2 (most specific dimension)
        #   endpoint match = +1 (path-level override)
        # Higher specificity wins; this ensures per-soulkey policies beat
        # tenant-wide defaults.
        # Match tenant
        if str(policy.tenant_id) != tenant_id:
            continue
        specificity += 1

        # Match soulkey (more specific)
        if policy.soulkey_id:
            if soulkey_id and str(policy.soulkey_id) == soulkey_id:
                specificity += 2
            else:
                continue

        # Match endpoint pattern
        if policy.endpoint_pattern != "*":
            if not _pattern_matches(policy.endpoint_pattern, endpoint):
                continue
            specificity += 1

        if specificity > best_specificity:
            best = policy
            best_specificity = specificity

    return best


def _pattern_matches(pattern: str, endpoint: str) -> bool:
    """Simple glob-style pattern matching for endpoint paths."""
    if pattern == "*":
        return True
    if pattern.endswith("*"):
        return endpoint.startswith(pattern[:-1])
    return endpoint == pattern


async def check_rate_limit(
    tenant_id: str,
    soulkey_id: Optional[str] = None,
    endpoint: str = "*",
) -> RateLimitResult:
    """
    Check rate limit for a request.
    Uses the most specific matching policy or defaults.
    """
    policy = _find_policy(tenant_id, soulkey_id, endpoint)

    # Build window key
    key_parts = [tenant_id]
    if soulkey_id:
        key_parts.append(soulkey_id)
    key_parts.append(endpoint)
    key = ":".join(key_parts)

    # Get or create sliding window
    window = _windows[key]

    # Apply policy if found
    if policy:
        window.requests_per_minute = policy.requests_per_minute
        window.burst_size = policy.burst_size

    result = window.check_and_record()

    if not result.allowed:
        logger.warning(
            "ratelimit.exceeded",
            tenant_id=tenant_id,
            soulkey_id=soulkey_id,
            endpoint=endpoint,
            limit=result.limit,
        )

    return result


def reset_windows():
    """Reset all in-memory rate limit windows. Used for testing."""
    global _windows
    _windows = defaultdict(
        lambda: SlidingWindow(
            requests_per_minute=settings.default_rate_limit_rpm,
            burst_size=settings.default_burst_size,
        )
    )
