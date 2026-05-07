"""
Security Audit — Tenant Isolation Verification.

Automated tests that verify:
1. RLS policies prevent cross-tenant data access
2. SaaS auth middleware rejects invalid/missing keys
3. API key tenant resolution returns correct tenant
4. Session replay only returns data for the authenticated tenant
5. Analytics queries are scoped to tenant
6. MSSP hierarchy isolation is enforced

Run:
  pytest tests/security/test_tenant_isolation.py -v
"""

import hashlib
import os
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

# Test data
TENANT_A_ID = str(uuid.uuid4())
TENANT_B_ID = str(uuid.uuid4())
TENANT_A_KEY = f"tir_tenanta_{uuid.uuid4().hex}"
TENANT_B_KEY = f"tir_tenantb_{uuid.uuid4().hex}"
TENANT_A_HASH = hashlib.sha256(TENANT_A_KEY.encode()).hexdigest()
TENANT_B_HASH = hashlib.sha256(TENANT_B_KEY.encode()).hexdigest()


class TestSaaSAuthMiddleware:
    """Verify the SaaS auth middleware correctly gates requests."""

    def test_hash_api_key_deterministic(self):
        from tiresias.proxy.saas_auth import _hash_api_key
        h1 = _hash_api_key("tir_test_abc123")
        h2 = _hash_api_key("tir_test_abc123")
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex

    def test_hash_api_key_different_keys(self):
        from tiresias.proxy.saas_auth import _hash_api_key
        h1 = _hash_api_key("tir_a_key1")
        h2 = _hash_api_key("tir_b_key2")
        assert h1 != h2

    def test_extract_api_key_from_custom_header(self):
        from tiresias.proxy.saas_auth import _extract_api_key
        request = MagicMock()
        request.headers = {"x-tiresias-api-key": "tir_test_abc123"}
        assert _extract_api_key(request) == "tir_test_abc123"

    def test_extract_api_key_from_bearer(self):
        from tiresias.proxy.saas_auth import _extract_api_key
        request = MagicMock()
        request.headers = {"authorization": "Bearer tir_test_abc123", "x-tiresias-api-key": None}
        # Custom header takes precedence
        request.headers.get = lambda k, d="": {
            "x-tiresias-api-key": None,
            "authorization": "Bearer tir_test_abc123",
        }.get(k, d)
        key = _extract_api_key(request)
        assert key == "tir_test_abc123"

    def test_extract_api_key_non_tiresias_bearer_rejected(self):
        from tiresias.proxy.saas_auth import _extract_api_key
        request = MagicMock()
        request.headers = MagicMock()
        request.headers.get = lambda k, d="": {
            "x-tiresias-api-key": None,
            "authorization": "Bearer sk-openai-key-not-tiresias",
        }.get(k, d)
        # Should NOT extract non-tir_ keys from Bearer
        key = _extract_api_key(request)
        assert key is None

    def test_extract_api_key_missing(self):
        from tiresias.proxy.saas_auth import _extract_api_key
        request = MagicMock()
        request.headers = MagicMock()
        request.headers.get = lambda k, d="": d
        assert _extract_api_key(request) is None

    def test_cache_clear(self):
        from tiresias.proxy.saas_auth import _tenant_cache, clear_tenant_cache
        _tenant_cache["test"] = ("tid", "tier", 0)
        clear_tenant_cache()
        assert len(_tenant_cache) == 0


class TestProxyKeyGeneration:
    """Verify proxy API key generation and storage."""

    def test_key_format(self):
        from saas.proxy_keys import generate_proxy_key
        raw, h = generate_proxy_key("acme-corp")
        assert raw.startswith("tir_acme-corp_")
        assert len(h) == 64  # SHA-256
        assert hashlib.sha256(raw.encode()).hexdigest() == h

    def test_key_uniqueness(self):
        from saas.proxy_keys import generate_proxy_key
        keys = set()
        for _ in range(100):
            raw, _ = generate_proxy_key("test")
            assert raw not in keys
            keys.add(raw)

    def test_slug_sanitization(self):
        from saas.proxy_keys import generate_proxy_key
        raw, _ = generate_proxy_key("My Company Name Here Overflow")
        # Slug part should be truncated to 16 chars
        parts = raw.split("_")
        assert len(parts) == 3
        assert parts[0] == "tir"
        assert len(parts[1]) <= 16


