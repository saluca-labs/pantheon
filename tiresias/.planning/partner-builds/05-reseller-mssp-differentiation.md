# Build 05: Reseller vs MSSP Partner Differentiation

**Status:** Planned
**Author:** Saluca Engineering
**Date:** 2026-04-06
**Depends on:** Build 04 (partner onboarding, invitation flow, Stripe Connect)
**Blocks:** Build 06 (tier constraint enforcement at provisioning endpoints)

---

## 1. Current Problem

All partners are onboarded identically. The `partner_onboard` endpoint in `src/partner/router.py` (line 178) hardcodes `tier="mssp"` for every partner tenant, regardless of whether the partner is a referral-only reseller or a full MSSP operator.

Specific issues:

1. **No `partner_type` field exists anywhere.** The `_soul_partners` table, the `SoulPartner` ORM model, the `_partner_invitations` table, and all API schemas treat every partner as the same type. The spec in `PARTNER_PROGRAM_SPEC.md` Section 2 defines two distinct types (Reseller, MSSP) but the implementation has no concept of this distinction.

2. **Resellers get MSSP-tier tenants.** A reseller who only refers customers via a link should not receive an MSSP-tier tenant. MSSP tier carries a $4,999/mo base subscription fee and grants sub-tenant provisioning rights. Resellers should receive a Pro-tier tenant (no base fee, commission on referrals only).

3. **No access control on partner-type-specific operations.** Every partner can hit every partner endpoint. There is no gate preventing a reseller from calling MSSP-only endpoints (tenant provisioning, white-label config) once those endpoints exist.

4. **Billing model collision.** Without differentiation, the billing system would auto-subscribe resellers to the $4,999/mo MSSP pricing when Stripe subscription automation is wired up. This is a revenue-correctness bug waiting to happen.

5. **Invitation flow has no type field.** The `CreateInvitationRequest` schema and `_partner_invitations` table carry no `partner_type`. The admin creating an invitation cannot specify what kind of partner they are inviting.

---

## 2. Partner Type Definitions

### 2.1 Reseller

| Property | Value |
|---|---|
| `partner_type` | `reseller` |
| Default tenant tier | `pro` |
| Eligible tenant tiers | `pro`, `enterprise` |
| Sub-tenant creation | NO |
| White-label | NO |
| Base subscription fee | None |
| Revenue model | Rev-share on referred customer MRR (default 25%, configurable 10-40%) |
| Stripe Connect | Optional; needed only for automated payouts |
| Dashboard tabs | Referrals, commissions, promo codes, settings |
| Onboarding weight | Light (skip Stripe Connect initially) |

Resellers earn by referring customers. The customer signs up independently through a referral link (`?ref=PARTNER_CODE`), creates their own tenant, and manages their own Stripe subscription. The reseller earns a percentage of that customer's MRR. The reseller never provisions, manages, or accesses customer tenants.

### 2.2 MSSP Partner

| Property | Value |
|---|---|
| `partner_type` | `mssp` |
| Default tenant tier | `mssp` |
| Eligible tenant tiers | `mssp` only |
| Sub-tenant creation | YES (community, starter, pro, enterprise only) |
| White-label | YES (custom CSS, logo, display name) |
| Base subscription fee | $4,999/mo + $199/tenant |
| Revenue model | Margin on client billing, or 25% rev-share on sub-tenant MRR |
| Stripe Connect | Required (for payout or direct billing to sub-tenants) |
| Dashboard tabs | Everything reseller has + tenant management + white-label settings |
| Onboarding weight | Full (Stripe Connect required before sub-tenant provisioning) |

MSSP partners operate managed security practices. They provision tenants for their end customers, manage those tenants through the partner portal, and optionally white-label the Tiresias interface.

---

## 3. Database Changes

### 3.1 New Column: `partner_type` on `_soul_partners`

**Migration number:** `0020_add_partner_type_column.py` (next available after 0019)

