# Part VIII: MSSP Operations

> **Tiresias Administration Guide v3.0**
> **Classification:** Customer-Facing
> **Audience:** Security administrators, SOC managers, MSSPs, platform operators

---

## Chapter 25: MSSP Platform Configuration

Managed Security Service Providers (MSSPs) operate Tiresias on behalf of multiple customer organizations. The MSSP tier extends the enterprise multi-tenancy model with dedicated partner management, cross-tenant visibility, centralized policy push, and revenue-sharing integration via Stripe Connect.

This chapter covers the deployment architecture for MSSP operations, customer tenant onboarding, tier package mapping, partner revenue share configuration, and customer-specific SLA management.

### 25.1 MSSP Deployment Architecture

#### Management Hierarchy

The MSSP deployment model introduces a three-level management hierarchy:

| Level | Entity | Description |
|-------|--------|-------------|
| **Platform** | Saluca (Tiresias operator) | Operates the SaaS infrastructure, issues install-level licenses, and manages the MSSP partner program |
| **MSSP Partner** | Partner tenant (tier = `mssp`) | Manages multiple customer tenants, sets policies, monitors security posture, and bills customers |
| **Customer** | Child tenant (tier = `starter`, `pro`, or `enterprise`) | End customer organization whose agents, policies, and security events are managed by the MSSP |

The partner tenant acts as a parent. All customer tenants provisioned by the MSSP are linked via the `parent_tenant_id` foreign key on the `_soul_tenants` table. This relationship enables cross-tenant queries, aggregated dashboards, and cascading policy inheritance.

As of v3.2.0, the MSSP hierarchy integrates into the platform-wide tenant hierarchy model (see Chapter 21, Section 21.1.1). MSSP partners sit at `hierarchy_depth = 1` under the SaaS master, and their customer tenants sit at depth 2. Enterprise customers may create sub-tenants at depth 3 for business unit isolation.

#### Tier Creation Rules for MSSP Partners

MSSP-tier tenants can create child tenants at the following tiers:

| Child Tier | Permitted | Notes |
|-----------|-----------|-------|
| `enterprise` | Yes | Full-feature customer deployment |
| `pro` | Yes | Mid-market customer deployment |
| `community` | Yes | Free-tier or trial customer |
| `starter` | Yes | Small-team customer |
| `mssp` | No | Only SaaS master can create MSSP partners |
| `saas` | No | Reserved for platform operator |

MSSP operators provision child tenants using the hierarchy-aware endpoint `POST /v1/saas/admin/tenants` with the `parent_tenant_id` set to the MSSP partner's tenant UUID. The legacy `POST /v1/saas/provision` endpoint continues to work and automatically sets `parent_tenant_id` from the caller's `X-Tenant-ID` header.

#### Multi-Customer Isolation

Despite the management hierarchy, Tiresias enforces strict data isolation between customer tenants:

| Isolation Boundary | Enforcement Mechanism |
|--------------------|-----------------------|
| **Data partitioning** | Every database query includes a `WHERE tenant_id = :tid` clause. There is no shared data namespace between tenants. |
| **Encryption isolation** | Each tenant receives a dedicated Data Encryption Key (DEK) provisioned via `provision_tenant_encryption()`. DEKs are envelope-encrypted under the platform KEK or a customer-supplied BYOK key. |
| **SoulKey scoping** | SoulKeys are issued per-tenant. An agent authenticated with Tenant A's SoulKey cannot access Tenant B's resources. |
| **Policy isolation** | Each tenant has an independent `PolicyCache` entry. Policy evaluation is always scoped to the calling tenant. |
| **Audit log separation** | Audit log entries are tagged with `tenant_id`. Cross-tenant audit queries are restricted to MSSP-tier operators with the `mssp:read` permission. |

The MSSP partner tenant has read-only cross-tenant visibility into its child tenants. This visibility is implemented through the MSSP API endpoints (`/v1/mssp/tenants`, `/v1/mssp/enforcement/quarantine`) and the Portal MSSP dashboard, not through direct database access.

#### Shared Infrastructure Model

MSSP deployments share the following infrastructure components across all customer tenants:

- **SoulAuth service** -- Single instance handles authentication and authorization for all tenants. Tenant context is injected via the `X-Tenant-ID` header.
- **SoulWatch detection engine** -- One engine evaluates detection rules across all tenants. Sigma rules can be scoped globally or per-tenant.
- **SoulGate gateway** -- Single gateway instance with per-tenant rate limit configuration.
- **PostgreSQL database** -- Shared database with row-level tenant isolation. Connection pooling is configured via `db_pool_size` (default: 10) and `db_max_overflow` (default: 20).

> **Caution:** MSSP operators must size the database connection pool based on the number of active customer tenants. A recommended starting point is `db_pool_size = max(10, active_tenants * 2)` and `db_max_overflow = db_pool_size * 2`.

### 25.1.1 SaaS Master Administration (v3.2.0)

The SaaS master tier (`tier = saas`, `hierarchy_depth = 0`) is reserved for the platform operator. It provides unrestricted visibility and control over the entire tenant hierarchy, including all MSSP partners and their customer tenants.

#### Platform Admin Page

The Portal exposes the Platform Admin page at **Dashboard > MSSP > Platform Admin** (`/dashboard/mssp/platform-admin`). This page is only visible to users authenticated under a SaaS master tenant. It provides:

| Section | Description |
|---------|-------------|
| **Tenant Tree** | Interactive hierarchy view of all tenants, grouped by parent. Expand/collapse subtrees. Filter by tier, status, or depth. |
| **Provisioning** | Create tenants at any level with explicit parent assignment. The form enforces tier creation rules and depth constraints. |
| **Health Overview** | Aggregated metrics across all tenants: total agents, request volume, anomaly counts, and storage utilization. |
| **Hierarchy Integrity** | Run on-demand validation to detect orphaned tenants, depth constraint violations, or circular references. Results are displayed inline with remediation actions. |
| **Bulk Operations** | Suspend, activate, or offboard multiple tenants in a single operation. Confirmation dialog shows the affected subtree. |

#### SaaS Admin API Endpoints

The following endpoints are restricted to SaaS master credentials (`tier = saas`):

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/saas/admin/tenants` | List all tenants with hierarchy metadata (parent, depth, child count). |
| `POST` | `/v1/saas/admin/tenants` | Create a tenant at any level with explicit `parent_tenant_id`. |
| `GET` | `/v1/saas/admin/tenants/{id}/subtree` | Retrieve the full subtree under a tenant. |
| `PATCH` | `/v1/saas/admin/tenants/{id}/reparent` | Move a tenant to a different parent (depth constraints enforced). |
| `GET` | `/v1/saas/admin/hierarchy/stats` | Platform-wide hierarchy statistics. |
| `POST` | `/v1/saas/admin/hierarchy/validate` | Validate hierarchy integrity. |

See Chapter 31 (API Reference) for full request/response schemas.

### 25.2 Onboard a New Customer Tenant

Customer tenant onboarding is an atomic operation that provisions all required resources in a single database transaction. If any step fails, the entire operation rolls back, leaving no partial records.

#### Provisioning via Portal

The MSSP Portal page at **Dashboard > MSSP > SaaS Admin** (`/dashboard/mssp/saas`) provides a provisioning form with three fields:

| Field | Description | Validation |
|-------|-------------|------------|
| **Company Name** | Customer organization name | 2-255 characters |
| **Admin Email** | Contact email for the customer admin | Valid email format |
| **Initial Tier** | Subscription tier to assign | `community`, `starter`, `pro`, or `enterprise` |

On submission, the Portal calls `POST /api/mssp/provision` which invokes the SaaS provisioning endpoint.

#### Provisioning via API

To provision a customer tenant programmatically, use the hierarchy-aware endpoint or the legacy provisioning endpoint.

**Hierarchy-aware endpoint (v3.2.0, recommended):**

```
POST /v1/saas/admin/tenants
Content-Type: application/json
Authorization: Bearer <mssp_admin_soulkey>

{
  "name": "Acme Security Corp",
  "slug": "acme-sec",
  "tier": "pro",
  "parent_tenant_id": "<mssp_partner_tenant_id>",
  "metadata": {
    "contact_email": "admin@acmesec.com",
    "sla_tier": "gold"
  }
}
```

The `parent_tenant_id` explicitly places the new tenant in the hierarchy. The API validates that the caller is an admin of the parent tenant and that the requested tier is permitted by the parent's tier (see Section 25.1 Tier Creation Rules). The response includes `hierarchy_depth` and `parent_tenant_id` in the tenant object.

**Legacy endpoint (still supported):**

```
POST /v1/saas/provision
Content-Type: application/json
X-Tenant-ID: <mssp_partner_tenant_id>