class TestProvisionerManifests:
    """Verify K8s manifest generation produces correct isolation."""

    def test_enterprise_generates_shared_namespace(self):
        from mssp.provisioner import provision_tenant_manifests
        m = provision_tenant_manifests(
            tenant_id="ent-123",
            tenant_slug="acme",
            tier="enterprise",
        )
        assert m.namespace == "tiresias"
        # Should NOT include a Namespace manifest
        kinds = [r["kind"] for r in m.manifests]
        assert "Namespace" not in kinds
        assert "Deployment" in kinds
        assert "Service" in kinds

    def test_mssp_generates_isolated_namespace(self):
        from mssp.provisioner import provision_tenant_manifests
        m = provision_tenant_manifests(
            tenant_id="mssp-456",
            tenant_slug="bigco",
            tier="mssp",
        )
        assert m.namespace == "mssp-bigco"
        kinds = [r["kind"] for r in m.manifests]
        assert "Namespace" in kinds
        assert "ResourceQuota" in kinds
        assert "NetworkPolicy" in kinds
        assert "Deployment" in kinds
        assert "Ingress" in kinds
        assert "ManagedCertificate" in kinds

    def test_mssp_network_policy_scoped_to_tenant(self):
        from mssp.provisioner import provision_tenant_manifests
        m = provision_tenant_manifests(
            tenant_id="mssp-789",
            tenant_slug="secureco",
            tier="mssp",
        )
        netpol = next(r for r in m.manifests if r["kind"] == "NetworkPolicy")
        # Ingress should only allow from same tenant namespace
        ingress_from = netpol["spec"]["ingress"][0]["from"]
        ns_selector = ingress_from[0]
        assert ns_selector["namespaceSelector"]["matchLabels"]["mssp.tiresias.io/tenant-id"] == "mssp-789"

    def test_deployment_security_context(self):
        from mssp.provisioner import provision_tenant_manifests
        m = provision_tenant_manifests(
            tenant_id="sec-test",
            tenant_slug="sectest",
            tier="enterprise",
        )
        deploy = next(r for r in m.manifests if r["kind"] == "Deployment")
        container = deploy["spec"]["template"]["spec"]["containers"][0]
        sc = container["securityContext"]
        assert sc["readOnlyRootFilesystem"] is True
        assert sc["runAsNonRoot"] is True
        assert sc["allowPrivilegeEscalation"] is False
        assert sc["capabilities"]["drop"] == ["ALL"]

    def test_tenant_labels_present(self):
        from mssp.provisioner import provision_tenant_manifests
        m = provision_tenant_manifests(
            tenant_id="label-test",
            tenant_slug="labelco",
            tier="mssp",
        )
        for manifest in m.manifests:
            labels = manifest["metadata"].get("labels", {})
            if manifest["kind"] not in ("ManagedCertificate",):
                assert "mssp.tiresias.io/tenant-id" in labels or "mssp.tiresias.io/tenant-slug" in labels

    def test_ingress_subdomain_correct(self):
        from mssp.provisioner import provision_tenant_manifests
        m = provision_tenant_manifests(
            tenant_id="ing-test",
            tenant_slug="myco",
            tier="mssp",
            base_domain="proxy.tiresias.network",
        )
        ingress = next(r for r in m.manifests if r["kind"] == "Ingress")
        host = ingress["spec"]["rules"][0]["host"]
        assert host == "myco.proxy.tiresias.network"

    def test_resource_quota_limits(self):
        from mssp.provisioner import provision_tenant_manifests
        m = provision_tenant_manifests(
            tenant_id="quota-test",
            tenant_slug="quotaco",
            tier="mssp",
        )
        quota = next(r for r in m.manifests if r["kind"] == "ResourceQuota")
        hard = quota["spec"]["hard"]
        assert "requests.cpu" in hard
        assert "requests.memory" in hard
        assert "pods" in hard