```python
"""Add partner_type column to _soul_partners and _partner_invitations.

Revision ID: 0020
Revises: 0019
Create Date: 2026-04-XX
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: str = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add partner_type to _soul_partners with safe default
    op.add_column(
        "_soul_partners",
        sa.Column(
            "partner_type",
            sa.VARCHAR(20),
            server_default="reseller",
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_soul_partners_type",
        "_soul_partners",
        "partner_type IN ('reseller', 'mssp')",
    )
    op.create_index(
        "idx_soul_partners_type",
        "_soul_partners",
        ["partner_type"],
    )

    # Add partner_type to _partner_invitations
    op.add_column(
        "_partner_invitations",
        sa.Column(
            "partner_type",
            sa.VARCHAR(20),
            server_default="reseller",
            nullable=False,
        ),
    )

    # Backfill: existing partners were all onboarded as MSSP-tier tenants,
    # so mark them as 'mssp' to preserve their current capabilities.
    op.execute("""
        UPDATE _soul_partners SET partner_type = 'mssp'
        WHERE tenant_id IN (
            SELECT id FROM _soul_tenants WHERE tier = 'mssp'
        )
    """)
    op.execute("""
        UPDATE _partner_invitations SET partner_type = 'mssp'
        WHERE status = 'consumed'
    """)


def downgrade() -> None:
    op.drop_constraint("ck_soul_partners_type", "_soul_partners", type_="check")
    op.drop_index("idx_soul_partners_type", "_soul_partners")
    op.drop_column("_soul_partners", "partner_type")
    op.drop_column("_partner_invitations", "partner_type")
```

### 3.2 ORM Model Update: `SoulPartner`

Add to `src/database/models.py`, class `SoulPartner`:

```python
partner_type: Mapped[str] = mapped_column(
    String(20), default="reseller", nullable=False,
    comment="Partner classification: reseller (referral-only) or mssp (tenant provisioning)"
)
```

Add check constraint to `__table_args__`:

```python
CheckConstraint("partner_type IN ('reseller', 'mssp')", name="ck_soul_partners_type"),
```

### 3.3 Backfill Strategy

- Default for new rows is `reseller` (safer; a reseller accidentally classified as MSSP gains unwanted provisioning rights, but an MSSP accidentally classified as reseller simply cannot provision until corrected).
- Existing partners whose `tenant_id` points to an MSSP-tier tenant are backfilled to `partner_type = 'mssp'`.
- Existing consumed invitations are also backfilled for audit consistency.
- This backfill runs in the migration itself. No separate script needed given the current partner count (low single digits in production).

---

## 4. Invitation Flow Changes

### 4.1 Schema Update: `CreateInvitationRequest`

In `src/partner/router.py`:

```python
class CreateInvitationRequest(BaseModel):
    partner_name: str = Field(..., min_length=2, max_length=255)
    contact_email: str = Field(..., min_length=5)
    partner_type: str = Field("reseller", pattern="^(reseller|mssp)$")
    commission_rate: float = Field(0.25, ge=0.0, le=1.0)  # default changed from 0.40 to 0.25
    parent_partner_id: Optional[uuid.UUID] = None
    ttl_days: int = Field(30, ge=1, le=365)
```

Note: Default `commission_rate` changes from 0.40 to 0.25 to align with the standard 25% rev-share for both types.

### 4.2 Invitation Storage

`create_invitation()` in `src/partner/invitation.py` must pass `partner_type` through to the `_partner_invitations` INSERT:

```python
await db.execute(text("""
    INSERT INTO _partner_invitations
        (id, token_hash, partner_name, contact_email, commission_rate,
         partner_type, parent_partner_id, created_by, expires_at, status, created_at)
    VALUES (:id, :hash, :name, :email, :rate, :ptype, :parent, :by, :expires, 'active', :now)
"""), {
    ...
    "ptype": partner_type,
})
```

`validate_and_consume_invitation()` must return `partner_type` in its result dict.

### 4.3 Onboarding Divergence

