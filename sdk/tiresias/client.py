"""
Tiresias Python SDK client.
Async HTTP client for the Tiresias zero-trust authorization API.
"""

from __future__ import annotations

from typing import Any, Optional

import httpx

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
    AuditReport,
    EvaluationResult,
    HealthStatus,
    IdentityInfo,
    TokenResponse,
    TrialRegistration,
    TrialActivation,
    WhoamiInfo,
)


class TiresiasClient:
    """
    Async client for the Tiresias API.

    Usage::

        async with TiresiasClient("https://tiresias.network") as client:
            health = await client.get_health()
            identity = await client.resolve_identity("sk_agent_...")
            result = await client.evaluate_access(
                soulkey="sk_agent_...",
                resource="memory",
                action="read",
                scope="cs:*",
            )
            if result.allowed:
                print(f"Token: {result.capability_token}")
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        api_key: Optional[str] = None,
        timeout: float = 30.0,
    ):
        """
        Initialize the Tiresias client.

        Args:
            base_url: Base URL of the Tiresias API (e.g. "https://tiresias.network").
            api_key: Optional API key for Authorization header.
            timeout: HTTP request timeout in seconds.
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Lazily create the httpx client."""
        if self._client is None or self._client.is_closed:
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                headers=headers,
            )
        return self._client

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def __aenter__(self) -> TiresiasClient:
        await self._get_client()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.close()

    def _raise_for_status(self, response: httpx.Response) -> None:
        """Map HTTP error codes to typed SDK exceptions."""
        if response.is_success:
            return

        try:
            body = response.json()
        except Exception:
            body = {"detail": response.text}

        detail_msg = body.get("detail", response.text)
        status = response.status_code

        if status == 401:
            if "expired" in str(detail_msg).lower():
                raise TokenExpiredError(detail_msg, detail=body)
            raise AuthenticationError(detail_msg, detail=body)
        elif status == 403:
            raise AuthorizationError(detail_msg, detail=body)
        elif status == 404:
            raise NotFoundError(detail_msg, detail=body)
        elif status == 422:
            raise ValidationError(detail_msg, detail=body)
        elif status == 429:
            retry_after = response.headers.get("Retry-After")
            raise RateLimitError(
                detail_msg,
                retry_after=int(retry_after) if retry_after else None,
                detail=body,
            )
        else:
            raise TiresiasError(detail_msg, status_code=status, detail=body)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        params: Optional[dict] = None,
        headers: Optional[dict] = None,
    ) -> dict:
        """Execute an HTTP request with error handling."""
        client = await self._get_client()
        try:
            response = await client.request(
                method, path, json=json, params=params, headers=headers or {}
            )
        except httpx.ConnectError as e:
            raise ConnectionError(f"Cannot connect to Tiresias at {self.base_url}: {e}")
        except httpx.TimeoutException as e:
            raise ConnectionError(f"Request to Tiresias timed out: {e}")
        except httpx.HTTPError as e:
            raise ConnectionError(f"HTTP error communicating with Tiresias: {e}")

        self._raise_for_status(response)
        return response.json()

    # --- Health ---

    async def get_health(self) -> HealthStatus:
        """Check the Tiresias service health."""
        data = await self._request("GET", "/health")
        return HealthStatus(**data)

    # --- Agent Registration ---

    async def register_agent(
        self,
        tenant_id: str,
        agent_id: str,
        agent_type: str = "agent",
        label: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> AgentRegistration:
        """
        Register a new agent and receive a SoulKey.

        Args:
            tenant_id: UUID of the tenant this agent belongs to.
            agent_id: Persona identifier (e.g. "alfred", "oracle").
            agent_type: Agent type label for metadata.
            label: Human-readable label for the SoulKey.
            metadata: Arbitrary metadata dict to attach.

        Returns:
            AgentRegistration with the raw SoulKey (shown once).
        """
        payload = {
            "tenant_id": tenant_id,
            "persona_id": agent_id,
            "label": label or f"{agent_id} ({agent_type})",
            "metadata": metadata or {"agent_type": agent_type},
        }
        data = await self._request("POST", "/v1/soulauth/admin/keys", json=payload)
        return AgentRegistration(**data)

    # --- Identity ---

    async def resolve_identity(self, soulkey: str) -> IdentityInfo:
        """
        Resolve agent identity from a SoulKey.

        Args:
            soulkey: Raw SoulKey string (e.g. "sk_agent_...").

        Returns:
            IdentityInfo with agent persona, tenant, and status.
        """
        data = await self._request(
            "GET", "/v1/auth/identity", headers={"X-Soulkey": soulkey}
        )
        return IdentityInfo(**data)

    async def whoami(self, soulkey: str) -> WhoamiInfo:
        """
        Agent self-inspection.

        Args:
            soulkey: Raw SoulKey string.

        Returns:
            WhoamiInfo with persona, permissions summary.
        """
        data = await self._request(
            "GET", "/v1/auth/whoami", headers={"X-Soulkey": soulkey}
        )
        return WhoamiInfo(**data)

    # --- Token & Access Evaluation ---

    async def request_token(
        self,
        soulkey: str,
        resource: str,
        action: str,
        scope: str,
        context: Optional[dict] = None,
    ) -> TokenResponse:
        """
        Request a capability token through the PDP.

        Evaluates the policy and, if granted, returns a short-lived
        capability token (JWT) scoped to the requested action.

        Args:
            soulkey: Raw SoulKey for authentication.
            resource: Target resource (e.g. "memory", "vault").
            action: Requested action (e.g. "read", "write").
            scope: Scope string (e.g. "cs:algorithms", "*").
            context: Optional context dict for policy evaluation.

        Returns:
            TokenResponse with decision and optional capability token.
        """
        payload: dict[str, Any] = {
            "resource": resource,
            "action": action,
            "scope": scope,
        }
        if context:
            payload["context"] = context

        data = await self._request(
            "POST",
            "/v1/auth/evaluate",
            json=payload,
            headers={"X-Soulkey": soulkey},
        )
        return TokenResponse(**data)

    async def evaluate_access(
        self,
        soulkey: str,
        resource: str,
        action: str,
        scope: str = "*",
        context: Optional[dict] = None,
    ) -> EvaluationResult:
        """
        Evaluate whether an agent is allowed to perform an action.

        Convenience wrapper around request_token that returns a typed
        EvaluationResult with .allowed / .denied properties.

        Args:
            soulkey: Raw SoulKey for authentication.
            resource: Target resource (e.g. "memory", "vault").
            action: Requested action (e.g. "read", "write").
            scope: Scope string (default "*").
            context: Optional context dict.

        Returns:
            EvaluationResult with decision, token (if granted), and reason.
        """
        payload: dict[str, Any] = {
            "resource": resource,
            "action": action,
            "scope": scope,
        }
        if context:
            payload["context"] = context

        data = await self._request(
            "POST",
            "/v1/auth/evaluate",
            json=payload,
            headers={"X-Soulkey": soulkey},
        )
        return EvaluationResult(**data)

    # --- Audit ---

    async def list_audit_events(
        self,
        tenant_id: str,
        event_type: Optional[str] = None,
        persona_id: Optional[str] = None,
        limit: int = 100,
    ) -> AuditReport:
        """
        Query the audit log.

        Args:
            tenant_id: UUID of the tenant to query.
            event_type: Filter by event type.
            persona_id: Filter by persona.
            limit: Max events to return (default 100).

        Returns:
            AuditReport with list of AuditEvent entries.
        """
        params: dict[str, Any] = {
            "tenant_id": tenant_id,
            "limit": limit,
        }
        if event_type:
            params["event_type"] = event_type
        if persona_id:
            params["persona_id"] = persona_id

        data = await self._request(
            "GET", "/v1/soulauth/admin/audit/report", params=params
        )
        return AuditReport(**data)

    # --- Trial ---

    async def register_trial(
        self,
        contact_name: str,
        contact_email: str,
        company_name: str,
        company_domain: str,
        use_case: Optional[str] = None,
    ) -> TrialRegistration:
        """
        Register for a trial account.

        Args:
            contact_name: Name of the contact person.
            contact_email: Email address for verification.
            company_name: Company name.
            company_domain: Company domain (e.g. "saluca.com").
            use_case: Optional description of use case.

        Returns:
            TrialRegistration with trial_id and verification status.
        """
        payload: dict[str, Any] = {
            "contact_name": contact_name,
            "contact_email": contact_email,
            "company_name": company_name,
            "company_domain": company_domain,
        }
        if use_case:
            payload["use_case"] = use_case

        data = await self._request("POST", "/v1/trial/register", json=payload)
        return TrialRegistration(**data)

    async def verify_trial(
        self,
        trial_id: str,
        verification_token: str,
    ) -> TrialActivation:
        """
        Verify a trial and activate it.

        Args:
            trial_id: UUID of the trial registration.
            verification_token: Verification token from email.

        Returns:
            TrialActivation with tenant_id, soulkey, and expiry.
        """
        payload = {
            "trial_id": trial_id,
            "verification_token": verification_token,
        }
        data = await self._request("POST", "/v1/trial/verify", json=payload)
        return TrialActivation(**data)