{
  "company_name": "Acme Security Corp",
  "slug": "acme-sec",
  "tier": "pro",
  "admin_persona_id": "admin",
  "metadata": {
    "contact_email": "admin@acmesec.com",
    "sla_tier": "gold"
  }
}
```

The legacy endpoint automatically sets `parent_tenant_id` from the caller's `X-Tenant-ID` header and computes `hierarchy_depth` accordingly.

The slug must be unique, lowercase alphanumeric with hyphens, between 2 and 63 characters, matching the pattern `^[a-z0-9-]+$`.

#### What Provisioning Creates

The provisioning endpoint performs the following steps atomically:

| Step | Resource Created | Details |
|------|-----------------|---------|
| 1 | `SoulTenant` record | Tenant row with name, slug, tier, and status = `active` |
| 2 | Data Encryption Key | Per-tenant DEK provisioned via envelope encryption |
| 3 | Admin SoulKey | SHA-512-hashed SoulKey issued for the `admin` persona. The raw key is returned in the response and displayed exactly once. |
| 4 | Default PolicyCache | Wildcard policy (`resource: *, action: *, scope: *, effect: allow`) for the admin persona |
| 5 | Audit log entry | `saas.provision` event with provisioning metadata |

**Response:**

```json
{
  "tenant_id": "a1b2c3d4-...",
  "soulkey_id": "e5f6g7h8-...",
  "raw_key": "sk_acme-sec_AbCdEf...",
  "slug": "acme-sec",
  "tier": "pro",
  "status": "active",
  "provisioned_at": "2026-04-02T14:30:00Z"
}
```

> **Important:** The `raw_key` value is the admin SoulKey for the new tenant. It is never stored in the database and cannot be retrieved after this response. Deliver it to the customer administrator through a secure channel.

#### Automated Provisioning via Stripe Webhook

When a customer subscribes through Stripe Checkout, the `customer.subscription.created` webhook event triggers automatic tenant provisioning. The webhook handler:

1. Resolves the tier from the Stripe subscription metadata, plan nickname, or plan ID using the `STRIPE_TIER_MAP`.
2. Creates a tenant with the company name from `metadata.company_name` or a generated name.
3. Sets the `stripe_customer_id` and `stripe_subscription_id` in tenant metadata.
4. Provisions the DEK, admin SoulKey, and default policy.
5. Logs a `saas.auto_provision` audit event.

Configure Stripe Price ID to tier mapping via environment variables:

| Environment Variable | Tier |
|---------------------|------|
| `STRIPE_PRICE_STARTER_MONTHLY` | starter |
| `STRIPE_PRICE_STARTER_ANNUAL` | starter |
| `STRIPE_PRICE_PRO_MONTHLY` | pro |
| `STRIPE_PRICE_PRO_ANNUAL` | pro |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY` | enterprise |
| `STRIPE_PRICE_ENTERPRISE_ANNUAL` | enterprise |
| `STRIPE_PRICE_MSSP_MONTHLY` | mssp |
| `STRIPE_PRICE_MSSP_ANNUAL` | mssp |

#### Default Policy Application

Every new tenant receives a default admin policy that grants full access:

```yaml
version: "1.0"
persona_id: admin
tenant_id: "<tenant_uuid>"
rules:
  - resource: "*"
    action: "*"
    scope: "*"
    effect: allow
created_by: saas_provisioner
```

After provisioning, the MSSP operator should push a restrictive baseline policy that aligns with the customer's security requirements and SLA tier.

### 25.3 Configure Customer Tier Packages

Tiresias defines six subscription tiers in ascending order of capability. Each tier unlocks specific features and enforces resource limits through the `TierGate` component in the Portal and the `FeatureGateMiddleware` in the API.

#### Tier Hierarchy

| Rank | Tier | Slug | Description |
|------|------|------|-------------|
| 0 | Community | `community` | Free tier with basic agent identity and limited detection |
| 1 | Starter | `starter` | Small teams: up to 10 agents, basic anomaly detection, email alerts |
| 2 | Professional | `pro` | Mid-market: unlimited agents, Sigma rules, SIEM integration, automated response |
| 3 | Enterprise | `enterprise` | Full platform: SSO, RBAC, compliance reporting, customer-held encryption, priority support |
| 4 | MSSP | `mssp` | Multi-tenant management, cross-tenant dashboards, partner revenue share, white-label reporting |
| 5 | SaaS | `saas` | Platform operator tier: full administrative access to all platform capabilities |

The effective tier for a tenant is computed as the minimum of the install-level license tier and the tenant subscription tier:

```
effective_tier = min(install_license_tier, tenant_subscription_tier)
```

This means that an MSSP partner with an `mssp` install license can provision customer tenants at `starter`, `pro`, or `enterprise` tiers, but cannot provision tenants at the `saas` tier.

#### Mapping Stripe Products to Tiers

Each Stripe product corresponds to one Tiresias tier. Separate Stripe products per tier enable per-tier coupon targeting and promotional pricing. The mapping is built at service startup from environment variables and hardcoded fallbacks.

The tier resolution order when processing a Stripe webhook event is:

1. `metadata.tiresias_tier` on the Stripe subscription object (explicit override)
2. Plan nickname matching against `STRIPE_TIER_MAP`
3. Plan ID matching against `STRIPE_TIER_MAP`
4. Fallback to `DEFAULT_TIER` (community)

#### Tier Changes

Tier changes are processed through two paths:

| Path | Trigger | Behavior |
|------|---------|----------|
| **Self-service upgrade** | `POST /v1/billing/upgrade` | Updates Stripe subscription and DB tier. Stripe update is best-effort; DB tier always updates. |
| **Webhook-driven** | `customer.subscription.updated` | Stripe webhook updates tenant tier based on new plan. Emits a `tier_changed` audit event. |

On subscription cancellation (`customer.subscription.deleted`), the tenant is downgraded to the `community` tier.

### 25.4 Manage Partner Revenue Share

Tiresias implements a cascading commission model for partner revenue sharing through Stripe Connect Express.

#### Commission Split Model

The default revenue split is:

| Party | Rate | Description |
|-------|------|-------------|
| **Platform (Saluca)** | 60% | Base platform rate |
| **Seller (direct partner)** | 40% | Partner commission rate (configurable per partner, 0-100%) |
| **Recruiter (parent partner)** | 10% override | Deducted from seller's share when a cascading relationship exists |

In a two-party split (no recruiter), the revenue divides 60/40 between platform and seller via Stripe `application_fee_percent`.

In a three-party cascading split (seller was recruited by another partner), the seller's net rate is reduced by the recruiter's override rate. For example, with a 40% seller rate and 10% recruiter override:

| Party | Rate |
|-------|------|
| Platform | 60% |
| Seller (net) | 30% |
| Recruiter | 10% |

#### Partner Onboarding Flow

Partner onboarding is an invitation-based process:

**Step 1: Admin creates invitation**

```
POST /v1/partner/invitations
Authorization: Bearer <admin_soulkey>

{
  "partner_name": "SecureOps Inc",
  "contact_email": "partner@secureops.com",
  "commission_rate": 0.40,
  "parent_partner_id": null,
  "ttl_days": 30
}
```

The response contains a one-time invitation token prefixed with `pinv_`. The token is SHA-256 hashed before storage; only the raw token is returned.

**Step 2: Partner consumes invitation**

```
POST /v1/partner/onboard

{
  "invitation_token": "pinv_a1b2c3..."
}
```

This creates:
- A partner tenant with tier `mssp`
- An admin SoulKey for the partner
- A `SoulPartner` record with referral code, commission rate, and status
- A per-tenant DEK for envelope encryption

**Step 3: Stripe Connect Express onboarding**

```
POST /v1/partner/connect/onboard
X-Tenant-ID: <partner_tenant_id>
```

Creates a Stripe Connect Express account and returns an onboarding URL where the partner completes KYC and tax documentation.

**Step 4: Verify Connect status**

```
GET /v1/partner/connect/status
X-Tenant-ID: <partner_tenant_id>
```

Returns the account's `charges_enabled`, `payouts_enabled`, and `details_submitted` status. Once all are true, the partner can receive payouts.

#### Partner Promo Codes

Partners can create promotional codes for their customers:

```
POST /v1/partner/promo/create
X-Tenant-ID: <partner_tenant_id>

{
  "code": "SECOPS-20OFF",
  "discount_percent": 20.0,
  "duration_months": 12,
  "product_ids": null,
  "max_redemptions": 100
}
```

The promo code creates a Stripe coupon and promotion code linked to the partner's Connect account.

#### Partner Dashboard

Partners can view their dashboard data via:

```
GET /v1/partner/me
X-Tenant-ID: <partner_tenant_id>
```

Response fields:

| Field | Description |
|-------|-------------|
| `partner_id` | Partner UUID |
| `name` | Partner organization name |
| `referral_code` | Unique referral code for customer acquisition |
| `commission_rate` | Configured commission rate (0.0-1.0) |
| `stripe_connect_status` | `pending`, `reviewing`, or `active` |
| `total_referrals` | Count of all referred tenants |
| `active_referrals` | Count of active referred tenants |

### 25.5 Set Customer-Specific SLAs

MSSP operators can define per-customer SLAs by configuring metadata on the customer tenant record. SLA parameters are stored in the `metadata_` JSONB column of the `_soul_tenants` table.

#### SLA Configuration Parameters

| Metadata Key | Type | Description | Example |
|-------------|------|-------------|---------|
| `sla_tier` | string | SLA tier identifier | `gold`, `silver`, `bronze` |
| `sla_response_time_minutes` | integer | Maximum initial response time for critical alerts | `15` |
| `sla_uptime_target` | float | Target uptime percentage | `99.95` |
| `sla_escalation_contacts` | list | Escalation contact chain | `["soc@partner.com", "cto@customer.com"]` |
| `sla_report_frequency` | string | Reporting cadence | `weekly`, `monthly` |

#### Setting SLAs via API

Update the tenant metadata with SLA parameters:

```
PATCH /v1/tenant/<tenant_id>
X-Tenant-ID: <mssp_partner_tenant_id>

{
  "metadata": {
    "sla_tier": "gold",
    "sla_response_time_minutes": 15,
    "sla_uptime_target": 99.95,
    "sla_escalation_contacts": ["soc@partner.com"],
    "sla_report_frequency": "weekly"
  }
}
```

