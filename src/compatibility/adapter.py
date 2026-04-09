"""
OpenClaw/NemoClaw/Nanoclaw Compatibility Adapter.
Provides abstraction layer for agent execution environments.

Also implements the SoulAuth Universal Sidecar architecture:
  - SoulAuthSidecar: core sidecar process that attaches to any CLAW runtime
  - UniversalCLAWInterface: abstract interface for CLAW-specific adapters
  - Concrete adapters: OpenClawSidecarAdapter, NemoClawSidecarAdapter, NanoClawSidecarAdapter
  - SidecarConfig: configuration for sidecar deployment mode
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import asyncio
import hashlib
import logging
import time
import uuid

import httpx


logger = logging.getLogger("soulauth.sidecar")


# ---------------------------------------------------------------------------
# Original adapter layer (preserved for backwards compatibility)
# ---------------------------------------------------------------------------

@dataclass
class AgentExecutionContext:
    """Context for agent execution in various environments."""
    agent_id: str
    agent_type: str  # alfred, batman, oracle, etc.
    environment: str  # openclaw, nemoclaw, nanoclaw, vm, k8s
    node_id: str
    session_id: Optional[str] = None
    capabilities: Optional[Dict[str, Any]] = None
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now(timezone.utc)
        if self.capabilities is None:
            self.capabilities = {}


class EnvironmentAdapter(ABC):
    """Abstract base adapter for different agent execution environments."""

    @abstractmethod
    async def initialize_environment(self, config: Dict[str, Any]) -> bool:
        """Initialize the execution environment."""
        pass

    @abstractmethod
    async def execute_agent(self, context: AgentExecutionContext, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Execute an agent in this environment."""
        pass

    @abstractmethod
    async def terminate_agent(self, agent_id: str) -> bool:
        """Terminate an agent execution."""
        pass

    @abstractmethod
    async def get_agent_status(self, agent_id: str) -> Dict[str, Any]:
        """Get status of a running agent."""
        pass