The `partner_onboard` endpoint reads `partner_type` from the consumed invitation and branches:

```python
# Replace the hardcoded tier="mssp" at line 178
partner_type = inv["partner_type"]  # "reseller" or "mssp"
tenant_tier = "mssp" if partner_type == "mssp" else "pro"

tenant = await create_tenant(
    db,
    name=inv["partner_name"],
    slug=referral_code,
    tier=tenant_tier,
    metadata={
        "partner": True,
        "partner_type": partner_type,
        "contact_email": inv["contact_email"],
    },
)

# ...

partner = SoulPartner(
    tenant_id=tenant.id,
    name=inv["partner_name"],
    contact_email=inv["contact_email"],
    partner_type=partner_type,
    commission_rate=inv["commission_rate"],
    referral_code=referral_code,
    ...
)
```

**Reseller path:**
- Tenant created at `pro` tier
- No Stripe Connect account created during onboarding (deferred)
- `next_step` in response points to the partner dashboard, not Stripe Connect

**MSSP path:**
- Tenant created at `mssp` tier
- Stripe Connect account creation initiated
- `next_step` in response points to Stripe Connect onboarding URL

---

## 5. API Permission Gates

### 5.1 New File: `src/partner/types.py`

Defines the partner type enum and a static permission matrix:

```python
"""Partner type definitions and permission matrix."""

from enum import Enum


class PartnerType(str, Enum):
    RESELLER = "reseller"
    MSSP = "mssp"


# Capabilities gated by partner_type.
# Each key is a capability name; value is the set of partner types that have it.
PARTNER_CAPABILITIES = {
    # Tenant provisioning (create/manage sub-tenants)
    "tenant:create":        {PartnerType.MSSP},
    "tenant:manage":        {PartnerType.MSSP},
    "tenant:suspend":       {PartnerType.MSSP},

    # White-label branding
    "whitelabel:configure": {PartnerType.MSSP},

    # Referral tracking
    "referral:view":        {PartnerType.RESELLER, PartnerType.MSSP},
    "referral:link":        {PartnerType.RESELLER, PartnerType.MSSP},

    # Commission and promo
    "commission:view":      {PartnerType.RESELLER, PartnerType.MSSP},
    "promo:create":         {PartnerType.RESELLER, PartnerType.MSSP},
    "promo:list":           {PartnerType.RESELLER, PartnerType.MSSP},

    # Stripe Connect
    "connect:onboard":      {PartnerType.RESELLER, PartnerType.MSSP},
    "connect:status":       {PartnerType.RESELLER, PartnerType.MSSP},
    "connect:dashboard":    {PartnerType.RESELLER, PartnerType.MSSP},

    # Billing (MSSP has additional sub-tenant billing views)
    "billing:subtenant":    {PartnerType.MSSP},
}
```

### 5.2 New File: `src/partner/type_guard.py`

FastAPI dependency that loads the partner record and checks capability:

```python
"""Middleware for partner-type-based access control."""

import uuid
import structlog
from functools import wraps
from typing import Callable

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.database.models import SoulPartner
from src.partner.types import PartnerType, PARTNER_CAPABILITIES

logger = structlog.get_logger(__name__)


async def _load_partner(request: Request, db: AsyncSession) -> SoulPartner:
    """Load the partner record from X-Tenant-ID header."""
    tenant_id_header = request.headers.get("X-Tenant-ID")
    if not tenant_id_header:
        raise HTTPException(status_code=403, detail="X-Tenant-ID required")
    try:
        tid = uuid.UUID(tenant_id_header)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant ID")

    result = await db.execute(select(SoulPartner).where(SoulPartner.tenant_id == tid))
    partner = result.scalar_one_or_none()
    if not partner:
        raise HTTPException(status_code=404, detail="No partner record for this tenant")
    return partner


def require_partner_capability(capability: str):
    """FastAPI dependency factory that checks partner_type against the capability matrix.

    Usage:
        @router.post(
            "/tenants",
            dependencies=[Depends(require_partner_capability("tenant:create"))],
        )
    """
    async def _check(
        request: Request,
        db: AsyncSession = Depends(get_db),
    ) -> SoulPartner:
        partner = await _load_partner(request, db)
        allowed_types = PARTNER_CAPABILITIES.get(capability, set())

        if PartnerType(partner.partner_type) not in allowed_types:
            logger.warning(
                "partner.capability_denied",
                partner_id=str(partner.id),
                partner_type=partner.partner_type,
                capability=capability,
            )
            raise HTTPException(
                status_code=403,
                detail=f"Partner type '{partner.partner_type}' does not have capability '{capability}'",
            )

        # Attach partner to request state for downstream use
        request.state.partner = partner
        return partner

    return _check
```

