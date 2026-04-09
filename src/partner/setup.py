"""
Partner program integration module.

Single entry point that wires all partner program components into the
SoulAuth FastAPI application. This keeps main.py clean: only one import
and one function call are needed.

Integration (add to main.py after ``app = FastAPI(...)`` and router registration):

    from src.partner.setup import register_partner_program
    register_partner_program(app)

What this registers:
    1. Admin router        -- /v1/admin/partners/* and /v1/admin/invitations/*
    2. Webhook endpoint    -- POST /v1/partner/webhooks (raw body for Stripe sig)
    3. Health endpoint     -- GET  /v1/partner/health
    4. Startup diagnostics -- config validation + version banner

The existing partner router (src.partner.router, mounted at /v1/partner) is
left untouched. The admin_router and invitation_router are additive: they
serve the /v1/admin/partners and /v1/admin/invitations prefixes respectively,
which do not overlap with the existing partner router's /v1/partner prefix.

Tier enforcement (require_tier_guard) is a per-endpoint ``Depends()`` guard,
NOT a global middleware. See the "Manual steps" section at the bottom of this
file for which existing endpoints need the guard added.
"""

import os
import structlog
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import text

from src.partner.admin_router import router as admin_router, invitation_router

logger = structlog.get_logger(__name__)

__version__ = "1.0.0"

# ---------------------------------------------------------------------------
# Configuration constants
# ---------------------------------------------------------------------------

