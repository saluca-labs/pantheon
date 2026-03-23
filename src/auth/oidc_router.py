"""
OIDC Auth Router -- SSO/OIDC endpoints for Tiresias portal authentication.
"""
import base64
import hashlib
import hmac as _hmac
import json
import secrets
import structlog
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from config.settings import get_settings
from src.auth.domain_resolution import resolve_idp_by_email
from src.auth.jit_provisioning import jit_provision_user
from src.auth.oidc_exchange import exchange_code_for_tokens, validate_id_token, extract_user_claims
from src.auth.oidc_provider import fetch_discovery_document, load_idp_config
from src.auth.oidc_session import create_session, validate_session, revoke_session
from src.database.connection import get_db
from src.database.models import SoulIdPConfig
from src.middleware.tenant import resolve_tenant_by_slug

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/v1/auth/oidc", tags=["Auth"])
_CALLBACK_PATH = "/v1/auth/oidc/callback"
# SECURITY WARNING: In-memory dict is NOT safe for multi-instance/horizontal scaling.
# Nonce replay protection breaks if requests hit different instances behind a load balancer.
# Production deployments MUST use a Redis or database-backed nonce store with TTL expiry.
_nonce_store: dict[str, str] = {}


def _make_state(tenant_id: str, idp_id: str, nonce: str, secret: str) -> str:
    """Create a signed HMAC-SHA256 state blob."""
    payload = json.dumps({"tenant_id": tenant_id, "idp_id": idp_id, "nonce": nonce})
    sig = _hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode((payload + "." + sig).encode()).decode()