### 5.3 Applying the Guard to Endpoints

Existing endpoints in `src/partner/router.py` that are available to both types need no guard change (referrals, commissions, promo codes).

MSSP-only endpoints (to be added in future builds or gated now):

```python
# Example: tenant provisioning (in src/mssp/router.py or new endpoint)
@router.post(
    "/tenants",
    dependencies=[Depends(require_partner_capability("tenant:create"))],
)
async def create_sub_tenant(...):
    ...

# Example: white-label config
@router.put(
    "/whitelabel",
    dependencies=[Depends(require_partner_capability("whitelabel:configure"))],
)
async def update_whitelabel(...):
    ...
```

For the existing `src/mssp/router.py` `provision_child_tenant` endpoint, add the `require_partner_capability("tenant:create")` dependency to block resellers from calling it.

---

## 6. Portal Differentiation

### 6.1 Reseller Dashboard

Visible tabs:
- **Overview:** Referral count, active customers, MRR from referrals, commission earned (current month / lifetime)
- **Referrals:** List of referred customers (tenant name, tier, MRR, signup date). Copy referral link button.
- **Commissions:** Earnings breakdown per customer, payout history, pending payouts
- **Promo Codes:** Create, list, deactivate promo codes
- **Settings:** Company profile, API key management, Stripe Connect setup (optional)

Hidden tabs:
- Tenant Management (MSSP only)
- White-label Settings (MSSP only)

### 6.2 MSSP Dashboard

All reseller tabs plus:
- **Tenant Management:** Create sub-tenant, list sub-tenants, suspend/reactivate, view usage metrics
- **White-label:** Custom CSS URL, logo URL, favicon URL, display name, preview

### 6.3 Implementation: Conditional Rendering

The portal frontend already fetches partner data from `GET /v1/partner/me`. Add `partner_type` to the `PartnerDashboard` response schema:

```python
class PartnerDashboard(BaseModel):
    partner_id: str
    name: str
    partner_type: str          # <-- NEW
    referral_code: str
    commission_rate: float
    stripe_connect_status: str
    status: str
    total_referrals: int
    active_referrals: int
```

The Next.js portal conditionally renders tabs based on `partner_type`:

```typescript
// Pseudocode for portal sidebar
const partnerTabs = [
  { label: "Overview",     path: "/dashboard/partner",            show: true },
  { label: "Referrals",    path: "/dashboard/partner/referrals",  show: true },
  { label: "Commissions",  path: "/dashboard/partner/billing",    show: true },
  { label: "Promo Codes",  path: "/dashboard/partner/promos",     show: true },
  { label: "Tenants",      path: "/dashboard/partner/tenants",    show: partner.partner_type === "mssp" },
  { label: "White-label",  path: "/dashboard/partner/whitelabel", show: partner.partner_type === "mssp" },
  { label: "Settings",     path: "/dashboard/partner/settings",   show: true },
];
```

Server-side enforcement via `require_partner_capability` prevents a reseller from accessing MSSP endpoints even if they manually navigate to the URL. The portal conditional rendering is cosmetic only; enforcement is always server-side.

---

## 7. New Files Summary