#### Escalation Policy Configuration

Escalation policies determine how alerts are routed based on severity and elapsed time:

| Severity | Initial Response | First Escalation | Final Escalation |
|----------|-----------------|-------------------|-------------------|
| Critical | SOC analyst (immediate) | SOC lead (15 min) | Customer CTO + MSSP manager (30 min) |
| High | SOC analyst (15 min) | SOC lead (1 hour) | Customer security contact (4 hours) |
| Medium | SOC analyst (1 hour) | SOC lead (4 hours) | Weekly report inclusion |
| Low | Next business day | Weekly report inclusion | Monthly report inclusion |

---

## Chapter 26: MSSP Monitoring and Operations

This chapter covers day-to-day MSSP operational workflows: the multi-customer security dashboard, cross-customer alerting, SOC analyst triage workflows, customer-facing report generation, per-customer health monitoring, and the customer offboarding process.

### 26.1 Multi-Customer Security Dashboard

The MSSP Overview page (`/dashboard/mssp`) provides an aggregated view of security posture across all managed customer tenants. Access requires the `mssp` tier, enforced by the `TierGate` component.

#### Summary KPI Cards

The dashboard header displays four key performance indicators:

| KPI | Data Source | Description |
|-----|------------|-------------|
| **Child Tenants** | `GET /v1/mssp/tenants` | Total count of customer tenants under management |
| **Total Agents** | Aggregated `agent_count` per tenant | Sum of all registered agents across all customer tenants |
| **Active Anomalies** | Aggregated `anomaly_count` per tenant | Sum of unresolved anomaly detections |
| **Active Quarantines** | `GET /v1/mssp/enforcement/quarantine?limit=100` | Count of currently quarantined agents across all tenants |

Each KPI card is clickable. Clicking navigates to the relevant detail view (tenant list, agent inventory, anomaly dashboard, or quarantine queue).

Data refreshes automatically every 30 seconds via the `useWidgetData` hook.

#### Child Tenant Hierarchy Table

Below the KPIs, the tenant hierarchy table lists all child tenants with the following columns:

| Column | Description |
|--------|-------------|
| **Tenant** | Organization name and tenant UUID |
| **Tier** | Subscription tier badge (color-coded) |
| **Agents** | Count of registered agents |
| **Anomalies** | Count of active anomalies (highlighted in amber when > 0) |
| **Quarantined** | Count of quarantined agents (highlighted in red when > 0) |

Clicking a tenant row expands an inline detail panel showing:

- **Agent list** -- All agents registered to the tenant, with persona name, status (active/suspended/revoked), and creation date. Each agent row is clickable for further detail.
- **Active quarantines** -- List of quarantined SoulKeys with reason and quarantine timestamp.

#### Cross-Tenant Agent Drill-Down

From the expanded tenant panel, selecting an agent displays:

| Field | Description |
|-------|-------------|
| Soulkey ID | Full UUID of the agent's SoulKey |
| Status | Current status with color-coded badge |
| Tenant | Parent tenant name |
| Created | Agent registration date |
| Mode | Operating mode (if set) |
| Type | Agent type classification (if set) |

A "View in Agents" link navigates to the full agent detail page with the agent pre-selected.

### 26.2 Configure Cross-Customer Alerting

Cross-customer alerting aggregates security events from all managed tenants into a unified alert queue. Alerts are enriched with customer context for efficient triage.

#### Unified Alert Queue

The MSSP detection page (`/dashboard/mssp/detection`) aggregates alerts from all child tenants. Each alert includes:

| Field | Description |
|-------|-------------|
| Tenant context | Customer organization name and tenant ID |
| Event type | Detection category (anomaly, Sigma rule match, policy violation) |
| Severity | Critical, high, medium, low, or informational |
| Agent identity | SoulKey ID and persona of the triggering agent |
| Timestamp | UTC timestamp of the detection event |
| Status | New, acknowledged, investigating, resolved |

#### Priority Routing

Alert priority routing is determined by the combination of:

1. **Alert severity** -- Critical and high alerts are routed immediately.
2. **Customer SLA tier** -- Gold-tier customers' alerts are prioritized over silver and bronze.
3. **Event pattern** -- Correlated events (multiple detections from the same tenant within a window) receive elevated priority.

Configure notification channels per SLA tier:

| SLA Tier | Notification Channels | Response Target |
|----------|----------------------|-----------------|
| Gold | PagerDuty + Slack + Email | 15 minutes |
| Silver | Slack + Email | 1 hour |
| Bronze | Email | 4 hours |

#### Cross-Tenant Correlation

The MSSP operator can identify attacks that span multiple customer tenants. Common cross-tenant correlation patterns include:

- **Shared IP source** -- The same source IP triggers detections across multiple customer tenants.
- **Identical prompt injection payload** -- The same attack payload appears in requests to different customer environments.
- **Temporal clustering** -- Anomalous activity in multiple tenants within a narrow time window.

### 26.3 Manage SOC Analyst Workflows

#### Triage Queue Management

SOC analysts working MSSP accounts operate from the unified alert queue with the following workflow:

**Step 1: Initial triage**
- Filter alerts by severity, customer, or event type.
- Claim an alert by assigning it to your analyst identity.
- Assess whether the alert represents a true positive or false positive.

**Step 2: Investigation**
- Drill into the tenant's event timeline to correlate related events.
- Review the triggering agent's behavioral baseline for deviations.
- Check the agent's SoulKey status and recent capability token issuances.

**Step 3: Response**
- For true positives: execute the appropriate response playbook (quarantine, suspend, notify customer).
- For false positives: tune the detection rule or add an exclusion pattern.

**Step 4: Documentation**
- Record investigation findings and resolution steps.
- Update the alert status (acknowledged, investigating, resolved, false positive).
- If escalated: log the escalation with timestamps and recipient.

#### Assignment Rules

Configure automatic alert assignment based on:

| Criteria | Description |
|----------|-------------|
| Customer assignment | Assign specific analysts as primary contacts for specific customers |
| Skill-based routing | Route prompt injection alerts to analysts with gateway expertise |
| Load balancing | Round-robin assignment across available analysts |
| Time-based | Route to on-call analyst based on shift schedule |

### 26.4 Generate Customer-Facing Reports

MSSP operators can generate white-labeled security reports for customer delivery. Reports are available in PDF and CSV formats via the Portal's report export functionality.

#### Report Types

| Report Type | Content | Typical Cadence |
|-------------|---------|-----------------|
| **Executive Summary** | KPI overview, threat trends, SLA compliance | Monthly |
| **Security Posture** | Agent inventory, baseline status, detection efficacy | Monthly |
| **Incident Report** | Per-incident detail with timeline, impact, and remediation | Per incident |
| **Compliance Status** | Control mapping, evidence collection, gap analysis | Quarterly |
| **Usage Report** | Request volumes, token consumption, storage utilization | Monthly |

#### Usage Metrics for Reports

Per-tenant usage data is available via the metering API:

```
GET /v1/saas/usage?tenant_id=<uuid>&start=2026-03-01T00:00:00Z&end=2026-04-01T00:00:00Z
```

Response fields:

| Field | Description |
|-------|-------------|
| `requests` | Count of authentication requests (auth.evaluate, auth.identity, auth.issue, auth.revoke) |
| `tokens` | Aggregated token count from event context metadata |
| `anomalies` | Count of anomaly-type events |
| `storage_bytes` | Estimated storage consumption (512 bytes per audit record) |
| `total_events` | Total audit log entries |
| `period` | Start and end timestamps for the query range |

### 26.5 Monitor Service Health Per Customer

The SaaS Admin page (`/dashboard/mssp/saas`) provides per-tenant health monitoring with usage metrics and lifecycle management.

#### Per-Tenant Health View

The SaaS Admin table displays the following columns for each customer tenant:

| Column | Description |
|--------|-------------|
| **Tenant** | Organization name and UUID |
| **Status** | Active or suspended (color-coded badge) |
| **Active Keys** | Count of active SoulKeys |
| **Tokens** | Token consumption in the selected period |
| **Anomalies** | Anomaly count (amber highlight when > 0) |
| **Storage** | Storage consumption (formatted as B/KB/MB) |
| **Actions** | Suspend or reactivate buttons |

The time range selector allows switching between 1-day, 7-day, and 30-day views. Usage data refreshes every 60 seconds.

#### Tenant Detail Drill-Down

Clicking a tenant row navigates to the tenant detail page (`/dashboard/mssp/saas/<tenantId>`), which displays:

- **Tenant header** -- Name, UUID, tier badge, status badge, creation date.
- **Usage metric cards** -- Active keys, tokens, anomalies, and storage.
- **SoulKeys table** -- All SoulKeys for the tenant with name, status, ID prefix, and creation date. Clicking a key expands an inline detail panel showing persona, full SoulKey ID, status badge, creation date, last used date, and metadata.

#### Suspend and Reactivate

**Suspend a tenant:**

```
POST /v1/saas/tenants/<tenant_id>/suspend

{
  "reason": "Payment failure after 3 attempts",
  "suspended_by": "saas_operator"
}
```

Suspension performs the following:
1. Sets tenant status to `suspended`.
2. Appends an entry to `metadata_.suspension_history`.
3. Suspends all active SoulKeys for the tenant (sets `status = suspended`, `suspended_by = <operator>`).
4. Logs a `saas.tenant.suspended` audit event.

