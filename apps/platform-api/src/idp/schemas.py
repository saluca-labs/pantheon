"""
Pydantic schemas for IdP configuration CRUD.
"""
import uuid
from typing import Optional
from pydantic import BaseModel, Field


class IdPConfigCreate(BaseModel):
    """Input schema for creating a new IdP config."""
    provider_type: str = Field(..., description="google | okta | azure_ad | oidc")
    display_name: Optional[str] = None
    is_default: bool = False
    client_id: str
    client_secret: str = Field(..., description="Plaintext secret -- will be Fernet-encrypted at rest")
    discovery_url: Optional[str] = None
    issuer: Optional[str] = None
    scopes: list[str] = Field(default_factory=lambda: ["openid", "email", "profile"])
    claim_mapping: dict = Field(default_factory=lambda: {"email": "email", "name": "name"})
    domain_hint: Optional[str] = Field(None, description="Email domain for auto-selecting this IdP")
    group_role_map: dict = Field(default_factory=dict, description="IdP group -> Tiresias role mapping")


class IdPConfigUpdate(BaseModel):
    """Input schema for updating an IdP config."""
    display_name: Optional[str] = None
    is_default: Optional[bool] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = Field(None, description="Plaintext -- re-encrypted if provided")
    discovery_url: Optional[str] = None
    issuer: Optional[str] = None
    scopes: Optional[list[str]] = None
    claim_mapping: Optional[dict] = None
    domain_hint: Optional[str] = None
    group_role_map: Optional[dict] = None
    status: Optional[str] = None


class IdPConfigResponse(BaseModel):
    """Output schema (excludes client_secret_enc, includes masked version)."""
    id: uuid.UUID
    tenant_id: uuid.UUID
    provider_type: str
    display_name: Optional[str]
    is_default: bool
    client_id: str
    client_secret_masked: str
    discovery_url: Optional[str]
    issuer: Optional[str]
    scopes: Optional[list]
    claim_mapping: Optional[dict]
    domain_hint: Optional[str]
    group_role_map: Optional[dict]
    status: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_model(cls, m: object) -> "IdPConfigResponse":
        """Build response from ORM model, masking client_secret_enc."""
        return cls(
            id=m.id,
            tenant_id=m.tenant_id,
            provider_type=m.provider_type,
            display_name=m.display_name,
            is_default=m.is_default or False,
            client_id=m.client_id,
            client_secret_masked="sk_***" + m.client_secret_enc[-4:] if len(m.client_secret_enc) > 4 else "sk_***",
            discovery_url=m.discovery_url,
            issuer=m.issuer,
            scopes=m.scopes,
            claim_mapping=m.claim_mapping,
            domain_hint=m.domain_hint,
            group_role_map=m.group_role_map,
            status=m.status,
        )
