# Build 03: Partner Admin Approval Workflow

**Status:** Planned
**Author:** Saluca Engineering
**Date:** 2026-04-06
**Depends on:** Build 01 (partner signup flow, `_soul_partners` + `_partner_invitations` tables)
**Modifies existing files:** None. All new files.

---

## 1. Current State

Today, the partner onboarding flow works as follows:

1. An admin with `partners:create` permission calls `POST /v1/partner/invitations` to generate a one-time invitation token.
2. The admin sends this token to the prospective partner out of band (email, Slack, etc.).
3. The partner calls `POST /v1/partner/onboard` with the token.
4. The system auto-provisions: tenant, soulkey, partner record, Stripe Connect placeholder.

This works for a curated launch where every partner is hand-picked. However, it has significant gaps:

- **No approval gate.** Once a token is issued, redemption is automatic. There is no way to review before activation.
- **No application tracking.** There is no database record of who was considered, who was rejected, or why.
- **No rejection flow.** If an admin decides not to proceed after issuing an invitation, the only option is to let it expire (up to 365 days).
- **No partner lifecycle management.** There are no endpoints to suspend, reactivate, or adjust terms for existing partners.
- **No audit trail for admin actions.** Partner creation is logged, but invitation management, term changes, and deactivations are not.
- **No invitation visibility.** Admins cannot list outstanding invitations or revoke them.

---

## 2. Design Decision: Keep Invitation Flow, Add Admin Layer

Rather than replacing the invitation system with a public application form (which is a bigger change involving `_partner_applications`, public endpoints, and a full review queue), this build adds admin endpoints that **wrap the existing invitation flow** with lifecycle management:

- Admin reviews a partner request (sourced from email, sales call, conference, etc.).
- Admin creates an invitation with specific terms (commission rate, partner type, tier) using the existing `POST /v1/partner/invitations` endpoint.
- **New:** Admin can list all invitations with their status (active, consumed, expired, revoked).
- **New:** Admin can revoke an unused invitation before it is consumed.
- **New:** Admin can list all partners with filtering by status, type, and date range.
- **New:** Admin can view detailed partner information including referrals, revenue, and Connect status.
- **New:** Admin can deactivate a partner (freeze payouts, disable tenant provisioning).
- **New:** Admin can reactivate a suspended partner.
- **New:** Admin can adjust partner terms (commission rate, payout frequency, tier).
- **New:** Admin can view a full audit trail for any partner.
- **New:** All admin actions emit email notifications and Slack webhooks.

This approach minimizes disruption to the existing working flow while adding the oversight and lifecycle controls needed for production operation.

---

## 3. New API Endpoints

All endpoints are mounted under `/v1/admin/partners` in a new router. All require authentication via soulkey or OIDC session with `owner` or `admin` role (enforced via `require_permission("partners:admin")`).

### 3.1 `GET /v1/admin/partners` -- List All Partners

**Auth:** `require_permission("partners:admin")`

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | string (optional) | `null` | Filter by status: `active`, `suspended`, `deactivated`, `pending` |
| `partner_type` | string (optional) | `null` | Filter by partner type stored in metadata: `reseller`, `mssp` |
| `created_after` | datetime (optional) | `null` | ISO 8601, inclusive lower bound on `created_at` |
| `created_before` | datetime (optional) | `null` | ISO 8601, exclusive upper bound on `created_at` |
| `search` | string (optional) | `null` | Case-insensitive substring match on `name` or `contact_email` |
| `sort_by` | string | `created_at` | One of: `created_at`, `name`, `status`, `commission_rate` |
| `sort_order` | string | `desc` | `asc` or `desc` |
| `page` | int | `1` | Page number (1-indexed) |
| `page_size` | int | `25` | Items per page, max 100 |

**Response (200):**

```json
{
  "partners": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "name": "Acme Security Inc.",
      "contact_email": "jane@acmesec.com",
      "referral_code": "acme-security-a1b2c3d4",
      "commission_rate": 0.40,
      "override_commission_rate": 0.10,
      "status": "active",
      "stripe_connect_status": "active",
      "parent_partner_id": null,
      "referral_count": 12,
      "active_referral_count": 10,
      "created_at": "2026-04-01T12:00:00Z",
      "approved_at": "2026-04-01T12:00:00Z"
    }
  ],
  "total": 47,
  "page": 1,
  "page_size": 25,
  "total_pages": 2
}
```

**Error Cases:**
- `400` if `sort_by` or `sort_order` values are invalid
- `400` if `page` < 1 or `page_size` < 1 or `page_size` > 100
- `401` if not authenticated
- `403` if role lacks `partners:admin` permission