Suspended tenants receive HTTP 402 responses from the `FeatureGateMiddleware` on all API calls.

**Reactivate a tenant:**

```
POST /v1/saas/tenants/<tenant_id>/reactivate
```

Reactivation performs the following:
1. Sets tenant status back to `active`.
2. Logs a grace period entry in `metadata_.grace_period_log` for billing reconciliation.
3. Reinstates SoulKeys that were suspended by `saas_operator`. Keys suspended for other reasons (individual security suspensions) remain suspended.
4. Logs a `saas.tenant.reactivated` audit event.

### 26.6 Offboard a Customer Tenant

Customer offboarding is a controlled process that ensures data integrity, regulatory compliance, and complete access revocation.

#### Offboarding Checklist

| Step | Action | Verification |
|------|--------|-------------|
| 1 | **Notify customer** | Send offboarding notification with timeline and data export instructions |
| 2 | **Export customer data** | Generate data export package including audit logs, policies, and agent inventory |
| 3 | **Apply retention hold** | Set `metadata_.data_retention_until` to the required retention date per contract and regulation |
| 4 | **Suspend tenant** | Suspend the tenant via `POST /v1/saas/tenants/<id>/suspend` |
| 5 | **Revoke all SoulKeys** | Revoke (not just suspend) all SoulKeys to prevent future authentication |
| 6 | **Remove partner link** | Clear the `parent_tenant_id` foreign key if the customer is transitioning to self-management |
| 7 | **Archive audit logs** | Export audit logs to long-term storage before the retention period expires |
| 8 | **Purge DEK** | After the retention period, purge the tenant's DEK to render encrypted data unrecoverable |

> **Caution:** Purging the Data Encryption Key is an irreversible operation. All data encrypted under that DEK becomes permanently unreadable. Only perform this step after the contractual and regulatory retention period has expired.

#### Data Retention Requirements

| Regulation | Minimum Retention | Notes |
|------------|-------------------|-------|
| SOC 2 | 1 year | Audit logs and access records |
| GDPR | Per data processing agreement | Right to erasure applies; balance with other obligations |
| PCI DSS | 1 year (3 months immediate access) | Audit trail for cardholder data access |
| HIPAA | 6 years | Security incident records |

---

# Part IX: Administration

---

## Chapter 27: Billing and Subscription Management

This chapter covers the Tiresias billing system, including the subscription tier model, license JWT structure and validation, Stripe integration for payment processing, payment failure grace periods, and feature gating enforcement.

### 27.1 Subscription Tier Overview

Tiresias uses a six-tier subscription model. Tier definitions are the canonical source of truth in `src/tier.py`.

#### Tier Comparison Matrix

| Capability | Community | Starter | Pro | Enterprise | MSSP | SaaS |
|-----------|-----------|---------|-----|-----------|------|------|
| Agent registration | 3 agents | 10 agents | Unlimited | Unlimited | Unlimited | Unlimited |
| SoulKey management | Basic | Basic | Full | Full + rotation policies | Full + cross-tenant | Full |
| Anomaly detection | Rate spikes only | 4 detectors | All 8 detectors | All + custom | All + cross-tenant | All |
| Sigma rules | None | 5 rules | Unlimited | Unlimited + Git sync | Unlimited + push | Unlimited |
| Automated response | None | Email only | Full playbooks | Full + approval chains | Full + cross-tenant | Full |
| SIEM integration | None | Webhook only | Splunk, Elastic, Syslog | All + CEF formatting | All + multi-destination | All |
| SSO/OIDC | None | None | None | SAML + OIDC | SAML + OIDC | SAML + OIDC |
| RBAC | None | None | Basic roles | Custom roles | Custom + delegation | Full |
| Compliance reporting | None | None | None | SOC 2, ISO 27001, GDPR | All + white-label | All |
| Multi-tenancy | None | None | None | Single tenant | Multi-tenant | Platform |
| Customer-held encryption | None | None | None | BYOK | BYOK per customer | BYOK |
| Support | Community | Email | Priority email | Dedicated + phone | Dedicated + SLA | Platform support |

#### Tier Rank Function

The `tier_rank()` function returns a numeric rank for a tier string. Higher rank means more capability:

```python
def tier_rank(tier: str) -> int:
    """Return numeric rank for a tier string. Unknown tiers rank as 0 (community)."""
    try:
        return TIER_ORDER.index(tier)
    except ValueError:
        return 0
```

The `effective_tier()` function computes the minimum of install-level and tenant subscription tiers:

```python
def effective_tier(install_tier: str, tenant_tier: str) -> str:
    return TIER_ORDER[min(tier_rank(install_tier), tier_rank(tenant_tier))]
```

This ensures that a tenant cannot exceed the capabilities of the platform's install-level license, regardless of their subscription tier.

### 27.2 Configure Stripe Integration

Tiresias integrates with Stripe for subscription billing, customer portal access, and webhook-driven tier updates.

#### Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `STRIPE_SECRET_KEY` | Stripe API secret key (starts with `sk_live_` or `sk_test_`) | Yes |
| `STRIPE_WEBHOOK_SECRET` | Webhook endpoint signing secret (starts with `whsec_`) | Production: Yes |
| `STRIPE_PRICE_STARTER_MONTHLY` | Stripe Price ID for Starter monthly plan | No (uses hardcoded fallback) |
| `STRIPE_PRICE_STARTER_ANNUAL` | Stripe Price ID for Starter annual plan | No |
| `STRIPE_PRICE_PRO_MONTHLY` | Stripe Price ID for Professional monthly plan | No |
| `STRIPE_PRICE_PRO_ANNUAL` | Stripe Price ID for Professional annual plan | No |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY` | Stripe Price ID for Enterprise monthly plan | No |
| `STRIPE_PRICE_ENTERPRISE_ANNUAL` | Stripe Price ID for Enterprise annual plan | No |
| `STRIPE_PRICE_MSSP_MONTHLY` | Stripe Price ID for MSSP monthly plan | No |
| `STRIPE_PRICE_MSSP_ANNUAL` | Stripe Price ID for MSSP annual plan | No |

#### Stripe Customer Portal

The Stripe Customer Portal allows customers to self-manage their subscriptions. To create a portal session:

```
POST /v1/billing/portal-session
X-Tenant-ID: <tenant_id>
```

**Prerequisites:**
- The tenant must have a `stripe_customer_id` in its metadata.
- The Stripe Customer Portal must be configured in the Stripe Dashboard (Settings > Billing > Customer portal).

The endpoint returns a session URL. Redirect the customer to this URL in a new browser tab. The default return URL is `https://tiresias.network/dashboard/settings?tab=billing`.

#### Webhook Configuration

Register the Stripe webhook endpoint in your Stripe Dashboard:

**Webhook URL:** `https://<your-domain>/v1/saas/billing/webhook`

**Events to subscribe:**
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

#### Webhook Signature Verification

Tiresias verifies webhook signatures using HMAC-SHA256 per the Stripe specification:

1. Extract the `t=` timestamp and `v1=` signature values from the `Stripe-Signature` header.
2. Build the signed payload: `{timestamp}.{raw_body}`.
3. Compute `HMAC-SHA256(STRIPE_WEBHOOK_SECRET, signed_payload)`.
4. Compare against each `v1` value using constant-time comparison.
5. Reject events older than 5 minutes (replay protection).

If `STRIPE_WEBHOOK_SECRET` is not configured, signature verification is skipped with a warning log. This graceful degradation is intended for development environments only.

> **Warning:** Always configure `STRIPE_WEBHOOK_SECRET` in production. Without signature verification, an attacker could forge webhook events to modify tenant tiers.

### 27.3 Manage Customer Subscriptions

#### Self-Service Tier Upgrade

Customers can upgrade their subscription tier via:

```
POST /v1/billing/upgrade
X-Tenant-ID: <tenant_id>
Content-Type: application/json

{
  "new_tier": "enterprise",
  "stripe_price_id": "price_1TDMT2BkXMYmrc2Lhf1whQpi"
}
```

The upgrade process:
1. Validates the target tier (must be in `VALID_TIERS` minus `community`).
2. Fetches the current Stripe subscription from the tenant's `stripe_subscription_id` metadata.
3. Updates the Stripe subscription item to the new price ID.
4. Sets `metadata[tiresias_tier]` on the Stripe subscription.
5. Updates the tenant's `tier` column in the database.

If the Stripe update fails (e.g., payment method issue), the DB tier is still updated and an admin can reconcile Stripe manually. A warning is logged.

#### Webhook-Driven Tier Updates

The following Stripe events are processed:

| Event | Action |
|-------|--------|
| `customer.subscription.created` | Resolve tier from plan; create tenant if none exists (auto-provision) or update existing tenant's tier |
| `customer.subscription.updated` | Resolve new tier from plan; update tenant tier; emit `tier_changed` audit event |
| `customer.subscription.deleted` | Downgrade tenant to `community` tier; emit `tier_changed` audit event |
| `invoice.paid` | Clear payment failure flags; send payment receipt email |
| `invoice.payment_failed` | Trigger grace period; escalate to suspension after 3 failed attempts |

#### Tenant Lookup for Webhook Events

The webhook handler resolves the tenant using this priority:

1. `metadata.tenant_id` on the Stripe subscription object (exact UUID lookup).
2. `stripe_customer_id` column on the `_soul_tenants` table (indexed lookup).
3. `metadata_->>'stripe_customer_id'` JSONB query (fallback for pre-migration tenants).

