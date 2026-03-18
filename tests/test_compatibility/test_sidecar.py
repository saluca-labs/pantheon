"""
Tests for the SoulAuth Universal Sidecar architecture.

Covers:
  - Sidecar initialization for each CLAW type
  - Token injection into outbound requests
  - Token validation on inbound requests
  - Agent registration flow
  - Health check relay
  - Config validation
  - Graceful degradation when PDP is unreachable
  - Token cache behaviour
  - Adapter factory
"""

import asyncio
import time
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import pytest_asyncio

from src.compatibility.adapter import (
    ActionReport,
    CapabilityResult,
    CLAWType,
    HealthStatus,
    InterceptMode,
    NanoClawSidecarAdapter,
    NemoClawSidecarAdapter,
    OpenClawSidecarAdapter,
    RegistrationResult,
    SidecarConfig,
    SidecarStatus,
    SoulAuthSidecar,
    UniversalCLAWInterface,
    ValidationResult,
    _TokenCache,
    create_sidecar_adapter,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_config(**overrides) -> SidecarConfig:
    """Build a SidecarConfig with sane test defaults."""
    defaults = dict(
        claw_type=CLAWType.OPENCLAW,
        claw_endpoint="http://localhost:8080",
        soulauth_endpoint="http://localhost:9000",
        intercept_mode=InterceptMode.PROXY,
        auto_register=False,
        pdp_timeout=2.0,
        health_check_interval=10.0,
        max_retries=2,
        retry_backoff=0.01,  # fast retries in tests
        cache_tokens=True,
        allow_degraded_mode=True,
    )
    defaults.update(overrides)
    return SidecarConfig(**defaults)


def _mock_adapter(claw_type: CLAWType = CLAWType.OPENCLAW) -> AsyncMock:
    """Create a mock UniversalCLAWInterface."""
    adapter = AsyncMock(spec=UniversalCLAWInterface)
    adapter.get_claw_type.return_value = claw_type
    adapter.get_default_config_paths.return_value = ["/etc/test/config.yaml"]
    adapter.get_env_prefix.return_value = "TEST_"
    adapter.close = AsyncMock()
    return adapter


# ---------------------------------------------------------------------------
# 1. Config validation
# ---------------------------------------------------------------------------

class TestSidecarConfig:
    """Tests for SidecarConfig validation."""

    def test_valid_config(self):
        """A well-formed config validates without errors."""
        cfg = _make_config()
        assert cfg.validate() == []

    def test_missing_claw_endpoint(self):
        """Empty claw_endpoint is rejected."""
        cfg = _make_config(claw_endpoint="")
        errors = cfg.validate()
        assert any("claw_endpoint" in e for e in errors)

    def test_missing_soulauth_endpoint(self):
        """Empty soulauth_endpoint is rejected."""
        cfg = _make_config(soulauth_endpoint="")
        errors = cfg.validate()
        assert any("soulauth_endpoint" in e for e in errors)

    def test_bad_timeout(self):
        """Non-positive pdp_timeout is rejected."""
        cfg = _make_config(pdp_timeout=0)
        errors = cfg.validate()
        assert any("pdp_timeout" in e for e in errors)

    def test_bad_health_interval(self):
        """Non-positive health_check_interval is rejected."""
        cfg = _make_config(health_check_interval=-1)
        errors = cfg.validate()
        assert any("health_check_interval" in e for e in errors)

    def test_bad_url_scheme(self):
        """Endpoints without http(s) scheme are rejected."""
        cfg = _make_config(claw_endpoint="ftp://bad")
        errors = cfg.validate()
        assert any("claw_endpoint" in e for e in errors)

    def test_negative_retries(self):
        """Negative max_retries is rejected."""
        cfg = _make_config(max_retries=-1)
        errors = cfg.validate()
        assert any("max_retries" in e for e in errors)


# ---------------------------------------------------------------------------
# 2. Adapter factory
# ---------------------------------------------------------------------------

class TestAdapterFactory:
    """Tests for create_sidecar_adapter factory."""

    def test_create_openclaw_adapter(self):
        adapter = create_sidecar_adapter(CLAWType.OPENCLAW)
        assert isinstance(adapter, OpenClawSidecarAdapter)
        assert adapter.get_claw_type() == CLAWType.OPENCLAW

    def test_create_nemoclaw_adapter(self):
        adapter = create_sidecar_adapter(CLAWType.NEMOCLAW)
        assert isinstance(adapter, NemoClawSidecarAdapter)
        assert adapter.get_claw_type() == CLAWType.NEMOCLAW

    def test_create_nanoclaw_adapter(self):
        adapter = create_sidecar_adapter(CLAWType.NANOCLAW)
        assert isinstance(adapter, NanoClawSidecarAdapter)
        assert adapter.get_claw_type() == CLAWType.NANOCLAW

    def test_unsupported_type_raises(self):
        with pytest.raises(ValueError, match="Unsupported CLAW type"):
            create_sidecar_adapter("imaginary_claw")


# ---------------------------------------------------------------------------
# 3. Sidecar initialization per CLAW type
# ---------------------------------------------------------------------------

class TestSidecarInit:
    """Tests for sidecar initialization across CLAW types."""

    @pytest.mark.asyncio
    async def test_init_openclaw(self):
        cfg = _make_config(claw_type=CLAWType.OPENCLAW)
        sidecar = SoulAuthSidecar(cfg)
        assert sidecar.status == SidecarStatus.INITIALIZING
        assert isinstance(sidecar.adapter, OpenClawSidecarAdapter)
        await sidecar.stop()

    @pytest.mark.asyncio
    async def test_init_nemoclaw(self):
        cfg = _make_config(claw_type=CLAWType.NEMOCLAW)
        sidecar = SoulAuthSidecar(cfg)
        assert isinstance(sidecar.adapter, NemoClawSidecarAdapter)
        await sidecar.stop()

    @pytest.mark.asyncio
    async def test_init_nanoclaw(self):
        cfg = _make_config(claw_type=CLAWType.NANOCLAW)
        sidecar = SoulAuthSidecar(cfg)
        assert isinstance(sidecar.adapter, NanoClawSidecarAdapter)
        await sidecar.stop()

    def test_invalid_config_raises(self):
        """SoulAuthSidecar rejects invalid configuration at init."""
        cfg = _make_config(claw_endpoint="")
        with pytest.raises(ValueError, match="Invalid sidecar config"):
            SoulAuthSidecar(cfg)

    @pytest.mark.asyncio
    async def test_start_without_auto_register(self):
        """Start succeeds immediately when auto_register is False."""
        cfg = _make_config(auto_register=False)
        sidecar = SoulAuthSidecar(cfg)
        ok = await sidecar.start()
        assert ok is True
        assert sidecar.status == SidecarStatus.HEALTHY
        await sidecar.stop()
        assert sidecar.status == SidecarStatus.STOPPED


# ---------------------------------------------------------------------------
# 4. Agent registration flow
# ---------------------------------------------------------------------------

class TestRegistration:
    """Tests for agent registration through the sidecar."""

    @pytest.mark.asyncio
    async def test_auto_register_success(self):
        """Successful auto-registration sets soulkey and HEALTHY status."""
        cfg = _make_config(auto_register=True)
        sidecar = SoulAuthSidecar(cfg)

        mock_adapter = _mock_adapter()
        mock_adapter.register_agent.return_value = RegistrationResult(
            success=True,
            soulkey="sk_agent_test_alfred_abc123",
            agent_id="agent-001",
            tenant_id="tid-001",
            persona_id="alfred",
        )
        sidecar._adapter = mock_adapter

        ok = await sidecar.start()
        assert ok is True
        assert sidecar.soulkey == "sk_agent_test_alfred_abc123"
        assert sidecar.status == SidecarStatus.HEALTHY
        await sidecar.stop()

    @pytest.mark.asyncio
    async def test_auto_register_failure_degraded(self):
        """Failed registration enters DEGRADED mode when allowed."""
        cfg = _make_config(auto_register=True, allow_degraded_mode=True)
        sidecar = SoulAuthSidecar(cfg)

        mock_adapter = _mock_adapter()
        mock_adapter.register_agent.return_value = RegistrationResult(
            success=False, error="connection refused",
        )
        sidecar._adapter = mock_adapter

        ok = await sidecar.start()
        assert ok is True
        assert sidecar.status == SidecarStatus.DEGRADED
        assert sidecar.soulkey is None
        await sidecar.stop()

    @pytest.mark.asyncio
    async def test_auto_register_failure_strict(self):
        """Failed registration returns False when degraded mode is disallowed."""
        cfg = _make_config(auto_register=True, allow_degraded_mode=False)
        sidecar = SoulAuthSidecar(cfg)

        mock_adapter = _mock_adapter()
        mock_adapter.register_agent.return_value = RegistrationResult(
            success=False, error="connection refused",
        )
        sidecar._adapter = mock_adapter

        ok = await sidecar.start()
        assert ok is False
        assert sidecar.status == SidecarStatus.UNHEALTHY
        await sidecar.stop()

    @pytest.mark.asyncio
    async def test_register_retries(self):
        """Registration retries on transient failure."""
        cfg = _make_config(auto_register=True, max_retries=3, retry_backoff=0.01)
        sidecar = SoulAuthSidecar(cfg)

        mock_adapter = _mock_adapter()
        # Fail twice, succeed third time
        mock_adapter.register_agent.side_effect = [
            RegistrationResult(success=False, error="timeout"),
            RegistrationResult(success=False, error="timeout"),
            RegistrationResult(
                success=True, soulkey="sk_agent_test_alfred_xyz",
                agent_id="a-1", tenant_id="t-1", persona_id="alfred",
            ),
        ]
        sidecar._adapter = mock_adapter

        ok = await sidecar.start()
        assert ok is True
        assert sidecar.soulkey == "sk_agent_test_alfred_xyz"
        assert mock_adapter.register_agent.call_count == 3
        await sidecar.stop()


# ---------------------------------------------------------------------------
# 5. Token injection into outbound requests
# ---------------------------------------------------------------------------

class TestTokenInjection:
    """Tests for injecting capability tokens into outbound requests."""

    @pytest.mark.asyncio
    async def test_inject_token_success(self):
        """Successful token injection adds Authorization header."""
        cfg = _make_config()
        sidecar = SoulAuthSidecar(cfg)
        await sidecar.start()

        sidecar._soulkey = "sk_agent_test_alfred_abc"

        mock_adapter = _mock_adapter()
        mock_adapter.request_capability.return_value = CapabilityResult(
            success=True,
            token="jwt.token.here",
            expires_in=300,
            granted_scopes=["memory:write:cs:algorithms"],
        )
        sidecar._adapter = mock_adapter

        headers = await sidecar.inject_token(
            outbound_headers={"Content-Type": "application/json"},
            scope="memory:write:cs:algorithms",
        )
        assert headers["Authorization"] == "Bearer jwt.token.here"
        assert headers["X-SoulAuth-Scope"] == "memory:write:cs:algorithms"
        assert headers["Content-Type"] == "application/json"
        await sidecar.stop()

    @pytest.mark.asyncio
    async def test_inject_token_uses_cache(self):
        """Subsequent calls for the same scope use the cache."""
        cfg = _make_config()
        sidecar = SoulAuthSidecar(cfg)
        await sidecar.start()
        sidecar._soulkey = "sk_test"

        mock_adapter = _mock_adapter()
        mock_adapter.request_capability.return_value = CapabilityResult(
            success=True, token="jwt.cached", expires_in=300,
            granted_scopes=["memory:read:*"],
        )
        sidecar._adapter = mock_adapter

        # First call — hits PDP
        h1 = await sidecar.inject_token({}, "memory:read:*")
        assert h1["Authorization"] == "Bearer jwt.cached"
        assert mock_adapter.request_capability.call_count == 1

        # Second call — should use cache, not call PDP again
        h2 = await sidecar.inject_token({}, "memory:read:*")
        assert h2["Authorization"] == "Bearer jwt.cached"
        assert mock_adapter.request_capability.call_count == 1  # still 1

        await sidecar.stop()

    @pytest.mark.asyncio
    async def test_inject_token_no_soulkey(self):
        """Without a soulkey, injection returns original headers unchanged."""
        cfg = _make_config()
        sidecar = SoulAuthSidecar(cfg)
        await sidecar.start()
        # soulkey is None

        headers = await sidecar.inject_token(
            {"X-Custom": "value"}, "vault:read:secret",
        )
        assert "Authorization" not in headers
        assert headers["X-Custom"] == "value"
        await sidecar.stop()

    @pytest.mark.asyncio
    async def test_inject_token_pdp_failure_degraded(self):
        """When PDP fails but cache has a near-expiry token, returns it with degraded header."""
        cfg = _make_config(allow_degraded_mode=True)
        # Set token_refresh_buffer high so cached token is considered "near expiry"
        cfg.token_refresh_buffer = 9999.0
        sidecar = SoulAuthSidecar(cfg)
        await sidecar.start()
        sidecar._soulkey = "sk_test"

        # Pre-populate cache with a token that is within the refresh buffer
        # (expires in 600s but refresh buffer is 9999s, so it looks "near expiry")
        sidecar._token_cache.put("vault:read:key", "jwt.old", 600)

        mock_adapter = _mock_adapter()
        mock_adapter.request_capability.return_value = CapabilityResult(
            success=False, error="PDP unreachable",
        )
        sidecar._adapter = mock_adapter

        headers = await sidecar.inject_token({}, "vault:read:key")
        assert headers["Authorization"] == "Bearer jwt.old"
        assert headers.get("X-SoulAuth-Degraded") == "true"
        assert sidecar.status == SidecarStatus.DEGRADED
        await sidecar.stop()


# ---------------------------------------------------------------------------
# 6. Token validation on inbound requests
# ---------------------------------------------------------------------------

class TestTokenValidation:
    """Tests for validating inbound capability tokens."""

    @pytest.mark.asyncio
    async def test_validate_inbound_success(self):
        cfg = _make_config()
        sidecar = SoulAuthSidecar(cfg)
        await sidecar.start()

        mock_adapter = _mock_adapter()
        mock_adapter.validate_request.return_value = ValidationResult(
            valid=True,
            claims={"sub": "sk-id", "scp": ["memory:read:*"], "pid": "alfred"},
        )
        sidecar._adapter = mock_adapter

        result = await sidecar.validate_inbound("Bearer jwt.tok", "memory:read:cs:algo")
        assert result.valid is True
        assert result.claims["pid"] == "alfred"
        await sidecar.stop()

    @pytest.mark.asyncio
    async def test_validate_inbound_failure(self):
        cfg = _make_config()
        sidecar = SoulAuthSidecar(cfg)
        await sidecar.start()

        mock_adapter = _mock_adapter()
        mock_adapter.validate_request.return_value = ValidationResult(
            valid=False, error="token expired",
        )
        sidecar._adapter = mock_adapter

        result = await sidecar.validate_inbound("Bearer expired", "vault:read:*")
        assert result.valid is False
        assert "expired" in result.error
        await sidecar.stop()


# ---------------------------------------------------------------------------
# 7. Health check relay
# ---------------------------------------------------------------------------

class TestHealthCheck:
    """Tests for health check functionality."""

    @pytest.mark.asyncio
    async def test_health_all_ok(self):
        """When both PDP and CLAW respond 200, status is HEALTHY."""
        cfg = _make_config()
        sidecar = SoulAuthSidecar(cfg)
        await sidecar.start()

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.aclose = AsyncMock()
        sidecar._http_client = mock_client

        health = await sidecar.health_check()
        assert health.pdp_reachable is True
        assert health.claw_reachable is True
        assert health.sidecar_status == SidecarStatus.HEALTHY
        assert health.uptime_seconds > 0
        await sidecar.stop()

    @pytest.mark.asyncio
    async def test_health_pdp_down_degraded(self):
        """When PDP is down but cache exists, status is DEGRADED."""
        cfg = _make_config(allow_degraded_mode=True)
        sidecar = SoulAuthSidecar(cfg)
        await sidecar.start()

        # Pre-populate cache so degraded mode kicks in
        sidecar._token_cache.put("test:scope", "tok", 300)

        mock_client = AsyncMock(spec=httpx.AsyncClient)

        async def _get(url, **kwargs):
            if "9000" in url:  # soulauth
                raise httpx.ConnectError("refused")
            resp = MagicMock()
            resp.status_code = 200
            return resp

        mock_client.get = AsyncMock(side_effect=_get)
        mock_client.aclose = AsyncMock()
        sidecar._http_client = mock_client

        health = await sidecar.health_check()
        assert health.pdp_reachable is False
        assert health.claw_reachable is True
        assert health.sidecar_status == SidecarStatus.DEGRADED
        assert health.cached_tokens == 1
        await sidecar.stop()

    @pytest.mark.asyncio
    async def test_health_pdp_down_unhealthy(self):
        """When PDP is down and no cache, status is UNHEALTHY."""
        cfg = _make_config(allow_degraded_mode=True)
        sidecar = SoulAuthSidecar(cfg)
        await sidecar.start()
        # No cache entries

        mock_client = AsyncMock(spec=httpx.AsyncClient)

        async def _get(url, **kwargs):
            if "9000" in url:
                raise httpx.ConnectError("refused")
            resp = MagicMock()
            resp.status_code = 200
            return resp

        mock_client.get = AsyncMock(side_effect=_get)
        mock_client.aclose = AsyncMock()
        sidecar._http_client = mock_client

        health = await sidecar.health_check()
        assert health.pdp_reachable is False
        assert health.sidecar_status == SidecarStatus.UNHEALTHY
        await sidecar.stop()


# ---------------------------------------------------------------------------
# 8. Token cache
# ---------------------------------------------------------------------------

class TestTokenCache:
    """Tests for the internal token cache."""

    def test_put_and_get(self):
        cache = _TokenCache()
        cache.put("scope:a", "tok-a", 300)
        entry = cache.get("scope:a")
        assert entry is not None
        assert entry.token == "tok-a"

    def test_get_expired(self):
        cache = _TokenCache()
        cache.put("scope:b", "tok-b", 0)  # expires immediately
        # Wait a tiny bit to ensure it's past
        import time as _time
        _time.sleep(0.01)
        assert cache.get("scope:b") is None

    def test_invalidate_single(self):
        cache = _TokenCache()
        cache.put("s1", "t1", 300)
        cache.put("s2", "t2", 300)
        cache.invalidate("s1")
        assert cache.get("s1") is None
        assert cache.get("s2") is not None

    def test_invalidate_all(self):
        cache = _TokenCache()
        cache.put("s1", "t1", 300)
        cache.put("s2", "t2", 300)
        cache.invalidate()
        assert cache.size == 0

    def test_prune_expired(self):
        cache = _TokenCache()
        cache.put("live", "t1", 300)
        cache.put("dead", "t2", 0)
        import time as _time
        _time.sleep(0.01)
        removed = cache.prune_expired()
        assert removed == 1
        assert cache.size == 1
        assert cache.get("live") is not None


# ---------------------------------------------------------------------------
# 9. CLAW-specific adapter properties
# ---------------------------------------------------------------------------

class TestAdapterProperties:
    """Tests for CLAW-specific adapter configuration."""

    def test_openclaw_env_prefix(self):
        adapter = OpenClawSidecarAdapter()
        assert adapter.get_env_prefix() == "OPENCLAW_"
        assert "openclaw" in adapter.get_default_config_paths()[0]

    def test_nemoclaw_env_prefix(self):
        adapter = NemoClawSidecarAdapter()
        assert adapter.get_env_prefix() == "NEMOCLAW_"
        assert "nemoclaw" in adapter.get_default_config_paths()[0]

    def test_nanoclaw_env_prefix(self):
        adapter = NanoClawSidecarAdapter()
        assert adapter.get_env_prefix() == "NANOCLAW_"
        # NanoClaw uses JSON, not YAML
        assert adapter.get_default_config_paths()[0].endswith(".json")


# ---------------------------------------------------------------------------
# 10. Action reporting
# ---------------------------------------------------------------------------

class TestActionReporting:
    """Tests for audit trail action reporting."""

    @pytest.mark.asyncio
    async def test_report_action_success(self):
        cfg = _make_config()
        sidecar = SoulAuthSidecar(cfg)
        await sidecar.start()
        sidecar._soulkey = "sk_test"

        mock_adapter = _mock_adapter()
        mock_adapter.report_action.return_value = ActionReport(
            success=True, audit_id="audit-001",
        )
        sidecar._adapter = mock_adapter

        report = await sidecar.report_action(
            "memory:write", {"status": "ok", "bytes_written": 1024},
        )
        assert report.success is True
        assert report.audit_id == "audit-001"
        await sidecar.stop()

    @pytest.mark.asyncio
    async def test_report_action_no_soulkey(self):
        cfg = _make_config()
        sidecar = SoulAuthSidecar(cfg)
        await sidecar.start()
        # No soulkey set

        report = await sidecar.report_action("test:action", {})
        assert report.success is False
        assert "soulkey" in report.error.lower()
        await sidecar.stop()


# ---------------------------------------------------------------------------
# 11. Graceful degradation
# ---------------------------------------------------------------------------

class TestGracefulDegradation:
    """Tests for sidecar behaviour when PDP is unreachable."""

    @pytest.mark.asyncio
    async def test_degraded_mode_recovers_on_pdp_contact(self):
        """Sidecar transitions from DEGRADED back to HEALTHY on PDP success."""
        cfg = _make_config()
        sidecar = SoulAuthSidecar(cfg)
        await sidecar.start()
        sidecar._soulkey = "sk_test"
        sidecar._status = SidecarStatus.DEGRADED

        mock_adapter = _mock_adapter()
        mock_adapter.request_capability.return_value = CapabilityResult(
            success=True, token="jwt.fresh", expires_in=300,
            granted_scopes=["memory:read:*"],
        )
        sidecar._adapter = mock_adapter

        headers = await sidecar.inject_token({}, "memory:read:*")
        assert headers["Authorization"] == "Bearer jwt.fresh"
        assert sidecar.status == SidecarStatus.HEALTHY
        await sidecar.stop()

    @pytest.mark.asyncio
    async def test_pdp_failure_no_cache_returns_original_headers(self):
        """When PDP fails and no cache, original headers returned unmodified."""
        cfg = _make_config(allow_degraded_mode=True)
        sidecar = SoulAuthSidecar(cfg)
        await sidecar.start()
        sidecar._soulkey = "sk_test"

        mock_adapter = _mock_adapter()
        mock_adapter.request_capability.return_value = CapabilityResult(
            success=False, error="PDP unreachable",
        )
        sidecar._adapter = mock_adapter

        original = {"X-Request-Id": "req-123"}
        headers = await sidecar.inject_token(original, "vault:read:secret")
        assert "Authorization" not in headers
        assert headers["X-Request-Id"] == "req-123"
        await sidecar.stop()