**Implementation Notes:**
- Referral counts are computed via a subquery joining `_soul_tenants` on `parent_tenant_id = partner.tenant_id`.
- The `search` parameter uses `ILIKE '%search%'` against `name` and `contact_email` with `OR`.
- Pagination uses `OFFSET/LIMIT` (acceptable at expected partner volumes of < 1,000).

---

### 3.2 `GET /v1/admin/partners/{id}` -- Partner Detail

**Auth:** `require_permission("partners:admin")`

**Path Parameters:**
- `id` (UUID): Partner ID from `_soul_partners.id`

**Response (200):**

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "Acme Security Inc.",
  "contact_email": "jane@acmesec.com",
  "referral_code": "acme-security-a1b2c3d4",
  "commission_rate": 0.40,
  "override_commission_rate": 0.10,
  "status": "active",
  "stripe_connect_status": "active",
  "stripe_connect_account_id": "acct_1234567890",
  "parent_partner_id": null,
  "contract_hash": "sha256:abcdef...",
  "approved_at": "2026-04-01T12:00:00Z",
  "approved_by": "soulkey:uuid",
  "deactivated_at": null,
  "deactivated_reason": null,
  "created_at": "2026-04-01T12:00:00Z",
  "metadata": {},
  "referrals": {
    "total": 12,
    "active": 10,
    "suspended": 1,
    "deactivated": 1,
    "total_mrr_cents": 958800,
    "tenants": [
      {
        "tenant_id": "uuid",
        "name": "Customer A",
        "tier": "enterprise",
        "status": "active",
        "created_at": "2026-04-05T10:00:00Z"
      }
    ]
  },
  "connect": {
    "account_id": "acct_1234567890",
    "charges_enabled": true,
    "payouts_enabled": true,
    "details_submitted": true,
    "requirements": []
  },
  "commission_split": {
    "platform_rate": 0.60,
    "seller_rate": 0.40,
    "seller_net_rate": 0.40,
    "recruiter_rate": 0.0,
    "is_cascading": false
  }
}
```

**Error Cases:**
- `404` if partner ID does not exist
- `401`/`403` as above

**Implementation Notes:**
- The `referrals` block is assembled by querying `_soul_tenants WHERE parent_tenant_id = partner.tenant_id`.
- The `connect` block calls `get_account_status()` from `src/partner/connect.py` (or returns `null` if no Connect account).
- The `commission_split` block calls `calculate_split()` from `src/partner/commissions.py`.
- MRR data (`total_mrr_cents`) is a placeholder; it will be populated once Stripe subscription queries are implemented. For now, return `null`.

---

### 3.3 `POST /v1/admin/partners/{id}/deactivate` -- Deactivate Partner

**Auth:** `require_permission("partners:admin")`

**Path Parameters:**
- `id` (UUID): Partner ID

**Request:**

```json
{
  "reason": "Contract violation: unauthorized sub-licensing detected."
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `reason` | string | yes | 5-1000 characters |

**Response (200):**

```json
{
  "partner_id": "uuid",
  "status": "suspended",
  "deactivated_at": "2026-04-06T15:30:00Z",
  "deactivated_by": "soulkey:uuid",
  "reason": "Contract violation: unauthorized sub-licensing detected.",
  "effects": {
    "payouts_frozen": true,
    "tenant_provisioning_disabled": true,
    "existing_tenants_unaffected": true
  }
}
```

**Side Effects:**
1. Set `_soul_partners.status` to `suspended`.
2. Set `_soul_partners.deactivated_at` to `now()`.
3. Set `_soul_partners.deactivated_reason` to the provided reason.
4. Write audit log entry with `event_type = partner.deactivated`.
5. Send email notification to `partner.contact_email` (see Section 6.1).
6. Send Slack webhook to `#partner-ops` (see Section 6.4).
7. **Do not** suspend or modify the partner's existing referred tenants. Those tenants continue operating. The deactivation prevents new referrals and freezes future payouts.

**Error Cases:**
- `404` if partner not found
- `409` if partner is already suspended or deactivated
- `400` if reason is missing or too short

---

### 3.4 `POST /v1/admin/partners/{id}/reactivate` -- Reactivate Partner

**Auth:** `require_permission("partners:admin")`

**Path Parameters:**
- `id` (UUID): Partner ID

**Request:**

```json
{
  "notes": "Issue resolved after review. Reinstating partner."
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `notes` | string | no | Max 1000 characters |

**Response (200):**

```json
{
  "partner_id": "uuid",
  "status": "active",
  "reactivated_at": "2026-04-06T16:00:00Z",
  "reactivated_by": "soulkey:uuid",
  "notes": "Issue resolved after review. Reinstating partner."
}
```

**Side Effects:**
1. Set `_soul_partners.status` to `active`.
2. Clear `deactivated_at` and `deactivated_reason`.
3. Write audit log entry with `event_type = partner.reactivated`.
4. Send email notification to partner (see Section 6.2).
5. Send Slack webhook to `#partner-ops`.

**Error Cases:**
- `404` if partner not found
- `409` if partner is already active

---

### 3.5 `PATCH /v1/admin/partners/{id}/terms` -- Update Partner Terms

**Auth:** `require_permission("partners:admin")`

**Path Parameters:**
- `id` (UUID): Partner ID

**Request:**

```json
{
  "commission_rate": 0.35,
  "override_commission_rate": 0.08,
  "payout_frequency": "quarterly"
}
```

All fields are optional. Only provided fields are updated.

| Field | Type | Required | Validation |
|---|---|---|---|
| `commission_rate` | float | no | 0.0 to 1.0 inclusive |
| `override_commission_rate` | float | no | 0.0 to 1.0 inclusive |
| `payout_frequency` | string | no | `monthly` or `quarterly` |

**Response (200):**

```json
{
  "partner_id": "uuid",
  "updated_fields": {
    "commission_rate": {"old": 0.40, "new": 0.35},
    "override_commission_rate": {"old": 0.10, "new": 0.08}
  },
  "updated_at": "2026-04-06T16:30:00Z",
  "updated_by": "soulkey:uuid"
}
```

**Side Effects:**
1. Update the specified columns on `_soul_partners`.
2. If `payout_frequency` is provided, store it in `_soul_partners.metadata_` under the key `payout_frequency` (no new column needed; this is a low-cardinality config value).
3. Write audit log entry with `event_type = partner.terms_updated`, including old and new values in `context`.
4. Send email notification to partner with updated terms (see Section 6.3).
5. Send Slack webhook to `#partner-ops`.

**Error Cases:**
- `404` if partner not found
- `400` if no fields are provided
- `400` if any field fails validation
- `409` if partner status is `deactivated` (cannot update terms for a deactivated partner; reactivate first)

---

### 3.6 `GET /v1/admin/partners/{id}/audit` -- Partner Audit Trail

**Auth:** `require_permission("partners:admin")`

**Path Parameters:**
- `id` (UUID): Partner ID

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | int | `1` | Page number |
| `page_size` | int | `50` | Items per page, max 100 |

**Response (200):**

```json
{
  "partner_id": "uuid",
  "entries": [
    {
      "id": "uuid",
      "timestamp": "2026-04-06T16:30:00Z",
      "event_type": "partner.terms_updated",
      "actor": "soulkey:uuid",
      "action": "update_terms",
      "context": {
        "changes": {
          "commission_rate": {"old": 0.40, "new": 0.35}
        }
      }
    },
    {
      "id": "uuid",
      "timestamp": "2026-04-01T12:00:00Z",
      "event_type": "partner.onboarded",
      "actor": "invitation_system",
      "action": "onboard",
      "context": {
        "referral_code": "acme-security-a1b2c3d4",
        "commission_rate": 0.40,
        "invitation_token_id": "token-id"
      }
    }
  ],
  "total": 5,
  "page": 1,
  "page_size": 50
}
```

**Implementation Notes:**
- Queries `_soulauth_audit` where `resource = 'partner'` and `context->>'partner_id' = :id` OR `tenant_id = partner.tenant_id` and `event_type LIKE 'partner.%'`.
- Results ordered by `timestamp DESC`.

**Error Cases:**
- `404` if partner not found
- `401`/`403` as above

---

### 3.7 `GET /v1/admin/invitations` -- List All Invitations

**Auth:** `require_permission("partners:admin")`

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | string (optional) | `null` | Filter: `active`, `consumed`, `expired`, `revoked` |
| `page` | int | `1` | Page number |
| `page_size` | int | `25` | Items per page, max 100 |

**Response (200):**

```json
{
  "invitations": [
    {
      "id": "token-uuid",
      "partner_name": "Acme Security Inc.",
      "contact_email": "jane@acmesec.com",
      "commission_rate": 0.40,
      "parent_partner_id": null,
      "status": "active",
      "created_by": "soulkey:uuid",
      "created_at": "2026-04-01T12:00:00Z",
      "expires_at": "2026-05-01T12:00:00Z",
      "consumed_at": null,
      "resulting_partner_id": null
    }
  ],
  "total": 15,
  "page": 1,
  "page_size": 25
}
```

**Implementation Notes:**
- Queries `_partner_invitations` directly.
- Before returning, mark any `active` invitations past `expires_at` as `expired` (lazy expiration, same pattern as `validate_and_consume_invitation`).

**Error Cases:**
- `401`/`403` as above

---

### 3.8 `DELETE /v1/admin/invitations/{token_id}` -- Revoke Invitation

**Auth:** `require_permission("partners:admin")`

**Path Parameters:**
- `token_id` (string): The invitation `id` (NOT the token hash; the UUID stored in `_partner_invitations.id`)

**Response (200):**

```json
{
  "invitation_id": "token-uuid",
  "status": "revoked",
  "revoked_at": "2026-04-06T17:00:00Z",
  "revoked_by": "soulkey:uuid"
}
```

**Side Effects:**
1. Set `_partner_invitations.status` to `revoked`.
2. Write audit log entry with `event_type = partner.invitation_revoked`.
3. Send Slack webhook to `#partner-ops`.

**Error Cases:**
- `404` if invitation ID not found
- `409` if invitation is already consumed, expired, or revoked (cannot revoke a non-active invitation)

---

## 4. New Permission: `partners:admin`

Add `partners:admin` to the RBAC permission system in `src/auth/rbac.py`.

This permission must be included in the `admin` and `owner` role permission sets:

```python
# In ROLE_PERMISSIONS:
"admin": [
    ...existing permissions...,
    "partners:admin",
],
```

The `partners:create` permission (already used by `POST /v1/partner/invitations`) remains separate. `partners:admin` is the broader permission covering all admin lifecycle endpoints. `partners:create` is scoped to invitation creation only.

**Note:** This is the one semantic addition to `src/auth/rbac.py`. The actual code change is minimal (one line in the permissions dict) but is called out here for clarity. The implementation should add this permission when the admin router is registered.

---

## 5. Database Changes

### 5.1 New Migration: `0020_partner_admin_columns.py`

Add columns to `_soul_partners` for lifecycle management:

```python
"""Add admin lifecycle columns to _soul_partners.

Revision ID: 0020
Revises: 0019
Create Date: 2026-04-06
"""

def upgrade() -> None:
    # Deactivation tracking
    op.add_column("_soul_partners", sa.Column(
        "deactivated_at", sa.DateTime(timezone=True), nullable=True
    ))
    op.add_column("_soul_partners", sa.Column(
        "deactivated_reason", sa.Text(), nullable=True
    ))
    op.add_column("_soul_partners", sa.Column(
        "deactivated_by", sa.VARCHAR(255), nullable=True
    ))

    # Partner type enum (stored as string for flexibility)
    op.add_column("_soul_partners", sa.Column(
        "partner_type", sa.VARCHAR(50), server_default="reseller", nullable=False
    ))

    # Updated-at timestamp for term changes
    op.add_column("_soul_partners", sa.Column(
        "updated_at", sa.DateTime(timezone=True),
        server_default=sa.text("now()"), nullable=True
    ))

    # Status check constraint
    op.create_check_constraint(
        "ck_soul_partners_status",
        "_soul_partners",
        "status IN ('pending', 'active', 'suspended', 'deactivated')"
    )

    # Partner type check constraint
    op.create_check_constraint(
        "ck_soul_partners_partner_type",
        "_soul_partners",
        "partner_type IN ('reseller', 'mssp')"
    )


def downgrade() -> None:
    op.drop_constraint("ck_soul_partners_partner_type", "_soul_partners")
    op.drop_constraint("ck_soul_partners_status", "_soul_partners")
    op.drop_column("_soul_partners", "updated_at")
    op.drop_column("_soul_partners", "partner_type")
    op.drop_column("_soul_partners", "deactivated_by")
    op.drop_column("_soul_partners", "deactivated_reason")
    op.drop_column("_soul_partners", "deactivated_at")
```

### 5.2 Partner Status Lifecycle

```
  pending ──────> active ──────> suspended ──────> active (reactivated)
    │                │                │
    │                │                └──> deactivated (terminal)
    │                └──> deactivated (terminal)
    └──> (invitation expires, never onboarded)
```

| Status | Meaning | Can create referrals? | Payouts active? | Can be modified? |
|---|---|---|---|---|
| `pending` | Invitation issued but not yet redeemed | No | No | N/A |
| `active` | Fully onboarded and operational | Yes | Yes | Yes |
| `suspended` | Temporarily frozen by admin | No | No (frozen) | Terms only after reactivation |
| `deactivated` | Permanently removed from program | No | No | No (terminal state) |

### 5.3 Model Update: `SoulPartner`

The ORM model in `src/database/models.py` should be updated to include the new columns. This is a model-only change that mirrors the migration:

```python
# New columns on SoulPartner
deactivated_at: Mapped[Optional[datetime]] = mapped_column(
    DateTime(timezone=True), nullable=True
)
deactivated_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
deactivated_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
partner_type: Mapped[str] = mapped_column(
    String(50), default="reseller", nullable=False
)
updated_at: Mapped[Optional[datetime]] = mapped_column(
    DateTime(timezone=True), default=_now, onupdate=_now, nullable=True
)
```

---

## 6. Notification Hooks

### 6.1 Partner Deactivated Email

**Trigger:** `POST /v1/admin/partners/{id}/deactivate` succeeds
**Recipient:** `partner.contact_email`
**Subject:** `Tiresias Partner Account Suspended`
**Template function:** `render_partner_deactivated(contact_name, reason, support_email)`

Content:
- Inform the partner their account has been suspended.
- State the reason provided by admin.
- Clarify that existing referred tenants are unaffected.
- Provide support contact for appeal.

### 6.2 Partner Reactivated Email

**Trigger:** `POST /v1/admin/partners/{id}/reactivate` succeeds
**Recipient:** `partner.contact_email`
**Subject:** `Tiresias Partner Account Reactivated`
**Template function:** `render_partner_reactivated(contact_name, dashboard_url)`

Content:
- Inform the partner their account is active again.
- Link to partner dashboard.

### 6.3 Terms Updated Email

**Trigger:** `PATCH /v1/admin/partners/{id}/terms` succeeds
**Recipient:** `partner.contact_email`
**Subject:** `Tiresias Partner Terms Updated`
**Template function:** `render_partner_terms_updated(contact_name, changes, effective_date)`

Content:
- List each changed field with old and new values.
- State the effective date (immediate).
- Provide support contact for questions.

### 6.4 Invitation Created Email

**Trigger:** `POST /v1/partner/invitations` succeeds (existing endpoint, add hook)
**Recipient:** `body.contact_email`
**Subject:** `You're Invited to the Tiresias Partner Program`
**Template function:** `render_partner_invitation(contact_name, onboard_url, expires_at)`

Content:
- Invitation to join the Tiresias partner program.
- CTA button linking to the onboarding URL with the token.
- Expiration date.
- What to expect after onboarding (Stripe Connect, dashboard access).

**Note:** This email is sent from the existing invitation endpoint. The implementation adds the email send call after `create_invitation()` returns successfully. The raw token is included in the onboarding URL: `https://tiresias.network/partner/onboard?token={raw_token}`.

### 6.5 Slack Webhook to `#partner-ops`

All admin actions send a Slack notification via incoming webhook. The webhook URL is stored in `PARTNER_OPS_SLACK_WEBHOOK` environment variable.

**Events and message format:**

| Event | Slack Message |
|---|---|
| Invitation created | `[Partner Ops] Invitation created for {partner_name} ({contact_email}) by {actor}. Expires {expires_at}.` |
| Invitation revoked | `[Partner Ops] Invitation for {partner_name} revoked by {actor}. Reason: manual revocation.` |
| Partner onboarded | `[Partner Ops] {partner_name} onboarded successfully. Referral code: {referral_code}. Commission: {rate}%.` |
| Partner deactivated | `[Partner Ops] {partner_name} deactivated by {actor}. Reason: {reason}.` |
| Partner reactivated | `[Partner Ops] {partner_name} reactivated by {actor}.` |
| Terms updated | `[Partner Ops] Terms updated for {partner_name} by {actor}: {changed_fields}.` |

**Implementation:** A shared helper function `notify_partner_ops(message: str)` that POSTs to the Slack webhook. Failures are logged but do not block the API response (fire and forget with a 5-second timeout).

```python
async def notify_partner_ops(message: str) -> None:
    """Send notification to #partner-ops Slack channel. Non-blocking."""
    webhook_url = os.getenv("PARTNER_OPS_SLACK_WEBHOOK")
    if not webhook_url:
        logger.debug("partner_ops.slack_skipped", reason="webhook not configured")
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(webhook_url, json={"text": message})
        logger.info("partner_ops.slack_sent")
    except Exception as exc:
        logger.warning("partner_ops.slack_failed", error=str(exc))
```

---

## 7. New Files

### 7.1 `src/partner/admin_router.py`

The admin partner management router. Contains all 8 endpoints from Section 3. Mounted at `/v1/admin/partners` (and `/v1/admin/invitations` for the invitation endpoints).

**Structure:**

```python
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from src.auth.rbac import require_permission
from src.partner.admin_schemas import (
    PartnerListResponse, PartnerDetailResponse,
    DeactivateRequest, DeactivateResponse,
    ReactivateRequest, ReactivateResponse,
    UpdateTermsRequest, UpdateTermsResponse,
    AuditTrailResponse,
    InvitationListResponse, RevokeInvitationResponse,
)

router = APIRouter(tags=["Partner Admin"])

# Partner endpoints under /v1/admin/partners
partner_router = APIRouter(
    prefix="/v1/admin/partners",
    dependencies=[Depends(require_permission("partners:admin"))],
)

# Invitation endpoints under /v1/admin/invitations
invitation_router = APIRouter(
    prefix="/v1/admin/invitations",
    dependencies=[Depends(require_permission("partners:admin"))],
)

@partner_router.get("", response_model=PartnerListResponse)
async def list_partners(...): ...

@partner_router.get("/{partner_id}", response_model=PartnerDetailResponse)
async def get_partner_detail(...): ...

@partner_router.post("/{partner_id}/deactivate", response_model=DeactivateResponse)
async def deactivate_partner(...): ...

@partner_router.post("/{partner_id}/reactivate", response_model=ReactivateResponse)
async def reactivate_partner(...): ...

@partner_router.patch("/{partner_id}/terms", response_model=UpdateTermsResponse)
async def update_partner_terms(...): ...

@partner_router.get("/{partner_id}/audit", response_model=AuditTrailResponse)
async def get_partner_audit(...): ...

@invitation_router.get("", response_model=InvitationListResponse)
async def list_invitations(...): ...

@invitation_router.delete("/{token_id}", response_model=RevokeInvitationResponse)
async def revoke_invitation(...): ...
```

### 7.2 `src/partner/admin_schemas.py`

Pydantic models for all admin endpoint request/response bodies.

**Models to define:**

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

# --- List Partners ---
class PartnerSummary(BaseModel):
    id: str
    tenant_id: str
    name: str
    contact_email: str
    referral_code: str
    commission_rate: float
    override_commission_rate: float
    status: str
    partner_type: str
    stripe_connect_status: str
    parent_partner_id: Optional[str]
    referral_count: int
    active_referral_count: int
    created_at: Optional[str]
    approved_at: Optional[str]

class PartnerListResponse(BaseModel):
    partners: list[PartnerSummary]
    total: int
    page: int
    page_size: int
    total_pages: int

# --- Partner Detail ---
class ReferralTenantSummary(BaseModel):
    tenant_id: str
    name: str
    tier: str
    status: str
    created_at: Optional[str]

class ReferralsSummary(BaseModel):
    total: int
    active: int
    suspended: int
    deactivated: int
    total_mrr_cents: Optional[int]
    tenants: list[ReferralTenantSummary]

class ConnectStatus(BaseModel):
    account_id: Optional[str]
    charges_enabled: bool
    payouts_enabled: bool
    details_submitted: bool
    requirements: list[str]

class CommissionSplitDetail(BaseModel):
    platform_rate: float
    seller_rate: float
    seller_net_rate: float
    recruiter_rate: float
    is_cascading: bool

class PartnerDetailResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    contact_email: str
    referral_code: str
    commission_rate: float
    override_commission_rate: float
    status: str
    partner_type: str
    stripe_connect_status: str
    stripe_connect_account_id: Optional[str]
    parent_partner_id: Optional[str]
    contract_hash: Optional[str]
    approved_at: Optional[str]
    approved_by: Optional[str]
    deactivated_at: Optional[str]
    deactivated_reason: Optional[str]
    created_at: Optional[str]
    metadata: Optional[dict]
    referrals: ReferralsSummary
    connect: Optional[ConnectStatus]
    commission_split: CommissionSplitDetail

# --- Deactivate ---
class DeactivateRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=1000)