### 27.4 View Billing History and Invoices

#### Grace Period Status

The dashboard displays a persistent red warning banner when a tenant is in a payment failure state. The grace period status is retrieved via:

```
GET /v1/billing/grace-status
X-Tenant-ID: <tenant_id>
```

Response:

```json
{
  "tenant_id": "a1b2c3d4-...",
  "payment_failed_at": "2026-04-01T10:00:00Z",
  "grace_deadline": "2026-04-04T10:00:00Z",
  "days_remaining": 2,
  "status": "payment_failed"
}
```

When `status` is `active`, the `payment_failed_at`, `grace_deadline`, and `days_remaining` fields are `null`, indicating no payment issues.

#### Payment Failure Lifecycle

| Phase | Duration | Tenant Status | Access |
|-------|----------|---------------|--------|
| **Active** | Normal operation | `active` | Full access per tier |
| **Payment failed** | 0-3 days after failure | `payment_failed` | Full access (grace period) |
| **Grace expired** | After 3 days | `active` (tier = `community`) | Downgraded to community features |
| **Suspended** | After 3 failed payment attempts | `suspended` | HTTP 402 on all API calls |

When `invoice.paid` fires after a payment failure, the `resolve_payment()` function clears the `payment_failed_at` and `grace_deadline` metadata fields and restores the tenant to `active` status.

#### Automated Grace Period Sweep

The `run_grace_period_check()` function runs as a background task or cron job. It:

1. Queries all tenants with `status = payment_failed`.
2. For each tenant, compares the current time against `metadata_.grace_deadline`.
3. If the deadline has passed, downgrades the tenant to `community` tier and sets status back to `active`.

### 27.5 Configure Usage-Based Billing

#### License JWT Structure

Tiresias licenses are HMAC-SHA256 signed JWTs with the following claims:

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | string | Tenant UUID or `"install"` for platform-level licenses |
| `tier` | string | License tier (`community`, `starter`, `pro`, `enterprise`, `mssp`, `saas`) |
| `features` | list[string] | Feature flags included in the license |
| `is_nfr` | boolean | Not-for-resale / demo license flag |
| `partner_id` | string (optional) | Partner identifier for partner-issued licenses |
| `iat` | integer | Issued-at timestamp (Unix epoch) |
| `exp` | integer | Expiry timestamp (Unix epoch) |

#### License Issuance

Licenses are issued via the license issuer:

```python
result = await issue_license(
    db,
    tier="enterprise",
    tenant_id=uuid.UUID("a1b2c3d4-..."),
    features=["sso", "byok", "compliance"],
    is_nfr=False,
    partner_id="partner-123",
    validity_days=365,
    issued_by="admin",
    grace_hours=72.0,
)
```

The issuer:
1. Validates the tier against `VALID_TIERS`.
2. Builds JWT claims and signs with `TIRESIAS_LICENSE_SECRET` (HMAC-SHA256).
3. Computes SHA-256 hash of the JWT for dedup/lookup.
4. Persists the license record to `_soul_licenses` with `status = active`.

The `grace_hours` parameter (default: 72 hours) defines how long the license remains operational after expiry.

#### License Validation States

The `LicenseValidator` produces one of four states:

| Status | Condition | Platform Behavior |
|--------|-----------|-------------------|
| `VALID` | Current time < `exp` | Full operation |
| `GRACE` | `exp` < current time < `exp + grace_hours` | Degraded operation with warning logs every 5 minutes |
| `INVALID` | Current time > `exp + grace_hours`, or signature verification fails | `SystemExit(2)` if `license_required = true` |
| `MISSING` | No license key configured | `SystemExit(2)` if `license_required = true` |

#### License Tier Integrity Watchdog

The license watchdog runs as a background task every 5 minutes (configurable via `interval_seconds`). It performs three checks:

| Check | What It Detects | Alert Type |
|-------|-----------------|------------|
| **Environment integrity** | `TIRESIAS_LICENSE_KEY` or `TIRESIAS_TIER` env vars modified since startup | `env_var_changed` |
| **Runtime tier drift** | Running license tier differs from startup tier | `runtime_tier_drift` |
| **DB tier integrity** | Tenant DB tier does not match their active license tier | `db_tier_mismatch` |

Violations are emitted as `license_integrity_violation` audit events, which can be detected by SoulWatch Sigma rules.

#### Feature Gating

Features are gated based on the effective tier. The `TierGate` component in the Portal checks `tierMeets(requiredTier)` before rendering protected content. When the check fails, the user sees an upgrade prompt.

In the API, the `FeatureGateMiddleware` intercepts requests to tier-protected endpoints and returns HTTP 403 with a message indicating the required tier.

#### License Configuration Settings

| Setting | Environment Variable | Default | Description |
|---------|---------------------|---------|-------------|
| `license_key` | `TIRESIAS_LICENSE_KEY` | `""` | Signed license JWT |
| `license_grace_hours` | `SOULAUTH_LICENSE_GRACE_HOURS` | `72.0` | Hours to allow degraded operation after license expiry |
| `license_required` | `SOULAUTH_LICENSE_REQUIRED` | `true` | If true, missing/invalid license causes SystemExit(2) |
| `tiresias_tier` | `TIRESIAS_TIER` | `""` | Override license tier at deploy time for SKU selection |

---

## Chapter 28: Backup and Disaster Recovery

This chapter covers backup strategy, automated backup configuration, restore procedures, disaster recovery planning, and DR testing for Tiresias deployments.

### 28.1 Backup Strategy

A complete Tiresias backup includes four categories of data:

| Category | Contents | Criticality | Backup Method |
|----------|----------|-------------|---------------|
| **Database** | PostgreSQL: tenants, SoulKeys, audit logs, policies, licenses, partner records | Critical | `pg_dump` with `--format=custom` |
| **Configuration** | Environment variables, Docker Compose files, Kubernetes manifests | Critical | Version control (Git) |
| **Policies** | Authorization YAML policies, Sigma detection rules, response playbooks | High | Git repository + `PolicyCache` table |
| **Secrets** | JWT signing keys, TIRESIAS_LICENSE_SECRET, STRIPE_SECRET_KEY, database credentials, TLS certificates | Critical | Secret manager (GCP Secret Manager, HashiCorp Vault) |

> **Important:** Database backups contain sensitive data including SHA-512 hashed SoulKeys, encrypted DEKs, and audit logs. Always encrypt backups at rest and in transit.

#### Recovery Point Objective (RPO) and Recovery Time Objective (RTO) Targets

| Deployment Model | RPO Target | RTO Target | Backup Frequency |
|-----------------|------------|------------|-------------------|
| SaaS (GCP Cloud Run) | 1 hour | 15 minutes | Continuous WAL archival + daily full |
| Docker Compose (self-hosted) | 4 hours | 1 hour | Every 4 hours + daily full |
| Kubernetes | 1 hour | 30 minutes | Continuous WAL archival + daily full |
| Air-gapped | 24 hours | 4 hours | Daily full backup |

### 28.2 Configure Automated Backups

#### PostgreSQL Database Backup

**Full backup (daily):**

```bash
#!/bin/bash
# tiresias-backup.sh -- Daily full database backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/tiresias"
BACKUP_FILE="${BACKUP_DIR}/tiresias_full_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

pg_dump \
  --host="${PGHOST}" \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  --dbname="${PGDATABASE}" \
  --format=custom \
  --compress=9 \
  --file="${BACKUP_FILE}"

# Encrypt backup
gpg --symmetric --cipher-algo AES256 \
  --passphrase-file /etc/tiresias/backup-key \
  --output "${BACKUP_FILE}.gpg" \
  "${BACKUP_FILE}"

# Remove unencrypted backup
rm -f "${BACKUP_FILE}"

# Upload to offsite storage
gsutil cp "${BACKUP_FILE}.gpg" \
  "gs://tiresias-backups/daily/${TIMESTAMP}/"

# Retain 30 days of daily backups
find "${BACKUP_DIR}" -name "*.gpg" -mtime +30 -delete
```

**Continuous WAL archival (for point-in-time recovery):**

Configure PostgreSQL `postgresql.conf`:

```
wal_level = replica
archive_mode = on
archive_command = 'gsutil cp %p gs://tiresias-wal-archive/%f'
archive_timeout = 300
```

#### Configuration Backup

Store all configuration in a Git repository:

```bash
# Export current environment (redact secrets)
env | grep -E '^(SOULAUTH_|TIRESIAS_|STRIPE_PRICE_)' | \
  sed 's/=.*SECRET.*/=REDACTED/' | \
  sed 's/=.*KEY.*/=REDACTED/' | \
  sort > config/env-export.txt

# Commit configuration changes
git add config/
git commit -m "config: backup $(date +%Y-%m-%d)"
```

#### Secret Backup

For secrets stored in GCP Secret Manager:

```bash
# List all Tiresias secrets
gcloud secrets list --filter="labels.app=tiresias" --format="value(name)"

# Export secret versions (for DR site)
for SECRET in $(gcloud secrets list --filter="labels.app=tiresias" --format="value(name)"); do
  gcloud secrets versions access latest --secret="${SECRET}" > \
    "/secure/backup/secrets/${SECRET}.txt"
done

# Encrypt the secrets directory
tar czf /secure/backup/secrets.tar.gz /secure/backup/secrets/
gpg --symmetric --cipher-algo AES256 \
  --output /secure/backup/secrets.tar.gz.gpg \
  /secure/backup/secrets.tar.gz
rm -rf /secure/backup/secrets/ /secure/backup/secrets.tar.gz
```

