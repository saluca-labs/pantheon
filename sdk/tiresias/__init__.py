"""
Tiresias Python SDK - Zero-trust agent identity and authorization.

Usage::

    from tiresias import TiresiasClient

    async with TiresiasClient("https://tiresias.network") as client:
        # Check service health
        health = await client.get_health()

        # Resolve agent identity
        identity = await client.resolve_identity(soulkey="sk_agent_...")

        # Evaluate access
        result = await client.evaluate_access(
            soulkey="sk_agent_...",
            resource="memory",
            action="read",
            scope="cs:algorithms",
        )
        if result.allowed:
            print(f"Granted! Token: {result.capability_token}")
"""

from tiresias.client import TiresiasClient
from tiresias.exceptions import (
    TiresiasError,
    AuthenticationError,
    AuthorizationError,
    TokenExpiredError,
    RateLimitError,
    NotFoundError,
    ConnectionError,
    ValidationError,
)
from tiresias.models import (
    AgentRegistration,
    AuditEvent,
    AuditReport,
    EvaluationResult,
    HealthStatus,
    IdentityInfo,
    TokenClaims,
    TokenResponse,
    TrialActivation,
    TrialRegistration,
    WhoamiInfo,
)

__version__ = "1.0.0"

__all__ = [
    # Client
    "TiresiasClient",
    # Exceptions
    "TiresiasError",
    "AuthenticationError",
    "AuthorizationError",
    "TokenExpiredError",
    "RateLimitError",
    "NotFoundError",
    "ConnectionError",
    "ValidationError",
    # Models
    "AgentRegistration",
    "AuditEvent",
    "AuditReport",
    "EvaluationResult",
    "HealthStatus",
    "IdentityInfo",
    "TokenClaims",
    "TokenResponse",
    "TrialActivation",
    "TrialRegistration",
    "WhoamiInfo",
]