class DeactivateResponse(BaseModel):
    partner_id: str
    status: str
    deactivated_at: str
    deactivated_by: str
    reason: str
    effects: dict

# --- Reactivate ---
class ReactivateRequest(BaseModel):
    notes: Optional[str] = Field(None, max_length=1000)

class ReactivateResponse(BaseModel):
    partner_id: str
    status: str
    reactivated_at: str
    reactivated_by: str
    notes: Optional[str]

# --- Update Terms ---
class UpdateTermsRequest(BaseModel):
    commission_rate: Optional[float] = Field(None, ge=0.0, le=1.0)
    override_commission_rate: Optional[float] = Field(None, ge=0.0, le=1.0)
    payout_frequency: Optional[str] = Field(None, pattern="^(monthly|quarterly)$")

class FieldChange(BaseModel):
    old: object
    new: object

class UpdateTermsResponse(BaseModel):
    partner_id: str
    updated_fields: dict[str, FieldChange]
    updated_at: str
    updated_by: str

# --- Audit Trail ---
class AuditEntry(BaseModel):
    id: str
    timestamp: str
    event_type: str
    actor: str
    action: Optional[str]
    context: Optional[dict]

class AuditTrailResponse(BaseModel):
    partner_id: str
    entries: list[AuditEntry]
    total: int
    page: int
    page_size: int