#### Backup Verification

After every backup, verify integrity:

```bash
# Verify database backup
pg_restore --list "${BACKUP_FILE}" > /dev/null 2>&1 && echo "PASS" || echo "FAIL"

# Verify encrypted backup
gpg --decrypt --output /dev/null "${BACKUP_FILE}.gpg" && echo "PASS" || echo "FAIL"
```

### 28.3 Restore from Backup

#### Database Restore

**Full restore (from pg_dump custom format):**

```bash
# Stop Tiresias services
docker compose stop soulauth soulwatch soulgate portal

# Create fresh database
psql -h "${PGHOST}" -U "${PGUSER}" -c "DROP DATABASE IF EXISTS tiresias_restore;"
psql -h "${PGHOST}" -U "${PGUSER}" -c "CREATE DATABASE tiresias_restore;"

# Decrypt and restore
gpg --decrypt "${BACKUP_FILE}.gpg" > "${BACKUP_FILE}"

pg_restore \
  --host="${PGHOST}" \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  --dbname="tiresias_restore" \
  --no-owner \
  --clean \
  --if-exists \
  "${BACKUP_FILE}"

# Rename databases
psql -h "${PGHOST}" -U "${PGUSER}" -c "
  ALTER DATABASE tiresias RENAME TO tiresias_old;
  ALTER DATABASE tiresias_restore RENAME TO tiresias;
"

# Run pending migrations
alembic upgrade head

# Restart services
docker compose up -d soulauth soulwatch soulgate portal
```

**Point-in-time recovery:**

```bash
# Stop PostgreSQL
pg_ctl stop -D /var/lib/postgresql/data

# Restore base backup
pg_restore --clean --target-action=promote \
  --recovery-target-time="2026-04-02 14:30:00 UTC" \
  /var/backups/tiresias/latest.dump

# Create recovery.conf
cat > /var/lib/postgresql/data/recovery.conf <<EOF
restore_command = 'gsutil cp gs://tiresias-wal-archive/%f %p'
recovery_target_time = '2026-04-02 14:30:00 UTC'
recovery_target_action = 'promote'
EOF

# Start PostgreSQL in recovery mode
pg_ctl start -D /var/lib/postgresql/data
```

#### Configuration Restore

```bash
# Restore from Git
git clone git@github.com:org/tiresias-config.git
cp tiresias-config/.env /opt/tiresias/.env
cp tiresias-config/docker-compose.yml /opt/tiresias/docker-compose.yml
```

#### Secret Restore

```bash
# Restore secrets to GCP Secret Manager
for SECRET_FILE in /secure/backup/secrets/*.txt; do
  SECRET_NAME=$(basename "${SECRET_FILE}" .txt)
  gcloud secrets versions add "${SECRET_NAME}" --data-file="${SECRET_FILE}"
done
```

### 28.4 Disaster Recovery Procedures

#### DR Failover Steps

**Phase 1: Assessment (0-5 minutes)**
1. Confirm the outage is genuine (not a monitoring false positive).
2. Determine the blast radius: which services are affected.
3. Notify stakeholders via the incident communication channel.

**Phase 2: Failover (5-30 minutes)**
1. Activate the DR site database replica.
2. Update DNS to point to the DR site.
3. Restore secrets from the encrypted backup to the DR site's secret manager.
4. Deploy Tiresias services to the DR site using the latest container images.
5. Run `alembic upgrade head` to ensure schema consistency.

**Phase 3: Validation (30-60 minutes)**
1. Verify all health check endpoints return 200.
2. Issue a test SoulKey and verify authentication.
3. Verify Sigma rule evaluation fires on a test event.
4. Confirm the Portal loads and displays data.
5. Verify Stripe webhooks are delivered to the DR site endpoint.

**Phase 4: Customer Communication**
1. Update the status page.
2. Notify MSSP partners via their configured notification channels.
3. Provide an estimated restoration timeline.

#### Data Consistency Verification After Recovery

After failover, verify data consistency:

```bash
# Count tenants
psql -c "SELECT count(*) FROM _soul_tenants;"

# Verify audit log chain integrity
psql -c "
  SELECT count(*) AS broken_chain
  FROM _audit_logs a
  LEFT JOIN _audit_logs b ON a.prev_hash = b.current_hash
  WHERE a.prev_hash IS NOT NULL AND b.id IS NULL;
"

# Verify license status
psql -c "SELECT tier, status, count(*) FROM _soul_licenses GROUP BY tier, status;"
```

### 28.5 Test Your DR Plan

#### Tabletop Exercises

Conduct quarterly tabletop exercises covering these scenarios:

| Scenario | Key Questions |
|----------|---------------|
| Database corruption | Can you restore from backup within RTO? Who has access to backup encryption keys? |
| Cloud region outage | Can you failover to the DR site? Is the DR database replica current? |
| Secret compromise | Can you rotate all secrets within 1 hour? What is the blast radius? |
| Ransomware | Are backups isolated from the primary environment? Can you restore without paying? |

#### Partial Failover Test

Monthly, test a partial failover:

1. Restore the latest database backup to a test environment.
2. Deploy Tiresias services against the restored database.
3. Run the full smoke test suite.
4. Verify tenant count, SoulKey counts, and audit log integrity.
5. Document any discrepancies and update the DR runbook.

---

## Chapter 29: Platform Maintenance

This chapter covers routine maintenance operations: system health monitoring, rolling updates, database migrations, secret rotation, maintenance windows, and performance tuning.

### 29.1 Monitor System Health

#### Health Check Endpoints

Each Tiresias service exposes a health check endpoint:

| Service | Endpoint | Healthy Response |
|---------|----------|-----------------|
| SoulAuth | `GET /healthz` | `{"status": "ok", "version": "3.0.0"}` |
| SoulWatch | `GET /healthz` | `{"status": "ok", "detectors": 8}` |
| SoulGate | `GET /healthz` | `{"status": "ok", "upstreams": 3}` |
| Portal | `GET /api/health` | `{"status": "ok"}` |

#### Dependency Health Checks

The health endpoint verifies critical dependencies:

| Dependency | Check | Failure Behavior |
|------------|-------|-----------------|
| PostgreSQL | Connection pool ping | Service returns 503 |
| Redis (if configured) | PING command | Degraded: falls back to in-process cache |
| Stripe API | Not checked at health time | Webhook processing fails; logged but service stays healthy |
| SIEM destinations | Async connectivity check | Degraded: events buffered in memory |

#### Prometheus Metrics

Key metrics to monitor:

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `soulauth_request_duration_seconds` | Histogram | Request latency by endpoint | p99 > 2s |
| `soulauth_active_soulkeys` | Gauge | Count of active SoulKeys | Sudden drop > 10% |
| `soulwatch_events_processed_total` | Counter | Events evaluated by detection engine | Rate drop to 0 for > 5 min |
| `soulwatch_anomalies_detected_total` | Counter | Anomaly detections by type | Spike > 3x baseline |
| `soulgate_circuit_breaker_state` | Gauge | Circuit breaker state (0=closed, 1=open, 2=half-open) | State = 1 for > 10 min |
| `billing_grace_period_tenants` | Gauge | Tenants in payment failure grace period | Any value > 0 |
| `license_days_remaining` | Gauge | Days until license expiry | < 30 days |

### 29.2 Perform Rolling Updates

#### Zero-Downtime Upgrade Procedure

**Step 1: Pre-upgrade validation**

```bash
# Verify current service health
curl -s http://localhost:8000/healthz | jq .

# Check database migration status
alembic current

# Verify no active incidents
psql -c "SELECT count(*) FROM _audit_logs WHERE event_type = 'anomaly%' AND timestamp > now() - interval '1 hour';"
```

**Step 2: Build new container images**

```bash
# Build with required NEXT_PUBLIC_* build args for Portal
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.tiresias.network \
  --build-arg NEXT_PUBLIC_PORTAL_URL=https://tiresias.network \
  -t tiresias-portal:v3.0.1 \
  -f portal/Dockerfile .

docker build -t tiresias-soulauth:v3.0.1 -f Dockerfile .
```

> **Critical:** Portal Docker builds require `--build-arg` for `NEXT_PUBLIC_*` variables. These are baked into the static build at compile time and cannot be changed at runtime. Always run `smoke-test.sh` after rebuild.

**Step 3: Rolling deployment**

For Docker Compose:
```bash
# Update one service at a time
docker compose up -d --no-deps soulauth
# Wait for health check
until curl -sf http://localhost:8000/healthz; do sleep 2; done

docker compose up -d --no-deps soulwatch
docker compose up -d --no-deps soulgate
docker compose up -d --no-deps portal
```

For Kubernetes:
```bash
kubectl set image deployment/soulauth soulauth=tiresias-soulauth:v3.0.1
kubectl rollout status deployment/soulauth --timeout=300s

kubectl set image deployment/portal portal=tiresias-portal:v3.0.1
kubectl rollout status deployment/portal --timeout=300s
```

**Step 4: Post-upgrade validation**

```bash
# Verify versions
curl -s http://localhost:8000/healthz | jq .version

# Run smoke test
./scripts/smoke-test.sh

# Verify audit log continuity
psql -c "SELECT event_type, count(*) FROM _audit_logs WHERE timestamp > now() - interval '5 minutes' GROUP BY event_type;"
```

### 29.3 Manage Database Migrations

#### Migration Framework

Tiresias uses Alembic for database schema versioning. Migration files are located in `alembic/versions/`.

