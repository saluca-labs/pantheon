"""
Tests for the SoulAuth Python SDK client.
Uses httpx mock transport to simulate server responses without a live server.
"""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import httpx
import pytest
import pytest_asyncio

from src.sdk.client import SoulAuthClient
from src.sdk.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ConnectionError,
    NotFoundError,
    RateLimitError,
    SoulAuthError,
    TokenExpiredError,
    ValidationError,
)
from src.sdk.models import (
    AgentRegistration,
    AuditReport,
    EvaluationResult,
    HealthStatus,
    IdentityInfo,
    TokenResponse,
    WhoamiInfo,
)


# --- Fixtures ---

FAKE_SOULKEY = "sk_agent_sal_alfred_abc123def456"
FAKE_TENANT_ID = "11111111-1111-1111-1111-111111111111"
FAKE_SOULKEY_ID = "22222222-2222-2222-2222-222222222222"
FAKE_AUDIT_ID = "33333333-3333-3333-3333-333333333333"


def _mock_transport(responses: dict[tuple[str, str], tuple[int, dict]]):
    """
    Create an httpx MockTransport that returns canned responses.
    responses maps (method, path) -> (status_code, json_body).
    """

    async def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.raw_path.decode()
        # Strip query string for matching
        path_no_query = path.split("?")[0]
        method = request.method
        key = (method, path_no_query)

        if key in responses:
            status, body = responses[key]
            return httpx.Response(status, json=body)

        # Fallback: 404
        return httpx.Response(404, json={"detail": f"No mock for {method} {path_no_query}"})

    return httpx.MockTransport(handler)


@pytest_asyncio.fixture
async def mock_client():
    """Create a SoulAuthClient with a mock transport for standard operations."""
    now_iso = datetime.now(timezone.utc).isoformat()
    responses = {
        ("GET", "/health"): (200, {
            "status": "healthy",
            "service": "soulauth",
            "version": "1.0.0",
        }),
        ("POST", "/v1/soulauth/admin/keys"): (200, {
            "soulkey_id": FAKE_SOULKEY_ID,
            "raw_key": FAKE_SOULKEY,
            "persona_id": "alfred",
            "tenant_id": FAKE_TENANT_ID,
            "status": "active",
            "issued_at": now_iso,
            "expires_at": None,
        }),
        ("GET", "/v1/auth/identity"): (200, {
            "soulkey_id": FAKE_SOULKEY_ID,
            "tenant_id": FAKE_TENANT_ID,
            "persona_id": "alfred",
            "status": "active",
            "label": "Alfred (orchestrator)",
            "issued_at": now_iso,
            "expires_at": None,
            "last_used_at": now_iso,
        }),
        ("GET", "/v1/auth/whoami"): (200, {
            "persona_id": "alfred",
            "tenant_id": FAKE_TENANT_ID,
            "soulkey_id": FAKE_SOULKEY_ID,
            "status": "active",
            "active_capabilities": 2,
            "policy_summary": {
                "role": "orchestrator",
                "resources": ["memory", "vault"],
                "max_capability_ttl": 900,
                "allowed_nodes": ["*"],
            },
        }),
        ("POST", "/v1/auth/evaluate"): (200, {
            "decision": "GRANT",
            "capability_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.test",
            "expires_in": 300,
            "granted_scopes": ["memory:read:*"],
            "reason": None,
            "escalation_available": False,
            "escalation_approver_role": None,
            "audit_id": FAKE_AUDIT_ID,
        }),
        ("GET", "/v1/soulauth/admin/audit/report"): (200, {
            "tenant_id": FAKE_TENANT_ID,
            "count": 2,
            "events": [
                {
                    "id": str(uuid.uuid4()),
                    "timestamp": now_iso,
                    "event_type": "auth_grant",
                    "persona_id": "alfred",
                    "resource": "memory",
                    "action": "read",
                    "scope": "*",
                    "decision": "GRANT",
                    "reason": None,
                    "context": {},
                },
                {
                    "id": str(uuid.uuid4()),
                    "timestamp": now_iso,
                    "event_type": "key_issued",
                    "persona_id": "alfred",
                    "resource": None,
                    "action": None,
                    "scope": None,
                    "decision": None,
                    "reason": None,
                    "context": {"label": "Alfred (orchestrator)"},
                },
            ],
        }),
    }

    transport = _mock_transport(responses)
    client = SoulAuthClient(base_url="http://testserver")
    client._client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    yield client
    await client.close()


# --- Test: Client Initialization ---

class TestClientInit:
    def test_default_init(self):
        """Client initializes with sensible defaults."""
        client = SoulAuthClient()
        assert client.base_url == "http://localhost:8000"
        assert client.api_key is None
        assert client.timeout == 30.0
        assert client._client is None

    def test_custom_init(self):
        """Client accepts custom base_url, api_key, and timeout."""
        client = SoulAuthClient(
            base_url="https://auth.example.com/",
            api_key="sk_test_123",
            timeout=60.0,
        )
        assert client.base_url == "https://auth.example.com"
        assert client.api_key == "sk_test_123"
        assert client.timeout == 60.0

    def test_trailing_slash_stripped(self):
        """Trailing slash is stripped from base_url."""
        client = SoulAuthClient(base_url="http://localhost:8000/")
        assert client.base_url == "http://localhost:8000"