# --- Invitations ---
class InvitationSummary(BaseModel):
    id: str
    partner_name: str
    contact_email: str
    commission_rate: float
    parent_partner_id: Optional[str]
    status: str
    created_by: str
    created_at: Optional[str]
    expires_at: str
    consumed_at: Optional[str]
    resulting_partner_id: Optional[str]

class InvitationListResponse(BaseModel):
    invitations: list[InvitationSummary]
    total: int
    page: int
    page_size: int

class RevokeInvitationResponse(BaseModel):
    invitation_id: str
    status: str
    revoked_at: str
    revoked_by: str
```

### 7.3 `src/partner/admin_notifications.py`

Shared notification helpers for partner admin actions. Contains:

- `notify_partner_ops(message: str)` for Slack webhook
- `send_partner_deactivated_email(contact_email, contact_name, reason)`
- `send_partner_reactivated_email(contact_email, contact_name)`
- `send_partner_terms_updated_email(contact_email, contact_name, changes)`
- `send_partner_invitation_email(contact_email, contact_name, onboard_url, expires_at)`

All email functions use the existing `send_email()` from `src/email/sender.py` and new template functions in `src/email/templates.py`. The template additions follow the existing Tiresias brand (bg `#0a0e1a`, card `#111827`, gold `#d4a853`, teal `#2dd4bf`).

