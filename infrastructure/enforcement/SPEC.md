# Tiresias License Enforcement — Implementation Spec

**Status:** Ready to execute
**Repo:** github.com/cristianxruvalcaba-coder/tiresias
**Branch from:** `main`
**Audit source:** Full codebase audit 2026-03-18

---

## Problem

The license JWT infrastructure is fully scaffolded (Ed25519 validation, tier/feature claims, NFR support, partner issuance CLI) but **nothing enforces it at runtime**:

- `TIRESIAS_LICENSE_KEY` env var is documented but never read
- `LicenseValidator` exists but is never called
- `TiresiasLicense.tier` in DB is set at first_boot and never updated from JWT claims
- Any deployment — licensed or not — gets full enterprise feature access

This spec wires it all in.

---

## Architecture After This Work

```
Container startup
  └── first_boot()
        ├── Read TIRESIAS_LICENSE_KEY from env
        ├── LicenseValidator.validate_with_grace(token, grace_hours=72)
        │     ├── VALID      → extract tier, features, is_nfr, partner_id
        │     ├── GRACE      → log warning, continue with degraded features
        │     └── INVALID    → raise LicenseError → container exits with code 2
        ├── Update TiresiasLicense.tier from JWT claims
        └── Store LicenseToken in app state (AppState.license)

Request path (proxy)
  └── FeatureGateMiddleware
        ├── Read AppState.license
        ├── Check requested feature against tier claims
        ├── ALLOWED  → pass through
        └── DENIED   → 402 {"error": "feature_not_licensed", "tier_required": "enterprise"}

Relay (non-NFR only)
  └── On startup: POST /v1/relay/renew → upstream license server
        ├── Success → update expiry in AppState
        └── Failure → use 72h grace period from validator
```

---

## Issues

### Issue 1 — Read + validate license JWT at bootstrap

**File:** `src/tiresias/bootstrap.py`
**File:** `src/tiresias/config.py`

**Changes:**

Add to `TiresiasSettings` (config.py):
```python
license_key: str = Field(default="", env="TIRESIAS_LICENSE_KEY")
license_grace_hours: float = Field(default=72.0)
license_required: bool = Field(default=True)  # set False for dev/test
```

Update `first_boot()` (bootstrap.py):
```python
from tiresias.license.validator import LicenseValidator, LicenseError, GracePeriodError

async def first_boot(tenant_id, settings, session):
    # ... existing API key + DEK logic unchanged ...

    # License validation (after existing setup)
    if settings.license_required and settings.license_key:
        validator = LicenseValidator()
        try:
            lt = validator.validate_with_grace(
                settings.license_key,
                grace_hours=settings.license_grace_hours,
            )
            logger.info(
                "License valid — tenant=%s tier=%s nfr=%s partner=%s",
                lt.tenant_id, lt.tier, lt.raw.get("is_nfr"), lt.raw.get("partner_id"),
            )
            # Update DB tier from JWT
            await session.execute(
                update(TiresiasLicense)
                .where(TiresiasLicense.tenant_id == tenant_id)
                .values(tier=lt.tier)
            )
            return api_key, lt          # return both
        except GracePeriodError as e:
            logger.warning("License in grace period: %s", e)
            return api_key, None        # grace — allow degraded
        except LicenseError as e:
            if settings.license_required:
                raise SystemExit(2) from e
    return api_key, None
```

**Tests:**
- `tests/test_bootstrap.py` — extend with: valid license proceeds, expired+grace proceeds with warning, expired+past-grace raises SystemExit(2), missing license with `license_required=False` proceeds

---

### Issue 2 — Store LicenseToken in app state

**File:** `src/tiresias/proxy/app.py` (or wherever AppState is defined)

**Changes:**

Add `license` field to app state:
```python
@dataclass
class AppState:
    # ... existing fields ...
    license: LicenseToken | None = None
```

Wire into lifespan:
```python
async def lifespan(app):
    api_key, license_token = await first_boot(...)
    app.state.license = license_token
    yield
```

Make accessible via FastAPI dependency:
```python
def get_license(request: Request) -> LicenseToken | None:
    return request.app.state.license
```

**Tests:** Lifespan sets `app.state.license` correctly for valid/invalid/grace cases.

---

### Issue 3 — Feature gate middleware

**File:** `src/tiresias/license/gates.py` (new)
**File:** `src/tiresias/proxy/app.py` (register middleware)

**Feature → tier mapping:**
```python
FEATURE_TIERS = {
    "analytics":        ["starter", "pro", "enterprise"],
    "dashboard":        ["starter", "pro", "enterprise"],
    "encryption":       ["pro", "enterprise"],
    "provider_failover":["pro", "enterprise"],
    "audit_log":        ["enterprise"],
    "byok":             ["enterprise"],
}

ROUTE_FEATURES = {
    "/v1/audit":        "audit_log",
    "/v1/encrypt":      "encryption",
    "/v1/admin/byok":   "byok",
    "/v1/analytics":    "analytics",
}
```