_VALID_GUARD_MODES = {"enforce", "monitor", "disabled"}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def register_partner_program(app: FastAPI) -> None:
    """
    Wire all partner program components into the SoulAuth app.

    Call this from main.py after the base app is configured.
    Single integration point; no other changes needed in main.py.
    """

    # -----------------------------------------------------------------------
    # 1. Mount admin routers
    # -----------------------------------------------------------------------
    # admin_router  -> /v1/admin/partners (list, detail, deactivate, reactivate, terms, audit)
    # invitation_router -> /v1/admin/invitations (list, revoke)
    # These are additive to the existing partner_router at /v1/partner.
    app.include_router(admin_router)
    app.include_router(invitation_router)

    logger.info(
        "partner.setup.routers_mounted",
        admin_prefix="/v1/admin/partners",
        invitation_prefix="/v1/admin/invitations",
    )

    # -----------------------------------------------------------------------
    # 2. Mount webhook endpoint
    # -----------------------------------------------------------------------
    # Stripe signature verification requires the raw request body, so this
    # endpoint accepts ``Request`` directly rather than a Pydantic model.

    @app.post(
        "/v1/partner/webhooks",
        tags=["Partner Channel"],
        summary="Stripe partner webhook receiver",
        response_class=JSONResponse,
    )
    async def partner_webhook_endpoint(request: Request) -> Response:
        """
        Receive Stripe Connect and billing webhooks for the partner program.

        Stripe sends events as JSON with an HMAC signature in the
        ``Stripe-Signature`` header. The raw body is passed through to the
        handler for signature verification; it is then parsed as JSON for
        event routing.

        Always returns 200 to Stripe (even on handler errors) to prevent
        automatic retries that could cause duplicate processing. Actual
        errors are logged and audited internally.
        """
        from src.database.connection import async_session_factory
        from src.partner.webhooks import handle_partner_webhook

        raw_body = await request.body()
        signature_header = request.headers.get("Stripe-Signature", "")

        # Parse JSON body for event routing
        try:
            import json
            parsed_event = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            logger.warning("partner.webhook.invalid_json")
            return JSONResponse(
                status_code=400,
                content={"error": "Invalid JSON payload"},
            )

        async with async_session_factory() as db:
            result = await handle_partner_webhook(
                db=db,
                raw_body=raw_body,
                signature_header=signature_header,
                parsed_event=parsed_event,
            )
            await db.commit()

        # Stripe expects 2xx; use the handler's status hint if present
        status_code = result.get("status", 200)
        return JSONResponse(status_code=status_code, content=result)

    logger.info("partner.setup.webhook_mounted", path="/v1/partner/webhooks")

    # -----------------------------------------------------------------------
    # 3. Health check endpoint
    # -----------------------------------------------------------------------

    @app.get(
        "/v1/partner/health",
        tags=["Partner Channel"],
        summary="Partner module health check",
    )
    async def partner_health_check() -> dict[str, Any]:
        """
        Partner module health check.

        Verifies:
          - Partner tables exist (quick DB probe)
          - Stripe Connect reachability (skipped if no API key configured)
          - Module version and guard mode
        """
        health: dict[str, Any] = {
            "module": "partner",
            "version": __version__,
            "status": "healthy",
            "tier_guard_mode": os.environ.get("TIER_GUARD_ENABLED", "enforce"),
            "components": {},
        }

        # -- Database tables --
        try:
            from src.database.connection import async_session_factory
            async with async_session_factory() as db:
                # Quick existence check on the partners table
                await db.execute(text(
                    "SELECT 1 FROM _soul_partners LIMIT 1"
                ))
                health["components"]["database"] = {"status": "healthy"}
        except Exception as exc:
            health["components"]["database"] = {
                "status": "unhealthy",
                "error": str(exc),
            }
            health["status"] = "degraded"

        # -- Stripe Connect reachability (optional) --
        stripe_key = os.environ.get("STRIPE_SECRET_KEY", "")
        if stripe_key:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(
                        "https://api.stripe.com/v1/account",
                        headers={"Authorization": f"Bearer {stripe_key}"},
                    )
                    if resp.status_code == 200:
                        health["components"]["stripe_connect"] = {"status": "healthy"}
                    else:
                        health["components"]["stripe_connect"] = {
                            "status": "degraded",
                            "http_status": resp.status_code,
                        }
            except Exception as exc:
                health["components"]["stripe_connect"] = {
                    "status": "unreachable",
                    "error": str(exc),
                }
                health["status"] = "degraded"
        else:
            health["components"]["stripe_connect"] = {
                "status": "skipped",
                "reason": "STRIPE_SECRET_KEY not configured",
            }

        # -- Webhook secret configured --
        webhook_secret = os.environ.get("STRIPE_PARTNER_WEBHOOK_SECRET", "")
        health["components"]["webhook_secret"] = {
            "status": "configured" if webhook_secret else "missing",
        }

        return health

    logger.info("partner.setup.health_mounted", path="/v1/partner/health")

    # -----------------------------------------------------------------------
    # 4. Startup diagnostics (registered as an event handler)
    # -----------------------------------------------------------------------

    @app.on_event("startup")
    async def _partner_startup_checks() -> None:
        """Run partner program configuration checks at startup."""
        issues: list[str] = []

        # Check STRIPE_PARTNER_WEBHOOK_SECRET
        webhook_secret = os.environ.get("STRIPE_PARTNER_WEBHOOK_SECRET", "")
        if not webhook_secret:
            issues.append(
                "STRIPE_PARTNER_WEBHOOK_SECRET is not set. "
                "Webhook signature verification will be skipped (unsafe for production)."
            )
            logger.warning("partner.startup.webhook_secret_missing")

        # Validate TIER_GUARD_ENABLED
        guard_mode = os.environ.get("TIER_GUARD_ENABLED", "enforce").lower()
        if guard_mode not in _VALID_GUARD_MODES:
            issues.append(
                f"TIER_GUARD_ENABLED='{guard_mode}' is not a valid value. "
                f"Expected one of: {', '.join(sorted(_VALID_GUARD_MODES))}. "
                "Defaulting to 'enforce'."
            )
            logger.warning(
                "partner.startup.invalid_guard_mode",
                configured=guard_mode,
                valid_modes=sorted(_VALID_GUARD_MODES),
            )

        # Log partner program banner
        stripe_key_set = bool(os.environ.get("STRIPE_SECRET_KEY", ""))
        logger.info(
            "partner.startup.ready",
            version=__version__,
            tier_guard_mode=guard_mode,
            webhook_secret_configured=bool(webhook_secret),
            stripe_key_configured=stripe_key_set,
            issues=issues or None,
        )

    # -----------------------------------------------------------------------
    # 5. Tier guard helper for wrapping existing routes
    # -----------------------------------------------------------------------
    # The tier guard is a per-endpoint Depends(), not a global middleware.
    # To make it easy to apply retroactively, we expose a convenience
    # reference on app.state so other modules can import it if needed.

    from src.partner.tier_enforcement import require_tier_guard
    app.state.partner_tier_guard = require_tier_guard

    logger.info("partner.setup.complete", version=__version__)


# ---------------------------------------------------------------------------
# Manual integration steps
# ---------------------------------------------------------------------------
#
# 1. Add to main.py (after all existing router registrations):
#
#        from src.partner.setup import register_partner_program
#        register_partner_program(app)
#
# 2. Add tier guard Depends() to these EXISTING endpoints (in their
#    respective router files). This cannot be done from setup.py because
#    FastAPI dependencies are declared at route definition time:
#
#    a) Tenant creation endpoint (src/saas/router.py or src/admin/router.py):
#       - Whichever POST endpoint creates sub-tenants for MSSP partners
#       - Add: dependencies=[Depends(require_tier_guard("create"))]
#
#    b) Tier upgrade endpoint (src/billing/router.py or src/admin/router.py):
#       - Whichever PATCH/POST endpoint changes a tenant's tier
#       - Add: dependencies=[Depends(require_tier_guard("upgrade"))]
#
#    c) Stripe billing webhook handler (src/billing/router.py):
#       - Where subscription.updated events can change a tenant's tier
#       - Use validate_tier_for_subtenant() from tier_enforcement.py
#         instead of the Depends() guard (webhooks have no Request context)
#
#    Import for (a) and (b):
#        from src.partner.tier_enforcement import require_tier_guard
#
#    Import for (c):
#        from src.partner.tier_enforcement import validate_tier_for_subtenant