### 7.4 `tests/test_partner_admin.py`

Full test suite covering all 8 endpoints. Uses the existing test patterns (pytest-asyncio, httpx `AsyncClient`, SQLAlchemy test session with `SOULAUTH_TESTING=true`).

**Test cases:**

```
List Partners:
  test_list_partners_empty
  test_list_partners_returns_all
  test_list_partners_filter_by_status
  test_list_partners_filter_by_type
  test_list_partners_filter_by_date_range
  test_list_partners_search_by_name
  test_list_partners_search_by_email
  test_list_partners_pagination
  test_list_partners_sort_by_commission_rate
  test_list_partners_unauthorized_returns_401

Partner Detail:
  test_get_partner_detail_success
  test_get_partner_detail_includes_referrals
  test_get_partner_detail_includes_connect_status
  test_get_partner_detail_not_found_returns_404
  test_get_partner_detail_unauthorized_returns_401

Deactivate:
  test_deactivate_partner_success
  test_deactivate_partner_sets_status_suspended
  test_deactivate_partner_writes_audit_log
  test_deactivate_partner_already_suspended_returns_409
  test_deactivate_partner_not_found_returns_404
  test_deactivate_partner_reason_too_short_returns_400

Reactivate:
  test_reactivate_partner_success
  test_reactivate_partner_clears_deactivation_fields
  test_reactivate_partner_writes_audit_log
  test_reactivate_partner_already_active_returns_409
  test_reactivate_partner_not_found_returns_404

Update Terms:
  test_update_terms_commission_rate
  test_update_terms_multiple_fields
  test_update_terms_records_old_and_new_values
  test_update_terms_writes_audit_log
  test_update_terms_no_fields_returns_400
  test_update_terms_deactivated_partner_returns_409
  test_update_terms_invalid_commission_rate_returns_422
  test_update_terms_not_found_returns_404

Audit Trail:
  test_get_audit_trail_empty
  test_get_audit_trail_returns_entries
  test_get_audit_trail_pagination
  test_get_audit_trail_not_found_returns_404

Invitations:
  test_list_invitations_all
  test_list_invitations_filter_by_status
  test_list_invitations_marks_expired
  test_list_invitations_pagination

Revoke Invitation:
  test_revoke_invitation_success
  test_revoke_invitation_already_consumed_returns_409
  test_revoke_invitation_already_revoked_returns_409
  test_revoke_invitation_not_found_returns_404
```