| File | Purpose |
|---|---|
| `src/partner/types.py` | `PartnerType` enum, `PARTNER_CAPABILITIES` permission matrix |
| `src/partner/type_guard.py` | `require_partner_capability()` FastAPI dependency |
| `alembic/versions/0020_add_partner_type_column.py` | Migration: `partner_type` column + backfill |
| `tests/test_partner_types.py` | Test suite for type guard, onboarding divergence, permission matrix |

### Files Modified (not created)

| File | Change |
|---|---|
| `src/database/models.py` | Add `partner_type` field to `SoulPartner`, add check constraint |
| `src/partner/router.py` | Add `partner_type` to `CreateInvitationRequest`, branch onboarding by type, add `partner_type` to `PartnerDashboard` response |
| `src/partner/invitation.py` | Pass `partner_type` through invitation create/consume flow |
| `src/mssp/router.py` | Add `require_partner_capability("tenant:create")` dependency to `provision_child_tenant` |

---

## 8. Pricing Impact

### 8.1 Reseller Pricing

- **Subscription fee:** None. Resellers do not pay a platform fee.
- **Revenue model:** Commission on referred customer MRR. Default 25%, configurable range 10-40%.
- **Stripe behavior:** Reseller's own tenant (Pro tier) may carry a Pro subscription ($99/mo or $299/mo depending on Pro sub-tier), but this is their own usage cost, not a partner fee.
- **CRITICAL:** The billing automation must NOT auto-subscribe reseller tenants to the $4,999/mo MSSP pricing. The tier enforcement (`pro` vs `mssp`) handles this naturally since MSSP pricing is gated to MSSP-tier tenants.

### 8.2 MSSP Pricing

- **Subscription fee:** $4,999/mo base + $199/tenant/mo
- **Revenue model:** Either margin on direct client billing, or 25% rev-share on sub-tenant MRR (configurable)
- **Stripe behavior:** MSSP partner's tenant is MSSP tier; Stripe webhook handler maps MSSP tier to the $4,999/mo price. Per-tenant usage fees are metered.

### 8.3 Safety Check

The onboarding divergence (Section 4.3) creates resellers at `pro` tier and MSSPs at `mssp` tier. Since Stripe subscription creation is driven by tenant tier (in `src/saas/billing.py`), the correct pricing is applied automatically. No additional billing logic is needed for this build.

One guard to add: when the Stripe subscription sync runs, verify that a tenant's tier matches expectations based on `partner_type`. Log a warning if a partner's `partner_type` is `reseller` but their tenant tier is `mssp` (indicates a backfill or manual override issue).

---

## 9. Test Plan

### 9.1 Test File: `tests/test_partner_types.py`

```python
"""Tests for partner type differentiation (Build 05)."""


class TestPartnerTypeEnum:
    """Verify PartnerType enum values and membership."""

    def test_reseller_is_valid(self): ...
    def test_mssp_is_valid(self): ...
    def test_unknown_type_rejected(self): ...


class TestPartnerCapabilities:
    """Verify the permission matrix returns correct access."""

    def test_reseller_cannot_create_tenant(self): ...
    def test_mssp_can_create_tenant(self): ...
    def test_reseller_can_view_referrals(self): ...
    def test_mssp_can_view_referrals(self): ...
    def test_reseller_cannot_configure_whitelabel(self): ...
    def test_mssp_can_configure_whitelabel(self): ...
    def test_both_types_can_create_promo(self): ...
    def test_both_types_can_view_commissions(self): ...


class TestTypeGuardMiddleware:
    """Integration tests for require_partner_capability dependency."""

    async def test_reseller_blocked_from_mssp_endpoint(self): ...
    async def test_mssp_allowed_on_mssp_endpoint(self): ...
    async def test_missing_tenant_id_returns_403(self): ...
    async def test_nonexistent_partner_returns_404(self): ...
    async def test_partner_attached_to_request_state(self): ...


class TestOnboardingDivergence:
    """Verify onboarding creates correct tenant tier per partner_type."""

    async def test_reseller_invitation_creates_pro_tenant(self): ...
    async def test_mssp_invitation_creates_mssp_tenant(self): ...
    async def test_reseller_onboard_skips_stripe_connect(self): ...
    async def test_mssp_onboard_initiates_stripe_connect(self): ...
    async def test_partner_type_persisted_on_partner_record(self): ...


class TestInvitationFlow:
    """Verify partner_type flows through invitation create/consume."""

    async def test_invitation_stores_partner_type(self): ...
    async def test_consumed_invitation_returns_partner_type(self): ...
    async def test_default_partner_type_is_reseller(self): ...


class TestBackfillMigration:
    """Verify migration backfill logic."""

    async def test_existing_mssp_tier_partners_backfilled_to_mssp(self): ...
    async def test_new_partners_default_to_reseller(self): ...


class TestDashboardResponse:
    """Verify /v1/partner/me returns partner_type."""

    async def test_reseller_dashboard_includes_type(self): ...
    async def test_mssp_dashboard_includes_type(self): ...
```

