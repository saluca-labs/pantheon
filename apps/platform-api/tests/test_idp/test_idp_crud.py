"""
Tests for IdP configuration CRUD endpoints.
"""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.idp.schemas import IdPConfigCreate, IdPConfigUpdate, IdPConfigResponse


class TestIdPSchemas:
    def test_create_schema_defaults(self):
        body = IdPConfigCreate(
            provider_type="google",
            client_id="cid",
            client_secret="secret",
            discovery_url="https://accounts.google.com/.well-known/openid-configuration",
        )
        assert body.scopes == ["openid", "email", "profile"]
        assert body.is_default is False
        assert body.group_role_map == {}

    def test_update_schema_all_optional(self):
        body = IdPConfigUpdate()
        dumped = body.model_dump(exclude_none=True)
        assert dumped == {}

    def test_response_masks_secret(self):
        mock_model = MagicMock()
        mock_model.id = uuid.uuid4()
        mock_model.tenant_id = uuid.uuid4()
        mock_model.provider_type = "google"
        mock_model.display_name = "Google SSO"
        mock_model.is_default = True
        mock_model.client_id = "myclientid"
        mock_model.client_secret_enc = "gAAAAEncryptedData1234"
        mock_model.discovery_url = "https://accounts.google.com/.well-known/openid-configuration"
        mock_model.issuer = "https://accounts.google.com"
        mock_model.scopes = ["openid", "email"]
        mock_model.claim_mapping = {"email": "email"}
        mock_model.domain_hint = "example.com"
        mock_model.group_role_map = {}
        mock_model.status = "active"

        resp = IdPConfigResponse.from_orm_model(mock_model)
        assert resp.client_id == "myclientid"
        assert "1234" in resp.client_secret_masked
        assert resp.client_secret_masked.startswith("sk_***")
        # Verify raw secret not exposed
        assert "EncryptedData" not in resp.client_secret_masked