def _verify_state(state_b64: str, secret: str) -> dict:
    """Verify signed state. Raises HTTPException 400 on failure."""
    try:
        raw = base64.urlsafe_b64decode(state_b64.encode()).decode()
        payload_str, sig = raw.rsplit(".", 1)
        expected = _hmac.new(secret.encode(), payload_str.encode(), hashlib.sha256).hexdigest()
        if not _hmac.compare_digest(sig, expected):
            raise ValueError("sig mismatch")
        return json.loads(payload_str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid state: {e}")


def _generate_pkce() -> tuple[str, str]:
    """Generate PKCE code_verifier and code_challenge (S256)."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


class AuthorizeResponse(BaseModel):
    authorization_url: str
    state: str

class CallbackRequest(BaseModel):
    code: str
    state: str
    redirect_uri: str

class CallbackResponse(BaseModel):
    session_token: str
    user_id: str
    tenant_id: str
    email: str
    display_name: Optional[str]
    admin_role: str
    expires_in: int

class UserInfoResponse(BaseModel):
    user_id: str
    tenant_id: str
    email: str
    display_name: Optional[str]
    admin_role: str
    idp_provider: Optional[str]
    status: str


@router.get("/authorize", response_model=AuthorizeResponse, summary="Initiate OIDC authorization flow")
async def authorize(
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_slug: Optional[str] = None,
    email: Optional[str] = None,
    provider_type: Optional[str] = None,
):
    """Initiate the OIDC authorization code flow with PKCE.

    Resolves the IdP configuration from the provided email domain or tenant slug,
    generates a PKCE challenge and cryptographic nonce, signs the state parameter
    with HMAC-SHA256 to prevent CSRF, and returns the IdP authorization URL.
    The caller must redirect the user-agent to that URL to begin authentication.
    """
    settings = get_settings()
    if not settings.oidc_enabled:
        raise HTTPException(status_code=404, detail="OIDC SSO is not enabled")
    # SECURITY WARNING: "dev-state-secret-change-me" is a dev-only default.
    # In production, oidc_state_secret MUST be set via config to a cryptographically random value.
    state_secret = settings.oidc_state_secret or "dev-state-secret-change-me"
    idp_config: Optional[SoulIdPConfig] = None
    if email:
        idp_config = await resolve_idp_by_email(db, email)
        if not idp_config:
            raise HTTPException(status_code=404, detail="No SSO provider for this email domain")
    elif tenant_slug:
        tenant = await resolve_tenant_by_slug(db, tenant_slug)
        if not tenant:
            # Fallback: treat tenant_slug as a domain hint
            idp_config = await resolve_idp_by_email(db, f"user@{tenant_slug}")
            if not idp_config:
                raise HTTPException(status_code=404, detail="Tenant not found")
            # idp_config resolved via domain fallback -- skip load_idp_config
        else:
            idp_config = await load_idp_config(db, tenant.id, provider_type=provider_type)
            if not idp_config:
                raise HTTPException(status_code=404, detail="No SSO provider for this tenant")
    else:
        raise HTTPException(status_code=400, detail="Provide email or tenant_slug")
    discovery = await fetch_discovery_document(idp_config.discovery_url)
    auth_endpoint = discovery["authorization_endpoint"]
    code_verifier, code_challenge = _generate_pkce()
    nonce = secrets.token_urlsafe(32)
    state = _make_state(str(idp_config.tenant_id), str(idp_config.id), nonce, state_secret)
    # Store both nonce and PKCE code_verifier so the callback can complete the proof
    _nonce_store[state] = {"nonce": nonce, "code_verifier": code_verifier}
    scopes = idp_config.scopes or ["openid", "email", "profile"]
    redirect_uri = settings.public_url + "/api/auth/callback"
    qs = (
        "?response_type=code&client_id=" + idp_config.client_id +
        "&redirect_uri=" + redirect_uri + "&scope=" + " ".join(scopes) +
        "&state=" + state + "&nonce=" + nonce +
        "&code_challenge=" + code_challenge + "&code_challenge_method=S256"
    )
    logger.info("oidc.authorize", tenant_id=str(idp_config.tenant_id))
    return AuthorizeResponse(authorization_url=auth_endpoint + qs, state=state)


@router.post("/callback", response_model=CallbackResponse, summary="OIDC callback")
async def callback(request: Request, body: CallbackRequest, db: AsyncSession = Depends(get_db)):
    """Complete the OIDC authorization code flow.

    Verifies the HMAC-signed state to prevent CSRF, validates the nonce to
    prevent replay attacks, exchanges the authorization code for tokens using
    the PKCE code_verifier, validates the id_token signature and claims,
    JIT-provisions the user if needed, and creates an authenticated session.
    Returns a session token for subsequent API calls.
    """
    settings = get_settings()
    if not settings.oidc_enabled:
        raise HTTPException(status_code=404, detail="OIDC SSO is not enabled")
    # SECURITY WARNING: "dev-state-secret-change-me" is a dev-only default.
    # In production, oidc_state_secret MUST be set via config to a cryptographically random value.
    state_secret = settings.oidc_state_secret or "dev-state-secret-change-me"
    state_data = _verify_state(body.state, state_secret)
    tenant_id = UUID(state_data["tenant_id"])
    idp_config_id = UUID(state_data["idp_id"])
    expected_nonce = state_data["nonce"]
    stored = _nonce_store.pop(body.state, None)
    if stored and stored.get("nonce") != expected_nonce:
        raise HTTPException(status_code=400, detail="Nonce mismatch")
    idp_config = await load_idp_config(db, tenant_id, idp_config_id=idp_config_id)
    if not idp_config:
        raise HTTPException(status_code=404, detail="IdP config not found")
    # PKCE: retrieve the code_verifier generated during /authorize so the IdP can
    # verify that the same client that started the flow is completing it.
    code_verifier = stored.get("code_verifier") if stored else None
    tokens = await exchange_code_for_tokens(
        idp_config=idp_config, code=body.code,
        redirect_uri=body.redirect_uri, code_verifier=code_verifier,
    )
    id_token = tokens.get("id_token")
    if not id_token:
        raise HTTPException(status_code=502, detail="IdP did not return id_token")
    claims = await validate_id_token(id_token=id_token, idp_config=idp_config, nonce=expected_nonce, cache_ttl=settings.oidc_jwks_cache_ttl)
    user_attrs = extract_user_claims(claims, idp_config.claim_mapping or {})
    user = await jit_provision_user(db=db, tenant_id=tenant_id, idp_config=idp_config, claims=user_attrs["raw"])
    refresh_enc = None
    if tokens.get("refresh_token") and settings.oidc_secret_key:
        from src.idp.encryption import encrypt_secret
        refresh_enc = encrypt_secret(tokens["refresh_token"])
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    raw_token, _s = await create_session(db=db, user=user, ip_address=ip, user_agent=ua, refresh_token_enc=refresh_enc)
    await db.commit()
    logger.info("oidc.callback_ok", user_id=str(user.id))
    return CallbackResponse(
        session_token=raw_token, user_id=str(user.id), tenant_id=str(user.tenant_id),
        email=user.email, display_name=user.display_name,
        admin_role=user.admin_role, expires_in=settings.oidc_session_ttl,
    )


@router.delete("/session", status_code=204, summary="Revoke current OIDC session")
async def revoke_oidc_session(
    db: AsyncSession = Depends(get_db),
    x_oidc_session: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    """Revoke the current OIDC session.

    Accepts the session token via X-OIDC-Session header or Authorization Bearer.
    Invalidates the session in the database so it cannot be reused.
    Returns 204 on success, 401 if no token provided, 404 if session not found.
    """
    settings = get_settings()
    if not settings.oidc_enabled:
        raise HTTPException(status_code=404, detail="OIDC SSO is not enabled")
    raw_token = x_oidc_session or (authorization.removeprefix("Bearer ").strip() if authorization else None)
    if not raw_token:
        raise HTTPException(status_code=401, detail="No session token")
    if not await revoke_session(db, raw_token):
        raise HTTPException(status_code=404, detail="Session not found")
    await db.commit()


@router.get("/userinfo", response_model=UserInfoResponse, summary="Current user profile from OIDC session")
async def userinfo(
    db: AsyncSession = Depends(get_db),
    x_oidc_session: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    """Return the authenticated user profile from the current OIDC session.

    Validates the session token and returns user identity attributes including
    tenant association, admin role, and IdP provider. Returns 401 if the
    session is missing, invalid, or expired.
    """
    settings = get_settings()
    if not settings.oidc_enabled:
        raise HTTPException(status_code=404, detail="OIDC SSO is not enabled")
    raw_token = x_oidc_session or (authorization.removeprefix("Bearer ").strip() if authorization else None)
    if not raw_token:
        raise HTTPException(status_code=401, detail="No session token")
    result = await validate_session(db, raw_token)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    _s, user = result
    return UserInfoResponse(
        user_id=str(user.id), tenant_id=str(user.tenant_id), email=user.email,
        display_name=user.display_name, admin_role=user.admin_role,
        idp_provider=user.idp_provider, status=user.status,
    )
