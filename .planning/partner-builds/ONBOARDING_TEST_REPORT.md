# Partner Onboarding E2E Test Report

**Date:** 2026-04-06
**Cluster:** tiresias-partner (us-central1, GKE Autopilot)
**Namespace:** partner-portal
**Image:** us-central1-docker.pkg.dev/salucainfrastructure/tiresias/soulauth:v3.6.1-partner
**Reported Version:** 3.4.4 (from /health endpoint)
**Tester:** Alfred (automated E2E)

## Infrastructure Status

| Component | Status | Details |
|-----------|--------|---------|
| partner-api pods (2/2 replicas) | RUNNING | Both pods healthy, 2/2 containers ready |
| partner-dashboard pod (1/1) | RUNNING | Next.js frontend serving |
| partner-api Service | ACTIVE | ClusterIP 34.118.232.223:80 |
| partner-dashboard Service | ACTIVE | ClusterIP 34.118.233.79:80 |
| Cloud SQL Proxy sidecar | RUNNING | Connecting to salucainfrastructure:us-central1:tiresias-db |

## Endpoint Test Results

### 1. GET /health

**Status: PASS**

```
Request:  curl -sf http://localhost:8100/health
Response: {"status":"healthy","service":"soulauth","version":"3.4.4"}
HTTP:     200
```

Health check works. Note: version reported is 3.4.4, but the deployed image tag is v3.6.1-partner. Version string in the image is stale.

### 2. GET /openapi.json (Route Discovery)

**Status: EXPECTED FAIL (by design)**

```
Request:  curl -s http://localhost:8100/openapi.json
Response: {"detail":"Not Found"}
HTTP:     404
```

OpenAPI/Swagger is disabled when `settings.debug=False` (production mode). This is correct security behavior but means external tooling cannot auto-discover routes.

### 3. POST /v1/partner/invitations (Create Invitation, Admin Flow)

**Status: FAIL, BLOCKER**

Tested with three auth methods:

| Auth Header | HTTP Status | Result |
|-------------|-------------|--------|
| X-Internal-Key: (valid key) | 402 | Feature gate block |
| X-Internal-API-Key: (valid key) | 402 | Feature gate block |
| (no auth) | 402 | Feature gate block |

```json
{
  "error": "feature_not_licensed",
  "detail": "Feature 'partner_channels' requires the enterprise tier or higher.",
  "feature": "partner_channels",
  "tier_required": "enterprise",
  "tier_current": "starter",
  "upgrade_url": "https://tiresias.network/pricing"
}
```

**Root Cause:** FeatureGateMiddleware blocks ALL requests to `/v1/partner/*` before they reach the RBAC layer. The `TIRESIAS_LICENSE_KEY=DISABLED` causes the LicenseValidator to return `LicenseStatus.INVALID` with `tier=starter`. Since "starter" is not in the allowed tiers for `partner_channels` (`["enterprise", "mssp", "saas"]`), every request gets a 402.

### 4. POST /v1/partner/onboard (Redeem Invitation)