---

## 8. Portal Admin Page

### 8.1 Route: `/dashboard/admin/partners`

A new page in the Next.js 16 portal at `tiresias.network`. Access gated by OIDC session with `admin` or `owner` role.

### 8.2 List View

| Element | Description |
|---|---|
| Search bar | Text input, debounced 300ms, searches name and email |
| Status filter | Dropdown: All, Active, Suspended, Deactivated, Pending |
| Type filter | Dropdown: All, Reseller, MSSP |
| Table columns | Name, Email, Type, Status, Commission %, Referrals, Connect Status, Created |
| Row click | Navigate to detail view |
| Pagination | Bottom of table, page size selector (10, 25, 50) |
| "New Invitation" button | Opens invitation creation modal (calls existing `POST /v1/partner/invitations`) |

### 8.3 Detail View: `/dashboard/admin/partners/[id]`

**Header Section:**
- Partner name, status badge (color-coded), partner type badge
- Action buttons: Deactivate (red, with confirmation modal), Edit Terms, Reactivate (if suspended)

**Metrics Cards Row:**
- Total Referrals, Active Referrals, Commission Rate, Connect Status

**Tabs:**

| Tab | Content |
|---|---|
| Overview | Partner details, contact info, commission split visualization, contract hash |
| Referrals | Table of referred tenants: name, tier, status, created date |
| Audit Log | Chronological list of all admin actions, paginated |
| Terms | Current terms with edit form: commission rate slider, payout frequency selector |