#### Running Migrations

```bash
# Check current migration state
alembic current

# View pending migrations
alembic history --verbose

# Apply all pending migrations
alembic upgrade head

# Apply a specific migration
alembic upgrade <revision_id>
```

#### Rollback Procedure

```bash
# Rollback one migration
alembic downgrade -1

# Rollback to a specific revision
alembic downgrade <revision_id>

# Rollback all migrations (destructive -- development only)
alembic downgrade base
```

> **Caution:** Database migrations that drop columns or tables are irreversible. Always take a full backup before running migrations in production.

### 29.4 Rotate Platform Secrets

#### Secret Rotation Schedule

| Secret | Rotation Frequency | Method |
|--------|-------------------|--------|
| JWT signing keys (ES256) | Annually or on compromise | Generate new key pair, set `SOULAUTH_JWT_KID` to new key ID, deploy with both keys for grace period |
| TIRESIAS_LICENSE_SECRET | Annually | Reissue all active licenses with new secret |
| STRIPE_SECRET_KEY | Per Stripe recommendation | Roll in Stripe Dashboard, update env var, restart services |
| STRIPE_WEBHOOK_SECRET | When endpoint URL changes | Roll in Stripe Dashboard, update env var |
| Database credentials | Quarterly | Create new role, update connection string, drop old role |
| TLS certificates | Before expiry (90-day cadence for Let's Encrypt) | Automated via cert-manager or ACME client |
| OIDC secret key | Annually | Generate new Fernet key, re-encrypt IdP client secrets |

#### JWT Key Rotation Procedure

JWT key rotation uses the `kid` (Key ID) header claim to identify which signing key version issued a token:

1. Generate a new ES256 key pair:
   ```bash
   openssl ecparam -name prime256v1 -genkey -noout -out private-new.pem
   openssl ec -in private-new.pem -pubout -out public-new.pem
   ```

2. Set the new key ID:
   ```
   SOULAUTH_JWT_KID=soulauth-2026-04
   ```

3. Deploy with both old and new public keys available for verification.

4. After `max_token_ttl` seconds (default: 900 seconds / 15 minutes), all tokens signed with the old key have expired. Remove the old public key.

### 29.5 Configure Maintenance Windows

#### Pre-Maintenance Checklist

| Step | Action |
|------|--------|
| 1 | Announce maintenance window to all MSSP partners and enterprise customers (minimum 72 hours notice) |
| 2 | Confirm backup is current and verified |
| 3 | Document the change (what, why, rollback plan) |
| 4 | Notify the on-call team |
| 5 | Set the platform status page to "Scheduled Maintenance" |

#### During Maintenance

For services that must be taken offline:
1. Set SoulGate to maintenance mode (returns HTTP 503 with `Retry-After` header).
2. Drain active connections (wait for in-flight requests to complete).
3. Perform the maintenance operation.
4. Run health checks and smoke tests.
5. Restore normal operation.

#### Post-Maintenance

1. Verify all services are healthy.
2. Confirm audit log continuity (no gaps in the hash chain).
3. Update the status page.
4. Send completion notification.

### 29.6 Performance Tuning

#### Database Connection Pooling

| Setting | Environment Variable | Default | Recommendation |
|---------|---------------------|---------|----------------|
| Pool size | `SOULAUTH_DB_POOL_SIZE` | 10 | 2x active tenants, minimum 10 |
| Max overflow | `SOULAUTH_DB_MAX_OVERFLOW` | 20 | 2x pool size |
| Pool timeout | `SOULAUTH_DB_POOL_TIMEOUT` | 30 | 30-60 seconds |

#### Token TTL Tuning

| Setting | Environment Variable | Default | Range |
|---------|---------------------|---------|-------|
| Default token TTL | `SOULAUTH_DEFAULT_TOKEN_TTL` | 300s | 60-900s |
| Maximum token TTL | `SOULAUTH_MAX_TOKEN_TTL` | 900s | 300-3600s |

Shorter TTLs improve security (reduced window for token theft) but increase authentication load. For high-throughput deployments, consider 600-second TTL with token refresh.

#### SIEM Buffer Tuning

| Setting | Environment Variable | Default | Description |
|---------|---------------------|---------|-------------|
| Buffer size | `SOULAUTH_SIEM_BUFFER_SIZE` | 100 | Events buffered before flush |
| Flush interval | `SOULAUTH_SIEM_FLUSH_INTERVAL` | 30s | Maximum time before buffer flush |

For high-volume deployments, increase `SIEM_BUFFER_SIZE` to 500 and decrease `SIEM_FLUSH_INTERVAL` to 10 seconds.

#### Policy Cache TTL

| Setting | Environment Variable | Default | Description |
|---------|---------------------|---------|-------------|
| Cache TTL | `SOULAUTH_POLICY_CACHE_TTL` | 300s | Time before re-fetching resolved policies |

Increasing this value reduces database load but delays policy change propagation.

---

## Chapter 30: Troubleshooting

This chapter provides systematic troubleshooting procedures for common Tiresias operational issues, including authentication failures, detection problems, gateway errors, Portal issues, SIEM integration failures, and diagnostic bundle generation.

### 30.1 Troubleshooting Methodology

Use the following systematic approach when diagnosing Tiresias issues:

**Step 1: Identify symptoms**
- What is the user-visible behavior?
- When did the issue start?
- Is the issue intermittent or persistent?
- What is the blast radius (one tenant, all tenants, one service)?

**Step 2: Check service health**
```bash
# Check all service health endpoints
for svc in soulauth:8000 soulwatch:8001 soulgate:8002 portal:3000; do
  echo -n "${svc}: "
  curl -sf "http://${svc}/healthz" && echo "OK" || echo "FAIL"
done
```

**Step 3: Review logs**
```bash
# Tail structured logs for errors
docker compose logs --tail=100 soulauth | jq 'select(.level == "error")'

# Search for specific event types
docker compose logs soulauth | jq 'select(.event == "auth.evaluate.denied")'
```

**Step 4: Check metrics**
- Review Prometheus/Grafana dashboards for anomalies.
- Check request latency, error rates, and queue depths.

**Step 5: Correlate events**
- Use the audit log to trace the sequence of events.
- Cross-reference timestamps across services.

**Step 6: Escalate if needed**
- Document findings and attempted remediation.
- Collect a diagnostic bundle (see Section 30.7).
- Open a support ticket with the diagnostic bundle attached.

### 30.2 Troubleshoot Authentication Failures

#### SoulKey Authentication Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `401 Unauthorized: Invalid SoulKey` | SoulKey hash does not match any active key | Verify the key was not revoked; issue a new key if needed |
| `401 Unauthorized: SoulKey suspended` | Key was suspended by admin or automated response | Check suspension reason in audit log; reactivate if appropriate |
| `401 Unauthorized: SoulKey revoked` | Key was permanently revoked | Issue a new SoulKey; revocation is irreversible |
| `403 Forbidden: Tenant suspended` | Tenant status is `suspended` | Check billing status; reactivate tenant if payment resolved |
| `402 Payment Required` | Tenant status is `suspended` due to billing | Resolve payment issue; reactivate via `/v1/saas/tenants/{id}/reactivate` |

#### Token Validation Failures

| Error | Cause | Resolution |
|-------|-------|------------|
| `401: Token expired` | Capability token TTL exceeded | Client must request a new token; check clock synchronization |
| `401: Invalid token signature` | Token signed with unknown key | Check JWT key rotation status; ensure public key is available |
| `401: Token claims invalid` | Missing or malformed claims | Verify token was issued by Tiresias, not forged |

#### Clock Synchronization Issues

JWT validation is sensitive to clock skew. If token validation fails intermittently:

```bash
# Check system clock
date -u

# Check NTP synchronization
timedatectl status

# Force NTP sync
sudo systemctl restart systemd-timesyncd
```

Ensure all services and clients are synchronized to within 30 seconds of UTC.

### 30.3 Troubleshoot Detection Issues

#### Rules Not Firing

| Symptom | Diagnostic | Resolution |
|---------|-----------|------------|
| Sigma rule never triggers | Check rule YAML syntax with `tiresias-cli rule validate` | Fix YAML syntax errors |
| Rule matches in test but not production | Verify field names match actual event schema | Update rule field mappings |
| Rule fires in one tenant but not another | Check tenant-scoped rule enablement | Enable rule for the target tenant |
| All rules stopped firing | Check detection engine health | Restart SoulWatch; verify `detection_enabled = true` |

#### False Positives

Reduce false positives using these approaches:

1. **Increase detection threshold** -- Raise the anomaly score threshold for the triggering rule.
2. **Add exclusion patterns** -- Whitelist known maintenance windows, batch jobs, or scheduled tasks.
3. **Tune baseline parameters** -- Extend the baseline learning window or increase the minimum sample size.
4. **Suppress by agent** -- Configure per-agent sensitivity overrides for agents with legitimately variable behavior.

#### Baseline Drift

If behavioral baselines become stale after a deployment or behavior change:

```
POST /v1/soulwatch/baselines/<agent_id>/reset

{
  "reason": "Post-deployment behavior change",
  "observation_window_hours": 48
}
```

### 30.4 Troubleshoot Gateway Errors

#### HTTP Error Codes

| Error Code | SoulGate Context | Diagnostic Steps |
|------------|-----------------|-----------------|
| **401** | SoulKey or capability token invalid | Check key status, token expiry, clock sync |
| **403** | Authorization policy denied the request | Inspect policy evaluation logs; use dry-run mode to test |
| **429** | Rate limit exceeded | Check per-agent and per-route rate limit configuration |
| **502** | Upstream service unreachable | Verify upstream service health; check network connectivity |
| **503** | Circuit breaker open or service in maintenance | Check circuit breaker state; wait for half-open recovery |

#### Rate Limit Debugging

```bash
# Check current rate limit headers in response
curl -v -H "Authorization: Bearer <soulkey>" \
  https://gateway.tiresias.network/v1/resource

# Look for these headers:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 0
# X-RateLimit-Reset: 1711036800
# Retry-After: 60
```

#### Circuit Breaker State Inspection

```bash
# Query circuit breaker state
curl -s http://soulgate:8002/v1/circuit-breakers | jq .

# Expected output:
# {
#   "upstream_name": {
#     "state": "closed",      // or "open" or "half_open"
#     "failure_count": 2,
#     "success_count": 148,
#     "last_failure": "2026-04-02T14:00:00Z"
#   }
# }
```

### 30.5 Troubleshoot Portal Issues

#### Build Failures

| Error | Cause | Resolution |
|-------|-------|------------|
| `NEXT_PUBLIC_*` variables not in build output | Variables not passed as `--build-arg` during Docker build | Rebuild with `--build-arg NEXT_PUBLIC_API_BASE_URL=...` |
| `Module not found` during build | Missing dependency | Run `npm install` or rebuild from clean `node_modules` |
| TypeScript type errors | Incompatible type definitions | Check for version mismatches in `package.json` |

> **Critical Reminder:** Portal Docker builds require `--build-arg` for all `NEXT_PUBLIC_*` variables. These are embedded at compile time. Always run `smoke-test.sh` after any Portal rebuild.

#### Proxy Errors

If the Portal cannot reach backend APIs:

1. Verify the `NEXT_PUBLIC_API_BASE_URL` environment variable points to the correct SoulAuth instance.
2. Check network connectivity from the Portal container to the API container.
3. Verify CORS headers are configured in `allowed_origins`:
   ```
   SOULAUTH_ALLOWED_ORIGINS=["https://tiresias.network"]
   ```

#### WebSocket Disconnects

The Portal uses WebSocket connections for real-time updates. If connections drop:

1. Check proxy/load balancer WebSocket support (must support `Connection: Upgrade`).
2. Verify idle timeout settings (minimum 60 seconds recommended).
3. Check for intermediate proxies that strip WebSocket headers.

### 30.6 Troubleshoot SIEM Integration

#### Event Delivery Failures

| SIEM Type | Common Issue | Resolution |
|-----------|-------------|------------|
| **Splunk HEC** | Invalid HEC token | Regenerate token in Splunk; update `SOULAUTH_SIEM_DESTINATIONS` |
| **Elasticsearch** | Index does not exist | Create the index with the Tiresias mapping template |
| **Syslog** | Connection refused | Verify syslog receiver is listening on the configured port; check firewall rules |
| **Webhook** | TLS certificate error | Verify the destination certificate is trusted; add CA to trust store |
| **Azure Sentinel** | Workspace ID mismatch | Verify `workspace_id` and `shared_key` in SIEM destination config |

#### SIEM Configuration

SIEM destinations are configured via the `SOULAUTH_SIEM_DESTINATIONS` environment variable as a JSON-encoded list:

```json
[
  {
    "type": "splunk",
    "url": "https://splunk.example.com:8088/services/collector/event",
    "token": "hec-token-here",
    "index": "tiresias",
    "verify_ssl": true
  },
  {
    "type": "syslog",
    "host": "syslog.example.com",
    "port": 514,
    "protocol": "tcp",
    "facility": 13
  }
]
```

#### Backpressure Handling

When SIEM destinations cannot keep up with event volume:

1. Increase `SOULAUTH_SIEM_BUFFER_SIZE` (default: 100) to buffer more events in memory.
2. Increase `SOULAUTH_SIEM_FLUSH_INTERVAL` (default: 30s) to batch more events per flush.
3. If backpressure persists, events are dropped with a `siem.buffer_overflow` warning log. Monitor this metric to size the buffer appropriately.

### 30.7 Collect Diagnostic Bundles

When opening a support ticket, collect a diagnostic bundle that includes sanitized configuration and logs.

#### Generate Diagnostic Bundle

```bash
#!/bin/bash
# tiresias-diagnostic.sh -- Collect diagnostic information
BUNDLE_DIR="/tmp/tiresias-diagnostic-$(date +%Y%m%d_%H%M%S)"
mkdir -p "${BUNDLE_DIR}"

echo "=== Collecting diagnostics ==="

# 1. Service health
for svc in soulauth:8000 soulwatch:8001 soulgate:8002; do
  curl -sf "http://${svc}/healthz" > "${BUNDLE_DIR}/${svc%%:*}-health.json" 2>&1
done

# 2. Service versions
docker compose ps --format json > "${BUNDLE_DIR}/containers.json"

# 3. Recent logs (last 1000 lines per service, redacted)
for svc in soulauth soulwatch soulgate portal; do
  docker compose logs --tail=1000 "${svc}" 2>/dev/null | \
    sed 's/sk_[a-zA-Z0-9_-]*/sk_REDACTED/g' | \
    sed 's/Bearer [a-zA-Z0-9._-]*/Bearer REDACTED/g' \
    > "${BUNDLE_DIR}/${svc}-logs.txt"
done

# 4. Database statistics (no data, just counts)
psql -h "${PGHOST}" -U "${PGUSER}" -d "${PGDATABASE}" -c "
  SELECT '_soul_tenants' AS table_name, count(*) FROM _soul_tenants
  UNION ALL SELECT '_soulkeys', count(*) FROM _soulkeys
  UNION ALL SELECT '_audit_logs', count(*) FROM _audit_logs
  UNION ALL SELECT '_soul_licenses', count(*) FROM _soul_licenses
  UNION ALL SELECT '_soul_partners', count(*) FROM _soul_partners;
" > "${BUNDLE_DIR}/db-stats.txt"

# 5. Environment (redacted)
env | grep -E '^(SOULAUTH_|TIRESIAS_|STRIPE_PRICE_)' | \
  sed 's/=\(.*SECRET.*\)/=REDACTED/' | \
  sed 's/=\(.*KEY.*\)/=REDACTED/' | \
  sed 's/=\(.*PASSWORD.*\)/=REDACTED/' | \
  sort > "${BUNDLE_DIR}/env-redacted.txt"

# 6. Disk and memory
df -h > "${BUNDLE_DIR}/disk.txt"
free -m > "${BUNDLE_DIR}/memory.txt" 2>/dev/null || vm_stat > "${BUNDLE_DIR}/memory.txt" 2>/dev/null

# 7. Package into tarball
tar czf "${BUNDLE_DIR}.tar.gz" -C /tmp "$(basename ${BUNDLE_DIR})"
rm -rf "${BUNDLE_DIR}"

echo "=== Diagnostic bundle: ${BUNDLE_DIR}.tar.gz ==="
echo "Review for sensitive data before submitting to support."
```

#### What to Redact Before Submission

Before submitting a diagnostic bundle, verify that the following are redacted:

| Data Type | Example Pattern | Must Redact |
|-----------|----------------|-------------|
| SoulKeys | `sk_*` | Yes |
| Bearer tokens | `Bearer eyJ...` | Yes |
| Stripe keys | `sk_live_*`, `sk_test_*` | Yes |
| Webhook secrets | `whsec_*` | Yes |
| Database passwords | Connection string passwords | Yes |
| License JWTs | `TIRESIAS_LICENSE_KEY=eyJ...` | Yes |
| Customer PII | Email addresses, names | Yes, unless relevant to the issue |

#### Support Escalation Matrix

| Severity | Definition | Initial Response | Escalation |
|----------|-----------|-----------------|------------|
| **P1 (Critical)** | Platform down; all tenants affected | 15 minutes | Engineering lead + VP within 30 minutes |
| **P2 (High)** | Major feature unavailable; some tenants affected | 1 hour | Engineering lead within 4 hours |
| **P3 (Medium)** | Minor feature issue; workaround available | 4 hours | Next business day review |
| **P4 (Low)** | Cosmetic issue or documentation question | Next business day | Weekly triage |

#### Log Analysis Techniques

**Find all errors in a time window:**
```bash
docker compose logs --since="2026-04-02T14:00:00" --until="2026-04-02T15:00:00" soulauth | \
  jq 'select(.level == "error" or .level == "critical")'
```

**Trace a specific request:**
```bash
# Find all log entries for a specific tenant
docker compose logs soulauth | jq 'select(.tenant_id == "a1b2c3d4-...")'

# Find all log entries for a specific SoulKey
docker compose logs soulauth | jq 'select(.soulkey_id == "e5f6g7h8-...")'
```

**Identify the most common errors:**
```bash
docker compose logs soulauth | jq -r '.event // empty' | sort | uniq -c | sort -rn | head -20
```

**Check audit log for suspicious activity:**
```sql
-- Find recent tier changes not from Stripe
SELECT tenant_id, event_type, reason, context, timestamp
FROM _audit_logs
WHERE event_type = 'tier_changed'
  AND (context->>'source') != 'stripe_webhook'
ORDER BY timestamp DESC
LIMIT 20;

-- Find license integrity violations
SELECT tenant_id, reason, context, timestamp
FROM _audit_logs
WHERE event_type = 'license_integrity_violation'
ORDER BY timestamp DESC
LIMIT 20;
```