# --- Test: Context Manager ---

class TestContextManager:
    @pytest.mark.asyncio
    async def test_context_manager_creates_client(self):
        """Context manager creates and closes the httpx client."""
        client = SoulAuthClient()
        assert client._client is None

        # We can't actually connect, but we can verify the client gets created
        async with client:
            assert client._client is not None
            assert not client._client.is_closed

        assert client._client is None

    @pytest.mark.asyncio
    async def test_close_idempotent(self):
        """Calling close multiple times is safe."""
        client = SoulAuthClient()
        await client.close()  # No client yet — should be fine
        await client.close()  # Still fine


# --- Test: Health Check ---

class TestHealthCheck:
    @pytest.mark.asyncio
    async def test_get_health(self, mock_client):
        """Health check returns typed HealthStatus."""
        result = await mock_client.get_health()
        assert isinstance(result, HealthStatus)
        assert result.status == "healthy"
        assert result.service == "soulauth"
        assert result.version == "1.0.0"


# --- Test: Agent Registration ---

class TestRegistration:
    @pytest.mark.asyncio
    async def test_register_agent(self, mock_client):
        """Agent registration returns typed AgentRegistration with raw key."""
        result = await mock_client.register_agent(
            tenant_id=FAKE_TENANT_ID,
            agent_id="alfred",
            agent_type="orchestrator",
        )
        assert isinstance(result, AgentRegistration)
        assert result.persona_id == "alfred"
        assert result.raw_key == FAKE_SOULKEY
        assert result.status == "active"
        assert result.tenant_id == uuid.UUID(FAKE_TENANT_ID)


# --- Test: Identity Resolution ---

class TestIdentity:
    @pytest.mark.asyncio
    async def test_resolve_identity(self, mock_client):
        """Identity resolution returns agent persona and status."""
        result = await mock_client.resolve_identity(soulkey=FAKE_SOULKEY)
        assert isinstance(result, IdentityInfo)
        assert result.persona_id == "alfred"
        assert result.status == "active"
        assert result.tenant_id == uuid.UUID(FAKE_TENANT_ID)

    @pytest.mark.asyncio
    async def test_whoami(self, mock_client):
        """Whoami returns persona info and policy summary."""
        result = await mock_client.whoami(soulkey=FAKE_SOULKEY)
        assert isinstance(result, WhoamiInfo)
        assert result.persona_id == "alfred"
        assert result.active_capabilities == 2
        assert result.policy_summary is not None
        assert result.policy_summary["role"] == "orchestrator"


# --- Test: Token Request ---

class TestTokenRequest:
    @pytest.mark.asyncio
    async def test_request_token_granted(self, mock_client):
        """Token request returns GRANT with capability token."""
        result = await mock_client.request_token(
            soulkey=FAKE_SOULKEY,
            resource="memory",
            action="read",
            scope="*",
        )
        assert isinstance(result, TokenResponse)
        assert result.decision == "GRANT"
        assert result.capability_token is not None
        assert result.expires_in == 300
        assert "memory:read:*" in result.granted_scopes


# --- Test: Access Evaluation ---

class TestAccessEvaluation:
    @pytest.mark.asyncio
    async def test_evaluate_access_granted(self, mock_client):
        """Evaluate access returns GRANT with .allowed property."""
        result = await mock_client.evaluate_access(
            soulkey=FAKE_SOULKEY,
            action="read",
            resource="memory",
        )
        assert isinstance(result, EvaluationResult)
        assert result.allowed is True
        assert result.denied is False
        assert result.capability_token is not None

    @pytest.mark.asyncio
    async def test_evaluate_access_denied(self):
        """Evaluate access returns DENY when policy denies."""
        responses = {
            ("POST", "/v1/auth/evaluate"): (200, {
                "decision": "DENY",
                "capability_token": None,
                "expires_in": None,
                "granted_scopes": None,
                "reason": "No matching policy rule",
                "escalation_available": True,
                "escalation_approver_role": "orchestrator",
                "audit_id": FAKE_AUDIT_ID,
            }),
        }
        transport = _mock_transport(responses)
        client = SoulAuthClient(base_url="http://testserver")
        client._client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

        try:
            result = await client.evaluate_access(
                soulkey=FAKE_SOULKEY,
                action="delete",
                resource="vault",
                scope="secrets:*",
            )
            assert result.denied is True
            assert result.allowed is False
            assert result.reason == "No matching policy rule"
            assert result.escalation_available is True
        finally:
            await client.close()


# --- Test: Audit ---