**Status: FAIL, BLOCKER (same as #3)**

```
HTTP: 402 (feature gate block, identical error)
```

### 5. GET /v1/partner/me (Partner Dashboard)

**Status: FAIL, BLOCKER (same as #3)**

```
HTTP: 402 (feature gate block, identical error)
```

### 6. GET /v1/partner/referrals

**Status: FAIL, BLOCKER (same as #3)**

```
HTTP: 402 (feature gate block, identical error)
```

### 7. POST /v1/partner/connect/onboard (Stripe Connect)

**Status: FAIL, BLOCKER (same as #3)**

```
HTTP: 402 (feature gate block, identical error)
```

### 8. GET /v1/partner/commissions/split

**Status: FAIL, BLOCKER (same as #3)**

```
HTTP: 402 (feature gate block, identical error)
```

### 9. GET /v1/partner/health (Partner Module Health)

**Status: FAIL, BLOCKER (same as #3)**

```
HTTP: 402 (feature gate block)
```

This is a problem even for operational monitoring. The partner module health endpoint is gated behind the same feature flag as the functional endpoints.

### 10. GET /v1/admin/partners (Admin: List Partners)

**Status: FAIL, BLOCKER**

```
Request:  curl -s http://localhost:8100/v1/admin/partners -H "X-Internal-Key: <key>"
Response: {"detail":"Not Found"}
HTTP:     404
```

**Root Cause:** `register_partner_program(app)` is never called in `src/main.py`. The admin router (`/v1/admin/partners/*`) and invitation router (`/v1/admin/invitations/*`) from `src/partner/admin_router.py` are not mounted. Only the base `partner_router` (from `src/partner/router.py`) is included via `app.include_router(partner_router)`.

### 11. GET /v1/admin/invitations (Admin: List Invitations)

**Status: FAIL, BLOCKER (same as #10)**

```
HTTP: 404 (route not mounted)
```

### 12. DELETE /v1/admin/invitations/{id} (Admin: Revoke Invitation)

**Status: NOT TESTED** (route 404, not mounted)

### 13. POST /v1/partner/webhooks (Stripe Webhook Receiver)

**Status: NOT TESTED** (route not mounted; registered by `register_partner_program()`)

## Environment Configuration Audit

| Env Var | Value | Issue |
|---------|-------|-------|
| TIRESIAS_LICENSE_KEY | DISABLED | Invalid; causes LicenseValidator to return tier=starter |
| SOULAUTH_LICENSE_REQUIRED | false | Correct; app starts without valid license |
| TIRESIAS_TIER | mssp | Set correctly but overridden by license validator |
| SOULAUTH_MODE | enterprise | OK |
| INTERNAL_API_KEY | (64-char hex, matches GCP) | Correctly provisioned |
| SOULAUTH_TESTING | (not set) | Not set, RBAC test bypass not active |
| ENVIRONMENT | (not set) | Not set |

## Blockers (Ordered by Priority)

### BLOCKER 1: FeatureGateMiddleware rejects all partner endpoints (402)

**Impact:** 100% of partner API endpoints are unreachable.
**Cause:** `TIRESIAS_LICENSE_KEY=DISABLED` results in `LicenseStatus.INVALID`, which the validator maps to `tier=starter`. The `FeatureGateMiddleware` then denies access to the `partner_channels` feature because "starter" is not in `["enterprise", "mssp", "saas"]`.
**Fix options (pick one):**
  1. **Issue a valid enterprise/mssp license JWT** and set it as `TIRESIAS_LICENSE_KEY` in the partner-portal-secrets K8s Secret. This is the correct production fix.
  2. **Set license key to empty string** (`""` instead of `DISABLED`). The validator will return `LicenseStatus.MISSING` instead of `INVALID`, and `install_tier` will fall to `DEFAULT_TIER=community`. However, "community" is also not in the allowed tiers, so this alone does not fix it.
  3. **Add `/v1/partner/` to ALWAYS_ALLOWED_PREFIXES** in `src/middleware/feature_gate.py`. This bypasses the gate entirely for partner routes on the dedicated partner cluster (acceptable since this cluster IS the partner service). Requires rebuild + redeploy.
  4. **Override install_tier from TIRESIAS_TIER env var** when license is missing/invalid and `SOULAUTH_LICENSE_REQUIRED=false`. Add a fallback in the middleware: if license is absent, use `os.environ.get("TIRESIAS_TIER", DEFAULT_TIER)` as install_tier. Requires code change + rebuild.

**Recommended fix:** Option 1 (valid license JWT) for immediate unblock, combined with option 3 or 4 for the partner-specific deployment since it is a dedicated cluster.

### BLOCKER 2: Admin routes not mounted (404)

**Impact:** All `/v1/admin/partners/*` and `/v1/admin/invitations/*` endpoints return 404.
**Cause:** `register_partner_program(app)` from `src/partner/setup.py` is never called in `src/main.py`. The `src/partner/setup.py` file documents integration instructions (add two lines to main.py) but these were never applied.
**Fix:** Add to `src/main.py` after the existing `app.include_router(partner_router)` line:
```python
from src.partner.setup import register_partner_program
register_partner_program(app)
```
This mounts the admin_router, invitation_router, webhook endpoint, and partner health check.
**Rebuild required:** Yes (new image v3.6.1-partner or v3.6.2-partner).

### BLOCKER 3: Webhook endpoint not mounted

**Impact:** Stripe Connect webhooks (`POST /v1/partner/webhooks`) will fail delivery. Partners cannot complete Stripe Connect onboarding flow.
**Cause:** Same as Blocker 2; the webhook endpoint is registered by `register_partner_program()`.
**Fix:** Same as Blocker 2.

## Secondary Issues

### ISSUE 4: Version mismatch

The `/health` endpoint reports version 3.4.4, but the deployed image tag is v3.6.1-partner. The `settings.app_version` value was not updated in the codebase before the partner image was built. Low priority but will cause confusion in monitoring.

### ISSUE 5: Partner health endpoint under feature gate

`GET /v1/partner/health` is blocked by the feature gate because it starts with `/v1/partner`. This endpoint should be exempt for operational monitoring. Either add it to `ALWAYS_ALLOWED_PREFIXES` or move it to a path outside `/v1/partner/` (e.g., `/health/partner`).

### ISSUE 6: Auth header naming inconsistency

The RBAC system uses `X-Internal-Key` for service-to-service auth, but the K8s secret is named `internal-api-key` and the GCP secret is `tiresias-internal-api-key`. Documentation should clarify which header name to use. Partners or internal tooling using `X-Internal-API-Key` (with "API" in the name) will silently fail auth and hit the soulkey validation path instead.

### ISSUE 7: DB connection pool pressure

Attempting a direct DB query from the pod showed `asyncpg.exceptions.TooManyConnectionsError`. The connection pool is at capacity with the 2 running replicas. This may cause intermittent 500 errors under load. Review pool size settings or increase Cloud SQL max_connections.

## Auth Flow Summary (from code review)

The RBAC dependency `require_permission()` supports three auth paths:

1. **Test bypass:** `SOULAUTH_TESTING=true` AND `ENVIRONMENT != production` (not active in this deployment)
2. **Service-to-service:** Header `X-Internal-Key` matching `INTERNAL_API_KEY` env var (grants admin role)
3. **SoulKey auth:** Header `X-SoulKey` or `Authorization: Bearer <key>` (role from soulkey metadata)
4. **OIDC session fallback:** Session token validation (for portal users)

For the partner portal, path 2 (X-Internal-Key) is the correct auth method for admin operations. Path 3 (SoulKey) is correct for partner-facing endpoints after onboarding.

## Recommended Fix Sequence (48-hour deadline)

1. **Hour 0-2:** Issue valid enterprise or mssp license JWT; update `partner-portal-secrets` K8s secret with it as `TIRESIAS_LICENSE_KEY`. Restart pods. This unblocks all `/v1/partner/*` endpoints immediately.

2. **Hour 2-4:** Add `register_partner_program(app)` call to `src/main.py`. This mounts admin routes, webhook endpoint, and partner health. Rebuild image as v3.6.2-partner.

3. **Hour 4-6:** Add `/v1/partner/health` to `ALWAYS_ALLOWED_PREFIXES` in feature gate middleware. Update version string. Include in same rebuild.

4. **Hour 6-8:** Deploy v3.6.2-partner image. Run migration job if needed.

5. **Hour 8-12:** Re-run this E2E test suite against the updated deployment. Verify full onboarding flow: invitation creation -> token redemption -> soulkey issuance -> dashboard access -> Stripe Connect onboarding.

## Endpoints Tested

| # | Method | Path | Expected | Actual | Verdict |
|---|--------|------|----------|--------|---------|
| 1 | GET | /health | 200 | 200 | PASS |
| 2 | GET | /openapi.json | 404 (prod) | 404 | PASS |
| 3 | POST | /v1/partner/invitations | 201 | 402 | FAIL |
| 4 | POST | /v1/partner/onboard | 200/403 | 402 | FAIL |
| 5 | GET | /v1/partner/me | 200 | 402 | FAIL |
| 6 | GET | /v1/partner/referrals | 200 | 402 | FAIL |
| 7 | POST | /v1/partner/connect/onboard | 200 | 402 | FAIL |
| 8 | GET | /v1/partner/commissions/split | 200 | 402 | FAIL |
| 9 | GET | /v1/partner/health | 200 | 402 | FAIL |
| 10 | GET | /v1/admin/partners | 200 | 404 | FAIL |
| 11 | GET | /v1/admin/invitations | 200 | 404 | FAIL |
| 12 | DELETE | /v1/admin/invitations/{id} | 200 | N/T | N/T |
| 13 | POST | /v1/partner/webhooks | 200 | N/T | N/T |

**Overall: 2 PASS, 9 FAIL, 2 NOT TESTED. Partner onboarding flow is fully blocked.**