---

## 10. Estimated Effort

| Task | Estimate | Notes |
|---|---|---|
| Alembic migration + backfill | 1 hour | Straightforward column add + data migration |
| ORM model update | 15 min | Single field + constraint |
| `types.py` + `type_guard.py` | 2 hours | New files, clean-room implementation |
| Invitation flow changes | 1.5 hours | Thread `partner_type` through create/consume/return |
| Onboarding divergence in `router.py` | 1.5 hours | Branch logic, response changes |
| Apply guard to MSSP endpoints | 1 hour | Add dependency to existing routes |
| Dashboard response update | 30 min | Add field to schema + query |
| Test suite | 3 hours | ~20 test cases covering all paths |
| Portal conditional rendering | 2 hours | Frontend tab visibility logic |
| **Total** | **~12 hours** | |

### Dependencies

- **Requires:** The current partner onboarding flow (Build 04) must be stable and tested.
- **Does NOT require:** Tier constraint enforcement (Build 06). This build adds the partner_type column and permission gates; Build 06 adds the sub-tenant tier restrictions at provisioning time. They are independent and can be built in parallel, but applying Build 05 first is recommended because the type guard naturally prevents resellers from reaching the provisioning endpoint at all.

### Risk Factors

1. **Backfill correctness.** If any existing partner was created with a non-MSSP tier (due to manual intervention), the backfill query would leave them as `reseller`. This is the safe default, but an admin should review all partner records after migration.

2. **Commission rate default change.** Changing the default from 0.40 to 0.25 affects new invitations only. Existing partners retain their stored rate. No data migration needed, but the team should be aware of the default shift.

3. **Stripe Connect optionality for resellers.** The current onboarding response always returns a `next_step` pointing to Stripe Connect. For resellers, this should point to the dashboard instead. If the frontend relies on this field to gate the onboarding wizard, it needs to handle the divergence.

### Build Order Recommendation

Build this **before** tier constraint enforcement (Build 06). Reasoning:

- The type guard blocks resellers from tenant provisioning endpoints entirely, which is a broader and more correct gate than tier-level constraints alone.
- Tier constraints (Build 06) only matter for MSSP partners who can actually reach the provisioning endpoint. Without Build 05, a reseller could theoretically call the provisioning endpoint and create sub-tenants.
- Building 05 first means 06 can assume `partner_type` exists and use it as an additional signal (e.g., "if partner_type is mssp AND requested tier is in allowed set, proceed").

---

## 11. Migration Safety Checklist

- [ ] Column added with `server_default` so existing rows get a value without a full table lock
- [ ] Backfill runs as UPDATE within the migration, not as a separate script
- [ ] Check constraint added after backfill to avoid constraint violations during migration
- [ ] Index added on `partner_type` for query performance
- [ ] Downgrade drops constraint, index, and columns cleanly
- [ ] ORM model matches migration exactly (field name, type, default, nullable)
- [ ] No changes to existing `_soul_partners` columns or indexes
