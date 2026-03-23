"""
OIDC token exchange — validates id_token from IdP using JWKS.
Uses authlib's JsonWebToken and JsonWebKey for RS256/ES256 verification.
"""

import time
import structlog
from typing import Any

from authlib.jose import JsonWebKey, JsonWebToken
from authlib.jose.errors import JoseError

from src.auth.oidc_provider import get_jwks, fetch_discovery_document
from src.database.models import SoulIdPConfig

logger = structlog.get_logger(__name__)


class OIDCValidationError(Exception):
    """Raised when id_token validation fails."""
    pass


async def exchange_code_for_tokens(
    idp_config: SoulIdPConfig,
    code: str,
    redirect_uri: str,
    code_verifier: str | None = None,
) -> dict:
    """
    Exchange an authorization code for tokens at the IdP's token endpoint.
    Returns the raw token response dict (access_token, id_token, refresh_token, etc.)
    """
    import httpx
    from src.idp.encryption import decrypt_secret

    discovery = await fetch_discovery_document(idp_config.discovery_url)
    token_endpoint = discovery["token_endpoint"]
    client_secret = decrypt_secret(idp_config.client_secret_enc)

    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": idp_config.client_id,
        "client_secret": client_secret,
    }
    # PKCE: include code_verifier so the IdP can verify the S256 challenge
    if code_verifier:
        payload["code_verifier"] = code_verifier

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(token_endpoint, data=payload)
        resp.raise_for_status()
        return resp.json()


async def validate_id_token(
    id_token: str,
    idp_config: SoulIdPConfig,
    nonce: str,
    cache_ttl: int = 3600,
) -> dict[str, Any]:
    """
    Validate an OIDC id_token using the IdP's JWKS.
    Verifies: signature, iss, aud, exp, nonce.
    Returns the verified claims dict on success.
    Raises OIDCValidationError on failure.
    """
    try:
        # Fetch discovery doc to get jwks_uri
        discovery = await fetch_discovery_document(idp_config.discovery_url)
        jwks_uri = discovery["jwks_uri"]
        issuer = discovery.get("issuer", idp_config.issuer or "")

        # Get JWKS
        jwks_data = await get_jwks(jwks_uri, cache_ttl=cache_ttl)
        key_set = JsonWebKey.import_key_set(jwks_data)

        # Decode and verify using authlib
        jwt = JsonWebToken(algorithms=["RS256", "ES256", "RS384", "RS512"])
        claims = jwt.decode(
            id_token,
            key_set,
            claims_options={
                "iss": {"essential": True, "value": issuer},
                "aud": {"essential": True, "value": idp_config.client_id},
                "exp": {"essential": True},
                "iat": {"essential": True},
            },
        )
        claims.validate()

        # Validate nonce
        if claims.get("nonce") != nonce:
            raise OIDCValidationError("nonce mismatch")

        # Validate expiry explicitly
        now = int(time.time())
        if claims.get("exp", 0) < now:
            raise OIDCValidationError("id_token expired")

        logger.info(
            "oidc_exchange.token_valid",
            sub=claims.get("sub"),
            iss=claims.get("iss"),
            tenant_idp=idp_config.provider_type,
        )
        return dict(claims)

    except OIDCValidationError:
        raise
    except JoseError as e:
        logger.warning("oidc_exchange.jose_error", error=str(e))
        raise OIDCValidationError(f"JWT validation failed: {e}") from e
    except Exception as e:
        logger.error("oidc_exchange.unexpected_error", error=str(e))
        raise OIDCValidationError(f"Unexpected validation error: {e}") from e


def extract_user_claims(
    claims: dict[str, Any],
    claim_mapping: dict[str, str],
) -> dict[str, Any]:
    """
    Extract standardized user attributes from raw OIDC claims
    using the IdP's configured claim_mapping.
    Returns: {email, name, sub}
    """
    mapping = claim_mapping or {"email": "email", "name": "name"}
    return {
        "sub": claims.get("sub", ""),
        "email": claims.get(mapping.get("email", "email"), ""),
        "name": claims.get(mapping.get("name", "name"), ""),
        "raw": claims,
    }