class OpenClawAdapter(EnvironmentAdapter):
    """Adapter for OpenClaw execution environment.

    DEPRECATED: OpenClaw integration deferred to post-MVP.
    Use DreamServer or direct Ollama integration instead.
    """

    async def initialize_environment(self, config: Dict[str, Any]) -> bool:
        raise NotImplementedError(
            "OpenClaw adapter not implemented. "
            "Use DreamServer (DreamServer/) or direct Ollama integration for agent execution. "
            "OpenClaw integration planned for post-MVP release."
        )

    async def execute_agent(self, context: AgentExecutionContext, payload: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError(
            "OpenClaw adapter not implemented. "
            "Use DreamServer or direct Ollama integration for agent execution."
        )

    async def terminate_agent(self, agent_id: str) -> bool:
        raise NotImplementedError("OpenClaw adapter not implemented.")

    async def get_agent_status(self, agent_id: str) -> Dict[str, Any]:
        raise NotImplementedError("OpenClaw adapter not implemented.")


class NemoClawAdapter(EnvironmentAdapter):
    """Adapter for NemoClaw execution environment.

    DEPRECATED: NemoClaw integration deferred to post-MVP.
    Use DreamServer or direct Ollama integration instead.
    """

    async def initialize_environment(self, config: Dict[str, Any]) -> bool:
        raise NotImplementedError(
            "NemoClaw adapter not implemented. "
            "Use DreamServer or direct Ollama integration for agent execution."
        )

    async def execute_agent(self, context: AgentExecutionContext, payload: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError(
            "NemoClaw adapter not implemented. "
            "Use DreamServer or direct Ollama integration for agent execution."
        )

    async def terminate_agent(self, agent_id: str) -> bool:
        raise NotImplementedError("NemoClaw adapter not implemented.")

    async def get_agent_status(self, agent_id: str) -> Dict[str, Any]:
        raise NotImplementedError("NemoClaw adapter not implemented.")


class NanoclawAdapter(EnvironmentAdapter):
    """Adapter for Nanoclaw execution environment.

    DEPRECATED: Nanoclaw integration deferred to post-MVP.
    Use DreamServer or direct Ollama integration instead.
    """

    async def initialize_environment(self, config: Dict[str, Any]) -> bool:
        raise NotImplementedError(
            "Nanoclaw adapter not implemented. "
            "Use DreamServer or direct Ollama integration for agent execution."
        )

    async def execute_agent(self, context: AgentExecutionContext, payload: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError(
            "Nanoclaw adapter not implemented. "
            "Use DreamServer or direct Ollama integration for agent execution."
        )

    async def terminate_agent(self, agent_id: str) -> bool:
        raise NotImplementedError("Nanoclaw adapter not implemented.")

    async def get_agent_status(self, agent_id: str) -> Dict[str, Any]:
        raise NotImplementedError("Nanoclaw adapter not implemented.")


class LegacySoulKeyAdapter:
    """Adapter for legacy sk_soul_* compatibility."""

    @staticmethod
    def validate_legacy_soulkey_format(raw_key: str) -> bool:
        """Validate if a key matches the legacy sk_soul_* format."""
        return raw_key.startswith("sk_soul_")

    @staticmethod
    def convert_legacy_to_soulkey(legacy_key: str) -> Optional[str]:
        """Convert legacy sk_soul_* key to SoulAuth soulkey format."""
        if LegacySoulKeyAdapter.validate_legacy_soulkey_format(legacy_key):
            return f"converted_from_{legacy_key}"
        return None


class CompatibilityManager:
    """Manages compatibility across different execution environments."""

    def __init__(self):
        self.adapters: Dict[str, EnvironmentAdapter] = {
            "openclaw": OpenClawAdapter(),
            "nemoclaw": NemoClawAdapter(),
            "nanoclaw": NanoclawAdapter(),
        }
        self.legacy_adapter = LegacySoulKeyAdapter()

    def get_adapter(self, environment: str) -> Optional[EnvironmentAdapter]:
        """Get adapter for specified environment."""
        return self.adapters.get(environment.lower())

    async def execute_in_environment(self, environment: str, context: AgentExecutionContext,
                                   payload: Dict[str, Any]) -> Dict[str, Any]:
        """Execute agent in specified environment using appropriate adapter."""
        adapter = self.get_adapter(environment)
        if not adapter:
            raise ValueError(f"No adapter found for environment: {environment}")

        await adapter.initialize_environment({})
        return await adapter.execute_agent(context, payload)

    def validate_legacy_key(self, raw_key: str) -> bool:
        """Validate legacy key format."""
        return self.legacy_adapter.validate_legacy_soulkey_format(raw_key)

    def convert_legacy_key(self, legacy_key: str) -> Optional[str]:
        """Convert legacy key to SoulAuth format."""
        return self.legacy_adapter.convert_legacy_to_soulkey(legacy_key)


# ---------------------------------------------------------------------------
# SoulAuth Universal Sidecar Architecture
# ---------------------------------------------------------------------------

class CLAWType(str, Enum):
    """Supported CLAW runtime variants."""
    OPENCLAW = "openclaw"
    NEMOCLAW = "nemoclaw"
    NANOCLAW = "nanoclaw"


class InterceptMode(str, Enum):
    """How the sidecar intercepts traffic to/from the CLAW process."""
    PROXY = "proxy"          # Full reverse-proxy: all traffic flows through sidecar
    MIDDLEWARE = "middleware" # In-process middleware injected into CLAW's request pipeline
    HOOK = "hook"            # Lightweight pre/post hooks; CLAW calls sidecar explicitly


class SidecarStatus(str, Enum):
    """Operational status of the sidecar."""
    INITIALIZING = "initializing"
    HEALTHY = "healthy"
    DEGRADED = "degraded"  # PDP unreachable but cached tokens still valid
    UNHEALTHY = "unhealthy"
    STOPPED = "stopped"


@dataclass
class SidecarConfig:
    """
    Configuration for SoulAuth sidecar deployment.

    The sidecar attaches to a single CLAW process and mediates all
    auth-related concerns: identity registration, capability tokens,
    request validation, and audit reporting.
    """
    claw_type: CLAWType
    claw_endpoint: str = "http://localhost:8080"
    soulauth_endpoint: str = "http://localhost:9000"
    intercept_mode: InterceptMode = InterceptMode.PROXY
    auto_register: bool = True

    # Timeouts (seconds)
    pdp_timeout: float = 5.0
    health_check_interval: float = 30.0
    token_refresh_buffer: float = 30.0  # refresh tokens this many seconds before expiry

    # Resilience
    max_retries: int = 3
    retry_backoff: float = 0.5  # base seconds; exponential
    cache_tokens: bool = True
    allow_degraded_mode: bool = True  # serve cached decisions if PDP is down

    # Identity
    agent_id: Optional[str] = None  # set during registration
    agent_metadata: Optional[Dict[str, Any]] = None

    def validate(self) -> List[str]:
        """Validate configuration and return list of errors (empty = valid)."""
        errors: List[str] = []
        if not self.claw_endpoint:
            errors.append("claw_endpoint is required")
        if not self.soulauth_endpoint:
            errors.append("soulauth_endpoint is required")
        if self.pdp_timeout <= 0:
            errors.append("pdp_timeout must be positive")
        if self.health_check_interval <= 0:
            errors.append("health_check_interval must be positive")
        if self.max_retries < 0:
            errors.append("max_retries must be non-negative")
        # Validate endpoints look like URLs
        for name, url in [("claw_endpoint", self.claw_endpoint),
                          ("soulauth_endpoint", self.soulauth_endpoint)]:
            if url and not (url.startswith("http://") or url.startswith("https://")):
                errors.append(f"{name} must start with http:// or https://")
        return errors


@dataclass
class RegistrationResult:
    """Result from registering an agent with SoulAuth."""
    success: bool
    soulkey: Optional[str] = None
    agent_id: Optional[str] = None
    tenant_id: Optional[str] = None
    persona_id: Optional[str] = None
    error: Optional[str] = None


@dataclass
class CapabilityResult:
    """Result from requesting a capability token."""
    success: bool
    token: Optional[str] = None
    expires_in: Optional[int] = None
    granted_scopes: Optional[List[str]] = None
    error: Optional[str] = None


@dataclass
class ValidationResult:
    """Result from validating an inbound request token."""
    valid: bool
    claims: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@dataclass
class ActionReport:
    """Result from reporting an action to the audit trail."""
    success: bool
    audit_id: Optional[str] = None
    error: Optional[str] = None


@dataclass
class HealthStatus:
    """Health status of the sidecar and its upstream dependencies."""
    sidecar_status: SidecarStatus
    pdp_reachable: bool
    claw_reachable: bool
    cached_tokens: int
    last_pdp_contact: Optional[datetime] = None
    uptime_seconds: float = 0.0
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Token Cache
# ---------------------------------------------------------------------------

@dataclass
class _CachedToken:
    """An in-memory cached capability token with metadata."""
    token: str
    scope: str
    expires_at: float  # unix timestamp
    granted_scopes: List[str] = field(default_factory=list)


class _TokenCache:
    """
    Simple in-memory token cache keyed by scope.

    Production deployments would back this with Redis, but for the sidecar
    pattern an in-memory cache per-process is the correct model (each sidecar
    is 1:1 with a CLAW process).
    """

    def __init__(self):
        self._store: Dict[str, _CachedToken] = {}

    def get(self, scope: str) -> Optional[_CachedToken]:
        """Return a cached token if it exists and is not expired."""
        entry = self._store.get(scope)
        if entry is None:
            return None
        if entry.expires_at <= time.time():
            del self._store[scope]
            return None
        return entry

    def put(self, scope: str, token: str, expires_in: int,
            granted_scopes: Optional[List[str]] = None):
        """Cache a token for the given scope."""
        self._store[scope] = _CachedToken(
            token=token,
            scope=scope,
            expires_at=time.time() + expires_in,
            granted_scopes=granted_scopes or [],
        )

    def invalidate(self, scope: Optional[str] = None):
        """Invalidate a single scope or the entire cache."""
        if scope is None:
            self._store.clear()
        else:
            self._store.pop(scope, None)

    @property
    def size(self) -> int:
        """Number of entries (including possibly-expired ones)."""
        return len(self._store)

    def prune_expired(self) -> int:
        """Remove expired entries. Returns count of entries removed."""
        now = time.time()
        expired = [k for k, v in self._store.items() if v.expires_at <= now]
        for k in expired:
            del self._store[k]
        return len(expired)


# ---------------------------------------------------------------------------
# Universal CLAW Interface (abstract)
# ---------------------------------------------------------------------------

class UniversalCLAWInterface(ABC):
    """
    Abstract interface that any CLAW adapter must implement.

    Each CLAW variant (OpenClaw, NemoClaw, NanoClaw) has different
    conventions for configuration, environment variables, API patterns,
    and lifecycle hooks. The concrete adapter translates between the
    universal sidecar protocol and the CLAW-specific integration surface.
    """

    @abstractmethod
    async def register_agent(
        self, agent_id: str, metadata: Dict[str, Any]
    ) -> RegistrationResult:
        """
        Register the CLAW agent with SoulAuth and obtain a soulkey.

        The adapter is responsible for:
          1. Gathering CLAW-specific identity signals (env vars, config files)
          2. Calling the SoulAuth registration endpoint
          3. Persisting the returned soulkey in a CLAW-appropriate location
        """
        ...

    @abstractmethod
    async def request_capability(
        self, soulkey: str, scope: str, context: Dict[str, Any]
    ) -> CapabilityResult:
        """
        Request a short-lived capability token from the SoulAuth PDP.

        The scope string follows SoulAuth convention: "resource:action:path"
        e.g. "memory:write:cs:algorithms" or "vault:read:openai-key".
        """
        ...

    @abstractmethod
    async def validate_request(
        self, token: str, required_scope: str
    ) -> ValidationResult:
        """
        Validate an inbound capability token against a required scope.

        Returns validation result with decoded claims on success.
        """
        ...

    @abstractmethod
    async def report_action(
        self, soulkey: str, action: str, result: Dict[str, Any]
    ) -> ActionReport:
        """
        Report a completed action to the SoulAuth audit trail.

        Every CLAW action that was gated by a capability token should be
        reported so the audit log maintains a complete chain of custody.
        """
        ...

    @abstractmethod
    def get_claw_type(self) -> CLAWType:
        """Return the CLAW type this adapter serves."""
        ...

    @abstractmethod
    def get_default_config_paths(self) -> List[str]:
        """Return the default filesystem paths where this CLAW stores config."""
        ...

    @abstractmethod
    def get_env_prefix(self) -> str:
        """Return the environment variable prefix used by this CLAW."""
        ...


# ---------------------------------------------------------------------------
# Concrete CLAW Adapters
# ---------------------------------------------------------------------------

class _BaseSidecarAdapter(UniversalCLAWInterface):
    """Shared logic for all CLAW sidecar adapters."""

    def __init__(self, http_client: Optional[httpx.AsyncClient] = None,
                 soulauth_endpoint: str = "http://localhost:9000",
                 timeout: float = 5.0):
        self._client = http_client
        self._owns_client = http_client is None
        self._soulauth_endpoint = soulauth_endpoint.rstrip("/")
        self._timeout = timeout

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._timeout)
            self._owns_client = True
        return self._client

    async def close(self):
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    # -- shared HTTP helpers ------------------------------------------------

    async def _post(self, path: str, json_body: Dict[str, Any]) -> httpx.Response:
        client = await self._get_client()
        return await client.post(f"{self._soulauth_endpoint}{path}", json=json_body)

    async def _get(self, path: str, params: Optional[Dict[str, str]] = None) -> httpx.Response:
        client = await self._get_client()
        return await client.get(f"{self._soulauth_endpoint}{path}", params=params)

    # -- UniversalCLAWInterface implementation -----------------------------

    async def register_agent(
        self, agent_id: str, metadata: Dict[str, Any]
    ) -> RegistrationResult:
        try:
            body = {
                "agent_id": agent_id,
                "claw_type": self.get_claw_type().value,
                "env_prefix": self.get_env_prefix(),
                "config_paths": self.get_default_config_paths(),
                "metadata": metadata,
            }
            resp = await self._post("/api/v1/agents/register", body)
            if resp.status_code == 200 or resp.status_code == 201:
                data = resp.json()
                return RegistrationResult(
                    success=True,
                    soulkey=data.get("soulkey"),
                    agent_id=data.get("agent_id", agent_id),
                    tenant_id=data.get("tenant_id"),
                    persona_id=data.get("persona_id"),
                )
            return RegistrationResult(
                success=False,
                error=f"Registration failed: HTTP {resp.status_code} — {resp.text}",
            )
        except httpx.HTTPError as exc:
            return RegistrationResult(success=False, error=f"HTTP error: {exc}")

    async def request_capability(
        self, soulkey: str, scope: str, context: Dict[str, Any]
    ) -> CapabilityResult:
        try:
            parts = scope.split(":", 2)
            resource = parts[0] if len(parts) > 0 else ""
            action = parts[1] if len(parts) > 1 else ""
            scope_path = parts[2] if len(parts) > 2 else "*"

            body = {
                "soulkey": soulkey,
                "resource": resource,
                "action": action,
                "scope": scope_path,
                "context": context,
            }
            resp = await self._post("/api/v1/auth/evaluate", body)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("decision") == "grant":
                    return CapabilityResult(
                        success=True,
                        token=data.get("capability_token"),
                        expires_in=data.get("expires_in"),
                        granted_scopes=data.get("granted_scopes"),
                    )
                return CapabilityResult(
                    success=False,
                    error=data.get("reason", "PDP denied request"),
                )
            return CapabilityResult(
                success=False,
                error=f"PDP error: HTTP {resp.status_code}",
            )
        except httpx.HTTPError as exc:
            return CapabilityResult(success=False, error=f"HTTP error: {exc}")

    async def validate_request(
        self, token: str, required_scope: str
    ) -> ValidationResult:
        try:
            body = {
                "token": token,
                "required_scope": required_scope,
            }
            resp = await self._post("/api/v1/auth/validate", body)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("valid"):
                    return ValidationResult(valid=True, claims=data.get("claims"))
                return ValidationResult(valid=False, error=data.get("error", "Validation failed"))
            return ValidationResult(
                valid=False,
                error=f"Validation service error: HTTP {resp.status_code}",
            )
        except httpx.HTTPError as exc:
            return ValidationResult(valid=False, error=f"HTTP error: {exc}")

    async def report_action(
        self, soulkey: str, action: str, result: Dict[str, Any]
    ) -> ActionReport:
        try:
            body = {
                "soulkey": soulkey,
                "action": action,
                "result": result,
                "claw_type": self.get_claw_type().value,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            resp = await self._post("/api/v1/audit/report", body)
            if resp.status_code in (200, 201, 202):
                data = resp.json()
                return ActionReport(success=True, audit_id=data.get("audit_id"))
            return ActionReport(
                success=False,
                error=f"Audit report failed: HTTP {resp.status_code}",
            )
        except httpx.HTTPError as exc:
            return ActionReport(success=False, error=f"HTTP error: {exc}")


class OpenClawSidecarAdapter(_BaseSidecarAdapter):
    """
    Sidecar adapter for OpenClaw.

    OpenClaw is the standard open-source CLAW runtime. It uses:
      - OPENCLAW_ prefixed env vars
      - Config at ~/.openclaw/config.yaml or /etc/openclaw/config.yaml
      - REST API with JSON payloads
      - Standard HTTP health endpoint at /health
    """

    def get_claw_type(self) -> CLAWType:
        return CLAWType.OPENCLAW

    def get_default_config_paths(self) -> List[str]:
        return [
            "~/.openclaw/config.yaml",
            "/etc/openclaw/config.yaml",
            "./openclaw.yaml",
        ]

    def get_env_prefix(self) -> str:
        return "OPENCLAW_"


class NemoClawSidecarAdapter(_BaseSidecarAdapter):
    """
    Sidecar adapter for NemoClaw.

    NemoClaw is the NVIDIA Nemotron-powered CLAW variant. It uses:
      - NEMOCLAW_ prefixed env vars
      - Config at ~/.nemoclaw/config.yaml or /etc/nemoclaw/config.yaml
      - gRPC-first API with REST fallback
      - GPU-aware health endpoint at /health with accelerator info
    """

    def get_claw_type(self) -> CLAWType:
        return CLAWType.NEMOCLAW

    def get_default_config_paths(self) -> List[str]:
        return [
            "~/.nemoclaw/config.yaml",
            "/etc/nemoclaw/config.yaml",
            "./nemoclaw.yaml",
        ]

    def get_env_prefix(self) -> str:
        return "NEMOCLAW_"

    async def request_capability(
        self, soulkey: str, scope: str, context: Dict[str, Any]
    ) -> CapabilityResult:
        """NemoClaw enriches context with GPU/accelerator metadata."""
        enriched = {
            **context,
            "accelerator": context.get("accelerator", "nemotron"),
            "claw_variant": "nemoclaw",
        }
        return await super().request_capability(soulkey, scope, enriched)


class NanoClawSidecarAdapter(_BaseSidecarAdapter):
    """
    Sidecar adapter for NanoClaw.

    NanoClaw is the lightweight/edge CLAW variant. It uses:
      - NANOCLAW_ prefixed env vars
      - Config at ~/.nanoclaw/config.json (JSON, not YAML)
      - Minimal REST API
      - Optimised for low-memory environments; tokens are cached aggressively
    """

    def get_claw_type(self) -> CLAWType:
        return CLAWType.NANOCLAW

    def get_default_config_paths(self) -> List[str]:
        return [
            "~/.nanoclaw/config.json",
            "/etc/nanoclaw/config.json",
            "./nanoclaw.json",
        ]

    def get_env_prefix(self) -> str:
        return "NANOCLAW_"

    async def report_action(
        self, soulkey: str, action: str, result: Dict[str, Any]
    ) -> ActionReport:
        """NanoClaw batches audit reports; mark them accordingly."""
        result_with_batch = {**result, "batch_eligible": True}
        return await super().report_action(soulkey, action, result_with_batch)


# ---------------------------------------------------------------------------
# Adapter Factory
# ---------------------------------------------------------------------------

def create_sidecar_adapter(
    claw_type: CLAWType,
    http_client: Optional[httpx.AsyncClient] = None,
    soulauth_endpoint: str = "http://localhost:9000",
    timeout: float = 5.0,
) -> UniversalCLAWInterface:
    """Factory: create the correct sidecar adapter for a given CLAW type."""
    mapping = {
        CLAWType.OPENCLAW: OpenClawSidecarAdapter,
        CLAWType.NEMOCLAW: NemoClawSidecarAdapter,
        CLAWType.NANOCLAW: NanoClawSidecarAdapter,
    }
    cls = mapping.get(claw_type)
    if cls is None:
        raise ValueError(f"Unsupported CLAW type: {claw_type}")
    return cls(
        http_client=http_client,
        soulauth_endpoint=soulauth_endpoint,
        timeout=timeout,
    )


# ---------------------------------------------------------------------------
# SoulAuth Sidecar — the core orchestrator
# ---------------------------------------------------------------------------

class SoulAuthSidecar:
    """
    Core sidecar that runs alongside any CLAW process.

    Responsibilities:
      1. Intercept outbound requests from the CLAW and inject capability tokens
      2. Validate inbound requests to the CLAW by checking tokens
      3. Proxy policy evaluation requests to the SoulAuth PDP
      4. Report health status and metrics
      5. Maintain a local token cache for low-latency decisions
      6. Degrade gracefully when the PDP is unreachable

    Usage::

        config = SidecarConfig(
            claw_type=CLAWType.OPENCLAW,
            soulauth_endpoint="https://soulauth.internal:9000",
            auto_register=True,
        )
        sidecar = SoulAuthSidecar(config)
        await sidecar.start()

        # Inject auth into an outbound request
        headers = await sidecar.inject_token(
            outbound_headers={},
            scope="memory:write:cs:algorithms",
            context={"node": "claude-code-gcp"},
        )

        # Validate an inbound request
        result = await sidecar.validate_inbound(
            token=request.headers["Authorization"],
            required_scope="vault:read:openai-key",
        )

        await sidecar.stop()
    """

    def __init__(
        self,
        config: SidecarConfig,
        http_client: Optional[httpx.AsyncClient] = None,
    ):
        errors = config.validate()
        if errors:
            raise ValueError(f"Invalid sidecar config: {'; '.join(errors)}")

        self._config = config
        self._adapter: UniversalCLAWInterface = create_sidecar_adapter(
            claw_type=config.claw_type,
            http_client=http_client,
            soulauth_endpoint=config.soulauth_endpoint,
            timeout=config.pdp_timeout,
        )
        self._token_cache = _TokenCache()
        self._soulkey: Optional[str] = None
        self._status = SidecarStatus.INITIALIZING
        self._started_at: Optional[float] = None
        self._last_pdp_contact: Optional[datetime] = None
        self._health_task: Optional[asyncio.Task] = None
        self._http_client = http_client
        self._owns_client = http_client is None

    # -- Properties --------------------------------------------------------

    @property
    def config(self) -> SidecarConfig:
        return self._config

    @property
    def status(self) -> SidecarStatus:
        return self._status

    @property
    def soulkey(self) -> Optional[str]:
        return self._soulkey

    @property
    def adapter(self) -> UniversalCLAWInterface:
        return self._adapter

    # -- Lifecycle ---------------------------------------------------------

    async def start(self) -> bool:
        """
        Start the sidecar.

        If auto_register is True, registers the agent with SoulAuth and
        obtains a soulkey. Starts background health-check loop.
        Returns True if the sidecar is operational.
        """
        self._started_at = time.time()
        self._status = SidecarStatus.INITIALIZING
        logger.info(
            "Starting SoulAuth sidecar for %s at %s",
            self._config.claw_type.value,
            self._config.claw_endpoint,
        )

        if self._config.auto_register:
            reg = await self._register_with_retry()
            if reg.success:
                self._soulkey = reg.soulkey
                self._config.agent_id = reg.agent_id
                self._last_pdp_contact = datetime.now(timezone.utc)
                logger.info("Agent registered: %s", reg.agent_id)
            else:
                logger.warning("Agent registration failed: %s", reg.error)
                if not self._config.allow_degraded_mode:
                    self._status = SidecarStatus.UNHEALTHY
                    return False
                self._status = SidecarStatus.DEGRADED
                return True

        self._status = SidecarStatus.HEALTHY
        return True

    async def stop(self):
        """Stop the sidecar and clean up resources."""
        logger.info("Stopping SoulAuth sidecar")
        if self._health_task and not self._health_task.done():
            self._health_task.cancel()
            try:
                await self._health_task
            except asyncio.CancelledError:
                pass
        self._token_cache.invalidate()
        self._status = SidecarStatus.STOPPED
        # Close the adapter's HTTP client if we own it
        if hasattr(self._adapter, "close"):
            await self._adapter.close()

    # -- Core operations ---------------------------------------------------

    async def inject_token(
        self,
        outbound_headers: Dict[str, str],
        scope: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, str]:
        """
        Inject a capability token into outbound request headers.

        If a valid cached token exists for the scope, uses it.
        Otherwise, requests a new token from the PDP.

        Returns the headers dict with an Authorization header added.
        """
        context = context or {}

        # Check cache first
        if self._config.cache_tokens:
            cached = self._token_cache.get(scope)
            if cached is not None:
                # Check if token needs refresh (near expiry)
                remaining = cached.expires_at - time.time()
                if remaining > self._config.token_refresh_buffer:
                    headers = dict(outbound_headers)
                    headers["Authorization"] = f"Bearer {cached.token}"
                    headers["X-SoulAuth-Scope"] = scope
                    return headers

        # Request new token
        if not self._soulkey:
            logger.warning("No soulkey available; cannot inject token")
            return dict(outbound_headers)

        result = await self._adapter.request_capability(self._soulkey, scope, context)
        if result.success and result.token:
            self._last_pdp_contact = datetime.now(timezone.utc)
            if self._status == SidecarStatus.DEGRADED:
                self._status = SidecarStatus.HEALTHY

            # Cache the token
            if self._config.cache_tokens and result.expires_in:
                self._token_cache.put(
                    scope, result.token, result.expires_in, result.granted_scopes
                )

            headers = dict(outbound_headers)
            headers["Authorization"] = f"Bearer {result.token}"
            headers["X-SoulAuth-Scope"] = scope
            return headers

        # Fallback: try cached (even near-expiry) in degraded mode
        if self._config.allow_degraded_mode and self._config.cache_tokens:
            cached = self._token_cache.get(scope)
            if cached is not None:
                self._status = SidecarStatus.DEGRADED
                headers = dict(outbound_headers)
                headers["Authorization"] = f"Bearer {cached.token}"
                headers["X-SoulAuth-Scope"] = scope
                headers["X-SoulAuth-Degraded"] = "true"
                return headers

        logger.error("Failed to obtain capability token for scope %s: %s", scope, result.error)
        return dict(outbound_headers)

    async def validate_inbound(
        self, token: str, required_scope: str
    ) -> ValidationResult:
        """
        Validate an inbound request's capability token.

        Delegates to the SoulAuth validation endpoint. On network failure
        and if degraded mode is allowed, returns a degraded-invalid result
        rather than crashing.
        """
        result = await self._adapter.validate_request(token, required_scope)
        if result.valid:
            self._last_pdp_contact = datetime.now(timezone.utc)
        return result

    async def report_action(
        self, action: str, result: Dict[str, Any]
    ) -> ActionReport:
        """Report an action to the SoulAuth audit trail."""
        if not self._soulkey:
            return ActionReport(success=False, error="No soulkey available")
        return await self._adapter.report_action(self._soulkey, action, result)

    async def health_check(self) -> HealthStatus:
        """
        Perform a health check on the sidecar and its dependencies.

        Checks:
          - PDP reachability (GET /health on soulauth_endpoint)
          - CLAW reachability (GET /health on claw_endpoint)
          - Token cache state
        """
        pdp_ok = False
        claw_ok = False

        client = self._http_client
        close_after = False
        if client is None:
            client = httpx.AsyncClient(timeout=self._config.pdp_timeout)
            close_after = True

        try:
            # Check PDP
            try:
                resp = await client.get(
                    f"{self._config.soulauth_endpoint.rstrip('/')}/health"
                )
                pdp_ok = resp.status_code == 200
                if pdp_ok:
                    self._last_pdp_contact = datetime.now(timezone.utc)
            except httpx.HTTPError:
                pdp_ok = False

            # Check CLAW
            try:
                resp = await client.get(
                    f"{self._config.claw_endpoint.rstrip('/')}/health"
                )
                claw_ok = resp.status_code == 200
            except httpx.HTTPError:
                claw_ok = False
        finally:
            if close_after:
                await client.aclose()

        # Prune cache
        self._token_cache.prune_expired()

        # Determine overall status
        if pdp_ok and claw_ok:
            new_status = SidecarStatus.HEALTHY
        elif not pdp_ok and self._config.allow_degraded_mode and self._token_cache.size > 0:
            new_status = SidecarStatus.DEGRADED
        elif not pdp_ok:
            new_status = SidecarStatus.UNHEALTHY
        else:
            # PDP ok but CLAW not — we're still operational for auth
            new_status = SidecarStatus.DEGRADED

        if self._status != SidecarStatus.STOPPED:
            self._status = new_status

        uptime = time.time() - self._started_at if self._started_at else 0.0

        return HealthStatus(
            sidecar_status=self._status,
            pdp_reachable=pdp_ok,
            claw_reachable=claw_ok,
            cached_tokens=self._token_cache.size,
            last_pdp_contact=self._last_pdp_contact,
            uptime_seconds=uptime,
        )

    # -- Internal helpers --------------------------------------------------

    async def _register_with_retry(self) -> RegistrationResult:
        """Register the agent, retrying on transient failures."""
        agent_id = self._config.agent_id or str(uuid.uuid4())
        metadata = self._config.agent_metadata or {}
        metadata["claw_type"] = self._config.claw_type.value
        metadata["intercept_mode"] = self._config.intercept_mode.value

        last_error: Optional[str] = None
        for attempt in range(max(1, self._config.max_retries)):
            result = await self._adapter.register_agent(agent_id, metadata)
            if result.success:
                return result
            last_error = result.error
            if attempt < self._config.max_retries - 1:
                delay = self._config.retry_backoff * (2 ** attempt)
                await asyncio.sleep(delay)

        return RegistrationResult(
            success=False,
            error=f"Registration failed after {self._config.max_retries} attempts: {last_error}",
        )