Middleware logic:
```python
class FeatureGateMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        feature = ROUTE_FEATURES.get(request.url.path)
        if feature:
            license_token = request.app.state.license
            tier = license_token.tier if license_token else "free"
            if tier not in FEATURE_TIERS.get(feature, []):
                return JSONResponse(
                    status_code=402,
                    content={
                        "error": "feature_not_licensed",
                        "feature": feature,
                        "tier_required": next(
                            t for t, feats in ... if feature in feats
                        ),
                        "tier_current": tier,
                    }
                )
        return await call_next(request)
```

**Tests (`tests/test_license_gates.py`):**
- Free tier → 402 on `/v1/audit`
- Enterprise tier → 200 on `/v1/audit`
- No license (None) → treated as free
- NFR enterprise → all features pass
- Pro tier → encryption passes, audit_log 402s

---

### Issue 4 — Startup relay check (non-NFR licenses only)

**File:** `src/tiresias/license/relay.py` (already exists — extend)

**Changes:**

Add `check_on_startup(settings, license_token)`:
```python
async def check_on_startup(settings, license_token: LicenseToken) -> bool:
    """Phone-home for non-NFR licenses. Returns True if confirmed, False on network failure."""
    if license_token.raw.get("is_nfr"):
        return True   # NFR = skip relay entirely
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{settings.license_relay_url}/v1/relay/renew",
                json={"tenant_id": license_token.tenant_id},
                headers={"X-License-Token": settings.license_key},
            )
            return resp.status_code == 200
    except Exception:
        logger.warning("License relay unreachable — running on grace period")
        return False
```

Wire into lifespan after `first_boot`. Failure is non-fatal (grace period covers it).

**Tests:** NFR skips relay. Non-NFR with offline relay logs warning but continues.

---

### Issue 5 — Clean up vestigial `jwt_signature` field

**File:** `src/tiresias/storage/schema.py`
**File:** `alembic/versions/XXXX_drop_jwt_signature.py` (new migration)

Remove `jwt_signature` column from `TiresiasLicense`. It was never written or read.

Migration:
```python
def upgrade():
    op.drop_column("tiresias_licenses", "jwt_signature")

def downgrade():
    op.add_column("tiresias_licenses", sa.Column("jwt_signature", sa.Text(), nullable=True))
```

---

### Issue 6 — Integration tests: full license enforcement chain

**File:** `tests/test_integration.py` (extend existing)

Test matrix:
```
| Scenario                        | Expected                          |
|---------------------------------|-----------------------------------|
| No TIRESIAS_LICENSE_KEY set     | Starts OK (license_required=False in test) |
| Valid enterprise NFR JWT        | All features accessible           |
| Valid pro JWT                   | encryption ✓, audit_log 402       |
| Valid starter JWT               | analytics ✓, encryption 402       |
| Expired JWT within grace        | Starts with warning, features by last-known tier |
| Expired JWT past grace          | SystemExit(2) if license_required |
| Tampered JWT (bad signature)    | SystemExit(2) if license_required |
| NFR skips relay check           | No HTTP call made to relay        |
```

Use `_make_token()` helper from `tests/test_license_validator.py` for fixtures.

---

## Execution Order

```
Issue 1 → Issue 2 → Issue 3 (parallel with 4) → Issue 5 → Issue 6
```

Issues 3 and 4 are independent once Issue 2 is done. Issue 5 can be done anytime. Issue 6 last.

---

## Key Constraints

- `LicenseValidator` must NOT be modified — it's correct and tested. Wire around it.
- `_BUNDLED_PUBLIC_KEY_PEM` in validator.py is a placeholder — keygen step must be run and public key updated before any validation will work against real tokens.
- `license_required=False` default for tests — never fail CI due to missing license in test env.
- Grace period (72h) already implemented in `validate_with_grace()` — use it, don't reinvent.
- NFR tokens use `exp = 4070908800` (2099-01-01) — no special-casing needed, validator handles it.
- Do NOT store the private key anywhere in the repo or application. It lives in `.tiresias_private_key.pem` on the admin machine only.

---

## Files Touch Map

| File | Change |
|---|---|
| `src/tiresias/config.py` | Add `license_key`, `license_grace_hours`, `license_required`, `license_relay_url` |
| `src/tiresias/bootstrap.py` | Call validator, return LicenseToken, update DB tier |
| `src/tiresias/proxy/app.py` | AppState.license field, lifespan wiring, register FeatureGateMiddleware |
| `src/tiresias/license/gates.py` | New — FEATURE_TIERS, ROUTE_FEATURES, FeatureGateMiddleware |
| `src/tiresias/license/relay.py` | Add check_on_startup() |
| `src/tiresias/storage/schema.py` | Remove jwt_signature field |
| `alembic/versions/` | New migration dropping jwt_signature |
| `tests/test_bootstrap.py` | License validation scenarios |
| `tests/test_license_gates.py` | New — feature gate matrix |
| `tests/test_integration.py` | Full enforcement chain |

---

*Spec written: 2026-03-18*
*Based on audit: all existing tests pass, no breaking changes to public API*