class TestAudit:
    @pytest.mark.asyncio
    async def test_list_audit_events(self, mock_client):
        """Audit log query returns typed AuditReport."""
        result = await mock_client.list_audit_events(tenant_id=FAKE_TENANT_ID)
        assert isinstance(result, AuditReport)
        assert result.count == 2
        assert len(result.events) == 2
        assert result.events[0].event_type == "auth_grant"
        assert result.events[1].event_type == "key_issued"


# --- Test: Error Handling ---

class TestErrorHandling:
    @pytest.mark.asyncio
    async def test_authentication_error(self):
        """401 response raises AuthenticationError."""
        responses = {
            ("GET", "/v1/auth/identity"): (401, {"detail": "Invalid soulkey"}),
        }
        transport = _mock_transport(responses)
        client = SoulAuthClient(base_url="http://testserver")
        client._client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

        try:
            with pytest.raises(AuthenticationError) as exc_info:
                await client.resolve_identity(soulkey="bad_key")
            assert exc_info.value.status_code == 401
            assert "Invalid soulkey" in exc_info.value.message
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_token_expired_error(self):
        """401 with 'expired' in message raises TokenExpiredError."""
        responses = {
            ("GET", "/v1/auth/identity"): (401, {"detail": "Token has expired"}),
        }
        transport = _mock_transport(responses)
        client = SoulAuthClient(base_url="http://testserver")
        client._client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

        try:
            with pytest.raises(TokenExpiredError) as exc_info:
                await client.resolve_identity(soulkey="expired_key")
            assert exc_info.value.status_code == 401
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_authorization_error(self):
        """403 response raises AuthorizationError."""
        responses = {
            ("POST", "/v1/auth/evaluate"): (403, {"detail": "Forbidden"}),
        }
        transport = _mock_transport(responses)
        client = SoulAuthClient(base_url="http://testserver")
        client._client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

        try:
            with pytest.raises(AuthorizationError) as exc_info:
                await client.evaluate_access(
                    soulkey="test", action="admin", resource="system"
                )
            assert exc_info.value.status_code == 403
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_not_found_error(self):
        """404 response raises NotFoundError."""
        responses = {
            ("POST", "/v1/soulauth/admin/keys"): (404, {"detail": "Tenant not found"}),
        }
        transport = _mock_transport(responses)
        client = SoulAuthClient(base_url="http://testserver")
        client._client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

        try:
            with pytest.raises(NotFoundError):
                await client.register_agent(
                    tenant_id="nonexistent", agent_id="test", agent_type="agent"
                )
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_rate_limit_error(self):
        """429 response raises RateLimitError."""
        responses = {
            ("POST", "/v1/trial/register"): (429, {"detail": "Too many trial registrations"}),
        }
        transport = _mock_transport(responses)
        client = SoulAuthClient(base_url="http://testserver")
        client._client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

        try:
            with pytest.raises(RateLimitError) as exc_info:
                await client.register_trial(
                    contact_name="Test",
                    contact_email="test@example.com",
                    company_name="Test Co",
                    company_domain="example.com",
                )
            assert exc_info.value.status_code == 429
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_validation_error(self):
        """422 response raises ValidationError."""
        responses = {
            ("POST", "/v1/soulauth/admin/keys"): (422, {
                "detail": [{"msg": "field required", "type": "missing"}]
            }),
        }
        transport = _mock_transport(responses)
        client = SoulAuthClient(base_url="http://testserver")
        client._client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

        try:
            with pytest.raises(ValidationError):
                await client.register_agent(
                    tenant_id="bad", agent_id="", agent_type=""
                )
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_connection_error(self):
        """Connection failure raises ConnectionError."""
        client = SoulAuthClient(base_url="http://localhost:1")
        try:
            with pytest.raises(ConnectionError):
                await client.get_health()
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_generic_server_error(self):
        """500 response raises SoulAuthError."""
        responses = {
            ("GET", "/health"): (500, {"detail": "Internal server error"}),
        }
        transport = _mock_transport(responses)
        client = SoulAuthClient(base_url="http://testserver")
        client._client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

        try:
            with pytest.raises(SoulAuthError) as exc_info:
                await client.get_health()
            assert exc_info.value.status_code == 500
        finally:
            await client.close()


# --- Test: Model Properties ---

class TestModels:
    def test_evaluation_result_allowed(self):
        """EvaluationResult.allowed returns True for GRANT."""
        result = EvaluationResult(
            decision="GRANT",
            capability_token="test",
            expires_in=300,
            granted_scopes=["*"],
            audit_id=uuid.UUID(FAKE_AUDIT_ID),
        )
        assert result.allowed is True
        assert result.denied is False

    def test_evaluation_result_denied(self):
        """EvaluationResult.denied returns True for DENY."""
        result = EvaluationResult(
            decision="DENY",
            reason="No matching rule",
            audit_id=uuid.UUID(FAKE_AUDIT_ID),
        )
        assert result.denied is True
        assert result.allowed is False