**Edit Terms Modal:**
- Commission rate: slider 0-100% with numeric input
- Override commission rate: slider 0-100% with numeric input
- Payout frequency: radio buttons (Monthly, Quarterly)
- Confirmation step showing old vs. new values before submission

**Deactivate Confirmation Modal:**
- Warning text explaining effects
- Required reason textarea (min 5 characters)
- "Cancel" and "Confirm Deactivation" buttons

### 8.4 Invitation Management Tab: `/dashboard/admin/partners?tab=invitations`

A tab on the partner list page showing all invitations.

| Column | Description |
|---|---|
| Partner Name | Name from invitation |
| Email | Contact email |
| Commission | Rate set at creation |
| Status | Badge: Active (green), Consumed (blue), Expired (gray), Revoked (red) |
| Created | Timestamp |
| Expires | Timestamp |
| Actions | Revoke button (only for `active` status) |

---

## 9. Estimated Effort

| Component | Estimate | Dependencies | Risk |
|---|---|---|---|
| `admin_schemas.py` | 2 hours | None | Low. Straightforward Pydantic models. |
| `admin_router.py` (8 endpoints) | 8 hours | Schemas, DB migration | Medium. SQL queries with filtering/pagination need care. |
| `admin_notifications.py` | 2 hours | Email templates | Low. Wraps existing `send_email()` and Slack webhook. |
| Email templates (4 new) | 3 hours | None | Low. Follow existing template pattern in `src/email/templates.py`. |
| DB migration `0020` | 1 hour | None | Low. Additive columns only, no data migration. |
| ORM model update | 0.5 hours | Migration | Low. Mirror migration columns. |
| RBAC permission addition | 0.5 hours | None | Low. One line in permission dict. |
| `test_partner_admin.py` | 6 hours | All above | Medium. ~35 test cases; DB fixture setup is the main effort. |
| Portal list view | 4 hours | API endpoints | Low. Standard table with filters. |
| Portal detail view | 6 hours | API endpoints | Medium. Multiple tabs, action modals, metrics cards. |
| Portal invitation tab | 2 hours | API endpoints | Low. Simple table with revoke action. |
| **Total** | **35 hours** | | |

### Risk Factors

1. **Stripe Connect status queries.** The partner detail endpoint calls Stripe's API to get Connect account status. If the partner has no Connect account or Stripe is slow, this could degrade response times. Mitigation: make the Connect block optional and cache status in `_soul_partners.stripe_connect_status`.

2. **Audit log query performance.** The audit trail query searches `_soulauth_audit` by JSON field (`context->>'partner_id'`). At high audit volumes, this needs a GIN index on `context`. For launch volumes (< 100 partners), this is fine.

3. **Email delivery.** Partner notification emails go through Resend (existing provider). If Resend is down, notifications fail silently. This is acceptable; the admin action itself still succeeds. Consider adding a retry queue in a future build.

4. **Concurrent status changes.** Two admins could simultaneously deactivate and update terms for the same partner. Mitigation: use optimistic locking (check status before write) and return `409` on conflict.

### Sequencing

This build can be implemented in parallel with other partner builds since it creates only new files. The recommended implementation order within this build:

1. DB migration + ORM model update + RBAC permission (foundation)
2. Schemas (needed by router)
3. Router endpoints (core logic)
4. Notification helpers + email templates (can be stubbed initially)
5. Tests
6. Portal pages (can lag behind API by a sprint)
