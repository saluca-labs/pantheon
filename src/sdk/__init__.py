"""
SoulAuth Python SDK - client library for agent identity and zero-trust authorization.

Usage::

    from soulauth.sdk import SoulAuthClient

    async with SoulAuthClient("https://tiresias.saluca.com") as client:
        health = await client.get_health()
        reg = await client.register_agent(
            tenant_id="...", agent_id="alfred", agent_type="orchestrator"
        )
        result = await client.evaluate_access(
            soulkey=reg.raw_key, action="read", resource="memory"
        )
        if result.allowed:
            print(f"Token: {result.capability_token}")

Security Notes:
    - Always use HTTPS in production. The client warns if an http:// base_url
      is used outside debug mode.
    - SoulKey format (sk_agent_<tenant>_<persona>_<hex>) embeds tenant and
      persona names in the key prefix. This is by design for operational
      traceability, but operators should be aware that the key format reveals
      metadata. If opaque keys are required for your threat model, consider
      hashing or encrypting the prefix segment at the application layer.
    - Store SoulKeys securely (environment variables, secrets manager).
      Never commit them to source control or log them in plaintext.
"""

from src.sdk.client import SoulAuthClient
from src.sdk.exceptions import (
    SoulAuthError,
    AuthenticationError,
    AuthorizationError,
    TokenExpiredError,
    RateLimitError,
    NotFoundError,
    ConnectionError,
    ValidationError,
)
from src.sdk.models import (
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

__all__ = [
    # Client
    "SoulAuthClient",
    # Exceptions
    "SoulAuthError",
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