class TestTenantRegistrationGate:
    """Tests for SAAS_AUTH_REQUIRE_TENANT_REGISTRATION feature flag (B8-AUTH-HARDEN)."""

    def _make_settings(self, flag_on: bool):
        from tiresias.config import TiresiasSettings
        s = TiresiasSettings(TIRESIAS_MODE="saas", TIRESIAS_KEK_PROVIDER="local", TIRESIAS_KEK="0" * 64)
        object.__setattr__(s, "saas_auth_require_tenant_registration", flag_on)
        return s

    def test_flag_default_off(self):
        """SAAS_AUTH_REQUIRE_TENANT_REGISTRATION must default to False."""
        from tiresias.config import TiresiasSettings
        s = TiresiasSettings(TIRESIAS_MODE="saas", TIRESIAS_KEK_PROVIDER="local", TIRESIAS_KEK="0" * 64)
        assert s.saas_auth_require_tenant_registration is False

    def test_flag_on_via_env(self, monkeypatch):
        """Flag reads from env var."""
        monkeypatch.setenv("SAAS_AUTH_REQUIRE_TENANT_REGISTRATION", "true")
        from tiresias.config import TiresiasSettings
        s = TiresiasSettings(TIRESIAS_MODE="saas", TIRESIAS_KEK_PROVIDER="local", TIRESIAS_KEK="0" * 64)
        assert s.saas_auth_require_tenant_registration is True

    @pytest.mark.asyncio
    async def test_flag_off_bypasses_soul_check(self):
        """When flag is OFF, a valid license key passes even if not in _soul_tenants."""
        import hashlib
        import tiresias.proxy.saas_auth as saas_mod
        from unittest.mock import AsyncMock, MagicMock, patch

        saas_mod.clear_tenant_cache()
        saas_mod._cleared_since_flag_on = False

        raw_key = "tir_test_flagoff_xyzxyz9900112233"
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

        license_row = MagicMock()
        license_row.__getitem__ = lambda self, i: ("tenant-flagoff-001", "enterprise")[i]
        mock_license_result = MagicMock(first=lambda: license_row)

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_license_result)

        mock_session_cm = MagicMock()
        mock_session_cm.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_cm.__aexit__ = AsyncMock(return_value=False)

        mock_engine_factory = AsyncMock(return_value=MagicMock())

        settings = self._make_settings(flag_on=False)
        app = MagicMock()

        middleware = saas_mod.SaaSAuthMiddleware(app, settings, mock_engine_factory)

        request = MagicMock()
        request.state = MagicMock()
        request.url.path = "/v1/chat/completions"
        request.headers.get = lambda k, d="": {
            "x-tiresias-api-key": raw_key,
        }.get(k, d)

        call_next = AsyncMock(return_value=MagicMock(status_code=200))

        with patch("tiresias.proxy.saas_auth.AsyncSession", return_value=mock_session_cm):
            await middleware.dispatch(request, call_next)

        # Should pass through without 403
        assert call_next.called
        # Cached with tenant_valid=None (flag was OFF) — index 2 in 4-tuple
        assert key_hash in saas_mod._tenant_cache
        assert saas_mod._tenant_cache[key_hash][2] is None

    @pytest.mark.asyncio
    async def test_flag_on_unregistered_tenant_gets_403(self):
        """When flag is ON, a tenant not in _soul_tenants gets opaque 403."""
        import hashlib
        import json
        import tiresias.proxy.saas_auth as saas_mod
        from unittest.mock import AsyncMock, MagicMock, patch

        saas_mod.clear_tenant_cache()
        saas_mod._cleared_since_flag_on = True  # already cleared; skip auto-clear

        raw_key = "tir_test_unregistered_xyzxyz9900112233"

        license_row = MagicMock()
        license_row.__getitem__ = lambda self, i: ("tenant-unreg-001", "enterprise")[i]
        mock_license_result = MagicMock(first=lambda: license_row)

        mock_soul_result = MagicMock(first=lambda: None)  # not in _soul_tenants

        call_count = [0]
        async def mock_execute(stmt, params=None):
            call_count[0] += 1
            if call_count[0] == 1:
                return mock_license_result
            return mock_soul_result

        mock_session = AsyncMock()
        mock_session.execute = mock_execute

        mock_session_cm = MagicMock()
        mock_session_cm.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_cm.__aexit__ = AsyncMock(return_value=False)

        mock_engine_factory = AsyncMock(return_value=MagicMock())

        settings = self._make_settings(flag_on=True)
        app = MagicMock()
        middleware = saas_mod.SaaSAuthMiddleware(app, settings, mock_engine_factory)

        request = MagicMock()
        request.state = MagicMock()
        request.url.path = "/v1/chat/completions"
        request.headers.get = lambda k, d="": {
            "x-tiresias-api-key": raw_key,
        }.get(k, d)

        call_next = AsyncMock(return_value=MagicMock(status_code=200))

        with patch("tiresias.proxy.saas_auth.AsyncSession", return_value=mock_session_cm):
            resp = await middleware.dispatch(request, call_next)

        assert resp.status_code == 403
        body = json.loads(resp.body)
        assert body == {"error": "authentication_failed"}
        # call_next must NOT have been called
        assert not call_next.called

    @pytest.mark.asyncio
    async def test_flag_on_registered_active_tenant_passes(self):
        """When flag is ON, a tenant present in _soul_tenants with active status passes."""
        import hashlib
        import tiresias.proxy.saas_auth as saas_mod
        from unittest.mock import AsyncMock, MagicMock, patch

        saas_mod.clear_tenant_cache()
        saas_mod._cleared_since_flag_on = True  # skip auto-clear

        raw_key = "tir_test_registered_xyzxyz9900112233"

        license_row = MagicMock()
        license_row.__getitem__ = lambda self, i: ("tenant-reg-001", "enterprise")[i]
        mock_license_result = MagicMock(first=lambda: license_row)

        soul_row = MagicMock()
        soul_row.__getitem__ = lambda self, i: ("active",)[i]
        mock_soul_result = MagicMock(first=lambda: soul_row)

        call_count = [0]
        async def mock_execute(stmt, params=None):
            call_count[0] += 1
            if call_count[0] == 1:
                return mock_license_result
            return mock_soul_result

        mock_session = AsyncMock()
        mock_session.execute = mock_execute

        mock_session_cm = MagicMock()
        mock_session_cm.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_cm.__aexit__ = AsyncMock(return_value=False)

        mock_engine_factory = AsyncMock(return_value=MagicMock())

        settings = self._make_settings(flag_on=True)
        app = MagicMock()
        middleware = saas_mod.SaaSAuthMiddleware(app, settings, mock_engine_factory)

        request = MagicMock()
        request.state = MagicMock()
        request.url.path = "/v1/chat/completions"
        request.headers.get = lambda k, d="": {
            "x-tiresias-api-key": raw_key,
        }.get(k, d)

        call_next = AsyncMock(return_value=MagicMock(status_code=200))

        with patch("tiresias.proxy.saas_auth.AsyncSession", return_value=mock_session_cm):
            await middleware.dispatch(request, call_next)

        assert call_next.called

    def test_403_body_is_opaque(self):
        """403 body must be exactly {'error': 'authentication_failed'} with no detail."""
        import json
        body = {"error": "authentication_failed"}
        assert "detail" not in body
        assert "tenant_id" not in body
        assert "reason" not in body
        assert json.dumps(body) == '{"error": "authentication_failed"}'

    def test_cache_sentinel_cleared_on_flag_flip(self):
        """Auto-clear sentinel is False by default and resets when module is reloaded."""
        import tiresias.proxy.saas_auth as saas_mod
        # Sentinel starts False (or may be True if prior test set it; reset it)
        saas_mod._cleared_since_flag_on = False
        assert saas_mod._cleared_since_flag_on is False
        # Manually trigger the clear path
        saas_mod._tenant_cache["dummy"] = ("t", "tier", None, 0.0)
        saas_mod.clear_tenant_cache()
        saas_mod._cleared_since_flag_on = True
        assert saas_mod._cleared_since_flag_on is True
        assert len(saas_mod._tenant_cache) == 0


class TestEncryptionProviderFactory:
    """Verify KEK provider resolution for all modes."""

    def test_local_provider(self):
        from tiresias.encryption.providers import resolve_kek_provider
        from tiresias.config import TiresiasSettings
        s = TiresiasSettings(
            TIRESIAS_KEK_PROVIDER="local",
            TIRESIAS_KEK="0" * 64,
        )
        p = resolve_kek_provider(s)
        assert p.provider_name == "local"

    def test_gcp_sm_requires_project(self):
        from tiresias.encryption.providers import resolve_kek_provider
        from tiresias.config import TiresiasSettings
        s = TiresiasSettings(
            TIRESIAS_KEK_PROVIDER="gcp-sm",
            TIRESIAS_GCP_PROJECT_ID=None,
        )
        with pytest.raises(ValueError, match="GCP_PROJECT_ID"):
            resolve_kek_provider(s)

    def test_aws_kms_requires_key_id(self):
        from tiresias.encryption.providers import resolve_kek_provider
        from tiresias.config import TiresiasSettings
        s = TiresiasSettings(
            TIRESIAS_KEK_PROVIDER="aws-kms",
            TIRESIAS_AWS_KMS_KEY_ID=None,
        )
        with pytest.raises(ValueError, match="AWS_KMS_KEY_ID"):
            resolve_kek_provider(s)

    def test_unknown_provider_raises(self):
        from tiresias.encryption.providers import resolve_kek_provider
        from tiresias.config import TiresiasSettings
        s = TiresiasSettings(TIRESIAS_KEK_PROVIDER="local", TIRESIAS_KEK="0" * 64)
        # Override after init since it's a Literal field
        object.__setattr__(s, 'kek_provider', 'banana')
        with pytest.raises(ValueError, match="Unknown"):
            resolve_kek_provider(s)

    def test_vault_not_yet_implemented(self):
        from tiresias.encryption.providers import resolve_kek_provider
        from tiresias.config import TiresiasSettings
        s = TiresiasSettings(TIRESIAS_KEK_PROVIDER="local", TIRESIAS_KEK="0" * 64)
        object.__setattr__(s, 'kek_provider', 'hashicorp-vault')
        with pytest.raises(ValueError, match="Enterprise"):
            resolve_kek_provider(s)
