# Part VII: Enterprise Features

> **Tiresias Administration Guide v3.0**
> **Classification:** Customer-Facing
> **Audience:** Security administrators, SOC managers, MSSPs, platform operators

---

## Chapter 21: Multi-Tenancy

Tiresias implements a multi-tenant architecture where each tenant is a fully isolated organizational namespace. All data -- SoulKeys, policies, audit logs, detection events, and configuration -- is partitioned by tenant identifier. This chapter describes the tenant data model, lifecycle operations, isolation guarantees, quota management, and cross-tenant monitoring.

Multi-tenancy features require the Enterprise tier or higher. The feature gate middleware enforces this requirement at the API layer, returning HTTP 402 for tenants on Community, Starter, or Professional tiers that attempt to access multi-tenant operations.

### 21.1 Tenant Model and Isolation

#### Data Model

Each tenant is represented by a record in the `_soul_tenants` table with the following properties:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique tenant identifier, generated at provisioning |
| `name` | string | Human-readable organization name |
| `slug` | string | URL-safe short identifier, must be globally unique |
| `tier` | enum | Subscription tier: `community`, `starter`, `pro`, `enterprise`, `mssp`, `saas` |
| `status` | enum | Lifecycle state: `active`, `suspended`, `deactivated` |
| `metadata_` | JSON | Arbitrary key-value metadata (contact info, labels, custom fields) |
| `created_at` | timestamp | Provisioning timestamp (UTC) |
| `updated_at` | timestamp | Last modification timestamp (UTC) |

The `slug` serves as the tenant's namespace identifier in policy file paths, API routes, and log prefixes. Once assigned, the slug cannot be changed without re-provisioning the tenant.

#### Namespace Isolation

Tiresias enforces tenant isolation at three layers:

**Database Layer.** Every tenant-scoped table includes a `tenant_id` foreign key column. All queries are filtered by the caller's authenticated tenant context. The admin API router extracts the caller's `tenant_id` from the authenticated SoulKey and compares it against the target resource's `tenant_id`. If they do not match, the API returns HTTP 403 with the message "Cannot access another tenant's data."

**API Layer.** The `_get_caller_tenant_id()` function resolves the authenticated SoulKey from `request.state.rbac_soulkey` and returns its `tenant_id`. This value is used as a mandatory filter on all tenant-scoped queries. The function returns `None` only in testing mode (when `SOULAUTH_TESTING=true` and `ENVIRONMENT != production`), which disables tenant scoping for integration tests.

**Encryption Layer.** Each tenant receives a dedicated Data Encryption Key (DEK) provisioned during tenant creation via `provision_tenant_encryption()`. The DEK is wrapped (envelope encryption) and stored per-tenant. Prompt and completion data is encrypted at rest with the tenant's DEK, ensuring that even database-level access cannot expose another tenant's sensitive content. Tenants on the Enterprise tier and above can supply their own Key Encryption Key (KEK) for customer-held encryption (BYOK), using the `KEKRotateRequest` endpoint to rotate it.

#### Cross-Tenant Prevention

The following mechanisms prevent data leakage between tenants:

1. **IDOR enforcement.** Every admin endpoint that accepts a `tenant_id` parameter validates it against the caller's authenticated tenant. Mismatches return HTTP 403.
2. **SoulKey scoping.** Each SoulKey is bound to a single `tenant_id` at issuance. A SoulKey cannot authenticate against resources owned by a different tenant.
3. **Audit trail separation.** Audit log queries are always filtered by `tenant_id`. The hash chain integrity mechanism operates per-tenant, so chain verification detects if a foreign event were injected.
4. **Policy namespace.** Policy files are stored under tenant-specific paths derived from the tenant slug. The policy loader rejects policies whose path does not match the requesting tenant's namespace.

### 21.1.1 Tenant Hierarchy Model (v3.2.0)

Tiresias supports hierarchical tenant relationships with a maximum depth of 3 levels. The hierarchy enables delegated administration where a parent tenant operator can provision and manage child tenants within their subtree.

#### Hierarchy Data Model

Two columns on the `_soul_tenants` table define the hierarchy:

| Field | Type | Description |
|-------|------|-------------|
| `parent_tenant_id` | UUID (nullable) | References the parent tenant. NULL for root-level tenants. |
| `hierarchy_depth` | integer | Depth in the tree. 0 = root (SaaS master), 1 = MSSP/enterprise, 2 = customer, 3 = sub-tenant. |

The maximum allowed `hierarchy_depth` is 3. Attempts to create a tenant at depth 4 or beyond return HTTP 400 with the message "Maximum tenant hierarchy depth exceeded."

#### Hierarchy Structure

```
Level 0  SaaS Master (tier = saas)
         ├── Level 1  MSSP Partner (tier = mssp)
         │     ├── Level 2  Customer A (tier = enterprise)
         │     │     └── Level 3  Business Unit X (tier = pro)
         │     └── Level 2  Customer B (tier = pro)
         └── Level 1  Enterprise Direct (tier = enterprise)
               └── Level 2  Division East (tier = pro)
```

#### Tier-Based Creation Permission Matrix

Not all tiers can create child tenants. The following matrix defines which tiers can create which child tiers:

| Parent Tier | Allowed Child Tiers | Max Depth for Children |
|-------------|--------------------|-----------------------|
| `saas` | `mssp`, `enterprise`, `pro`, `starter`, `community` | 1 |
| `mssp` | `enterprise`, `pro`, `community` | 2 |
| `enterprise` | `pro`, `community` | 3 |
| `pro` | (cannot create children) | -- |
| `starter` | (cannot create children) | -- |
| `community` | (cannot create children) | -- |

The API enforces these rules at tenant creation time. If a parent tenant attempts to create a child at a tier equal to or higher than its own, the API returns HTTP 403 with the message "Tier not permitted for child tenant creation."

#### Delegated Administration

Delegated administration allows a parent tenant's Owner-role users to manage child tenants without requiring platform-level (SaaS master) credentials. Delegated admins can:

- Create child tenants within the permitted tier matrix
- Suspend and reactivate child tenants
- View child tenant configuration, quotas, and audit summaries
- Push policies to child tenants
- Rotate or revoke SoulKeys within child tenants

Delegated admins cannot:

- Access sibling tenants or tenants outside their subtree
- Elevate a child tenant's tier above the parent's tier
- Modify the parent tenant's own configuration
- Access the SaaS master admin endpoints

The RBAC system resolves delegated admin permissions by walking the `parent_tenant_id` chain. If the authenticated caller's `tenant_id` is an ancestor of the target `tenant_id`, and the caller holds the `tenants:manage_children` permission, the operation is permitted.

#### SaaS Master Tier

The SaaS master tier (`tier = saas`, `hierarchy_depth = 0`) is the root of the tenant hierarchy. Only the platform operator (Saluca) holds a SaaS master tenant. This tier has unrestricted access to all platform administration endpoints, including:

- `GET /v1/saas/admin/tenants` -- List all tenants across the platform with hierarchy metadata
- `POST /v1/saas/admin/tenants` -- Create a tenant at any level with explicit `parent_tenant_id`
- `GET /v1/saas/admin/tenants/{id}/subtree` -- Retrieve the full subtree under a tenant
- `PATCH /v1/saas/admin/tenants/{id}/reparent` -- Move a tenant to a different parent (restricted to depth constraints)
- `GET /v1/saas/admin/hierarchy/stats` -- Platform-wide hierarchy statistics (tenant count by depth, tier distribution)
- `POST /v1/saas/admin/hierarchy/validate` -- Validate hierarchy integrity (orphan detection, depth constraint violations)

These endpoints are documented in Chapter 31 (API Reference).

### 21.2 Create and Configure Tenants

#### Provision a New Tenant

Create a tenant by sending a POST request to the Admin API:

```
POST /v1/soulauth/admin/tenants
```

**Required permission:** `tenants:create` (Owner role only)

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Organization display name |
| `slug` | string | Yes | URL-safe identifier (must be globally unique) |
| `tier` | string | No | Subscription tier (defaults to `community`) |
| `parent_tenant_id` | UUID | No | Parent tenant UUID for hierarchical placement. If omitted, the tenant is created at the root level (requires SaaS master credentials). If provided, the caller must be an admin of the parent tenant or an ancestor. |
| `metadata` | object | No | Arbitrary key-value pairs |

**Example request (standalone tenant):**

```json
{
  "name": "Acme Security Operations",
  "slug": "acme-secops",
  "tier": "enterprise",
  "metadata": {
    "contact_email": "admin@acme.com",
    "region": "us-west-2"
  }
}
```

**Example request (child tenant under an MSSP parent):**

```json
{
  "name": "Acme Security Operations",
  "slug": "acme-secops",
  "tier": "enterprise",
  "parent_tenant_id": "f9a8b7c6-d5e4-3210-fedc-ba0987654321",
  "metadata": {
    "contact_email": "admin@acme.com",
    "region": "us-west-2"
  }
}
```

**Provisioning sequence:**

1. The API validates that the slug is not already in use. If it exists, the API returns HTTP 409 ("Tenant slug already exists").
2. If `parent_tenant_id` is provided, the API validates: (a) the parent tenant exists and is active, (b) the caller has `tenants:manage_children` permission on the parent, (c) the requested child tier is permitted by the parent's tier (see Section 21.1.1), and (d) the resulting `hierarchy_depth` does not exceed 3. Validation failures return HTTP 400 or 403 with a descriptive message.
3. A new tenant record is created with `status: active`. The `parent_tenant_id` and `hierarchy_depth` fields are set based on the parent (or NULL and 0 for root tenants).
4. The system eagerly provisions a DEK for envelope encryption via `provision_tenant_encryption()`.
5. The API returns the full `TenantDetail` object including the generated UUID, `parent_tenant_id`, and `hierarchy_depth`.

**Example response:**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Acme Security Operations",
  "slug": "acme-secops",
  "tier": "enterprise",
  "status": "active",
  "metadata": {"contact_email": "admin@acme.com", "region": "us-west-2"},
  "created_at": "2026-04-01T12:00:00Z",
  "updated_at": "2026-04-01T12:00:00Z"
}
```

After provisioning, assign an Owner-role SoulKey to the tenant so that the tenant's administrator can manage their own keys, policies, and users.

#### Assign Tenant Administrator

Issue a SoulKey with the `admin_role: owner` metadata to designate the tenant administrator:

```json
{
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "persona_id": "tenant-admin",
  "label": "Primary tenant administrator",
  "metadata": {
    "admin_role": "owner"
  }
}
```

The `admin_role` value in the SoulKey's metadata determines the role used for RBAC evaluation. See Chapter 23 for the complete role hierarchy and permission matrix.

#### List and Inspect Tenants

Retrieve all tenants with optional filters:

```
GET /v1/soulauth/admin/tenants?status=active&tier=enterprise
```

**Required permission:** `tenants:read`

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by lifecycle status: `active`, `suspended` |
| `tier` | string | Filter by subscription tier |

Retrieve a specific tenant by ID:

```
GET /v1/soulauth/admin/tenants/{tenant_id}
```

The response includes the full `TenantDetail` object. The API enforces tenant scoping: callers can only retrieve their own tenant's details unless they hold a platform-level (multi-tenant) key.

#### Update Tenant Properties

Modify tenant name, tier, status, or metadata:

```
PATCH /v1/soulauth/admin/tenants/{tenant_id}
```

**Required permission:** `tenants:update`

**Updatable fields:**

| Field | Description |
|-------|-------------|
| `name` | Organization display name |
| `tier` | Subscription tier (triggers feature gate re-evaluation) |
| `status` | Lifecycle status |
| `metadata` | Arbitrary key-value pairs (replaces existing metadata) |

Changing the `tier` field takes effect immediately. The feature gate middleware resolves the tenant tier from the database on every request, so tier upgrades and downgrades are reflected without restart.

### 21.3 Configure Tenant-Level Policies

Each tenant operates within the boundary of two tier ceilings:

1. **Install-level tier.** Set by the platform license JWT. This is the maximum tier the entire installation supports.
2. **Tenant subscription tier.** Set per-tenant in the `_soul_tenants` table. This reflects what the tenant has paid for.

The effective tier is computed as `min(install_tier, tenant_tier)` using the `effective_tier()` function from `src/tier.py`. The install license caps the ceiling; the tenant tier cannot exceed it even if the database record is manually set higher.

#### Tier Rank Order

| Rank | Tier | Description |
|------|------|-------------|
| 0 | `community` | Free tier with basic authentication and identity |
| 1 | `starter` | Auth + identity + trial features |
| 2 | `pro` | Analytics, detection rules, delegation, policy Git sync |
| 3 | `enterprise` | Enforcement, SIEM forwarding, audit export, multi-tenant, custom detection |
| 4 | `mssp` | All Enterprise features plus multi-customer management |
| 5 | `saas` | Full platform capabilities |

#### Feature-to-Tier Mapping

The feature gate middleware maps URL path prefixes to features and enforces tier access:

| Feature | Minimum Tier | Protected Paths |
|---------|-------------|-----------------|
| `auth_identity` | Community | `/v1/auth/` |
| `analytics` | Pro | `/v1/analytics` |
| `detection_rules` | Pro | `/v1/detection` |
| `enforcement` | Enterprise | `/v1/enforcement` |
| `siem_forwarding` | Enterprise | `/v1/integrations` |
| `multi_tenant` | Enterprise | Multi-tenant admin operations |
| `custom_detection` | Enterprise | Custom Sigma rule management |
| `audit_export` | Enterprise | Audit log export and evidence packages |

When a request targets a feature not included in the effective tier, the middleware returns HTTP 402 with a structured error body:

```json
{
  "error": "feature_not_licensed",
  "detail": "Feature 'enforcement' requires the enterprise tier or higher.",
  "feature": "enforcement",
  "tier_required": "enterprise",
  "tier_current": "pro",
  "upgrade_url": "https://tiresias.network/pricing"
}
```

#### Per-Tenant Security Defaults

Configure per-tenant security defaults by writing tenant-scoped policies under the tenant's slug namespace. The following settings are commonly tuned per tenant:

| Setting | Location | Description |
|---------|----------|-------------|
| Detection thresholds | Tenant policy YAML | Per-anomaly-type sensitivity (e.g., rate spike threshold) |
| Rate limits | Tenant metadata or policy | Max requests per agent per window |
| Baseline learning window | Tenant policy YAML | Observation period before anomaly scoring activates |
| Quarantine policy | Tenant policy YAML | Auto-response actions for specific anomaly types |

### 21.4 Manage Tenant Quotas

Tenant quotas are enforced through a combination of tier-level limits and per-tenant overrides stored in the tenant metadata.

#### Agent Limits

Each tier defines a default maximum number of active SoulKeys (agents) per tenant:

| Tier | Default Agent Limit |
|------|-------------------|
| Community | 5 |
| Starter | 25 |
| Pro | 100 |
| Enterprise | 500 |
| MSSP | Unlimited (per-customer limits apply) |
| SaaS | Unlimited |

Override the default limit by setting the `agent_limit` key in the tenant's metadata:

```json
{
  "metadata": {
    "agent_limit": 250
  }
}
```

The system checks the agent count against this limit during SoulKey issuance. If the limit is exceeded, the API returns HTTP 429 with a descriptive error.

#### Request Volume Caps

Per-tenant request volume caps are enforced by the rate limiting middleware. Configure request caps in the tenant metadata:

```json
{
  "metadata": {
    "rate_limit_rpm": 10000,
    "rate_limit_burst": 500
  }
}
```

#### Storage Allocation

Audit log and detection event storage is allocated per-tenant based on the tier:

| Tier | Default Retention | Max Storage |
|------|------------------|-------------|
| Community | 7 days | 1 GB |
| Starter | 30 days | 10 GB |
| Pro | 90 days | 50 GB |
| Enterprise | 365 days | 500 GB |
| MSSP | Custom per customer | Custom |

### 21.5 Monitor Cross-Tenant Activity

#### Tenant Suspension

Suspend a tenant to immediately disable all its SoulKeys and prevent further API access:

```
POST /v1/soulauth/admin/tenants/{tenant_id}/suspend
```

**Required permission:** `tenants:update`

Suspension sets the tenant's status to `suspended`. All SoulKeys under the tenant receive DENY decisions at the authentication layer. The tenant's data remains intact and can be restored by reactivation.

Reactivate a suspended tenant:

```
POST /v1/soulauth/admin/tenants/{tenant_id}/activate
```

#### Tenant Offboarding

For permanent tenant removal, use the offboarding cascade. The offboarding process executes the following steps in order:

| Step | Action | Description |
|------|--------|-------------|
| 1 | Revoke all SoulKeys | Sets all active and suspended keys to `revoked` status with reason `tenant_offboarded` |
| 2 | Destroy wrapped DEK | Zero-fills the wrapped DEK column, then NULLs it (crypto-shred) |
| 3 | Scrub encrypted fields | NULLs all `encrypted_prompt` and `encrypted_completion` fields in the audit log |
| 4 | Deactivate tenant | Sets tenant status to `deactivated` |
| 5 | Audit log | Records the offboarding event with counts of affected resources |

```
POST /v1/soulauth/admin/tenants/{tenant_id}/offboard
```

**Required permission:** `tenants:delete` (Owner role only)

The response includes a summary of affected resources:

```json
{
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "soulkeys_revoked": 47,
  "dek_destroyed": true,
  "records_scrubbed": 12843,
  "status": "deactivated"
}
```

After offboarding, the tenant's data is cryptographically inaccessible because the DEK has been destroyed. The retention scheduler handles hard-deletion of remaining records after the configured retention period.

**Caution:** Tenant offboarding is irreversible. The DEK destruction ensures that encrypted data cannot be recovered even with database access. Confirm the tenant identifier carefully before executing this operation.

#### Audit Inter-Tenant Operations

All tenant lifecycle operations are recorded in the audit log with the following event types:

| Event Type | Trigger | Audit Fields |
|------------|---------|-------------|
| `tenant_created` | POST /tenants | tenant_id, name, slug, tier |
| `tenant_updated` | PATCH /tenants/{id} | changed fields, previous values |
| `tenant_suspended` | POST /tenants/{id}/suspend | tenant_id, suspended_by |
| `tenant_activated` | POST /tenants/{id}/activate | tenant_id, activated_by |
| `tenant_offboarded` | POST /tenants/{id}/offboard | soulkeys_revoked, dek_destroyed, records_scrubbed |

To detect potential isolation violations, monitor the audit log for cross-tenant access attempts. The RBAC middleware logs a `rbac.permission_denied` structured event whenever a caller attempts to access a resource outside their tenant boundary. These events include the caller's SoulKey ID, role, and the required permission, enabling forensic analysis of misconfigured or compromised keys.

---

## Chapter 22: Single Sign-On and Identity Federation

Tiresias supports enterprise Single Sign-On (SSO) through OpenID Connect (OIDC), enabling administrators and analysts to authenticate to the Portal using their organization's identity provider (IdP). SSO centralizes user management, eliminates credential sprawl, and enforces the organization's existing MFA and conditional access policies.

This chapter covers the SSO architecture, IdP configuration, the authorization code flow with PKCE, group-to-role mapping, domain-based routing, and troubleshooting.

### 22.1 SSO Architecture

#### Authentication Flow

Tiresias implements the OIDC Authorization Code flow with Proof Key for Code Exchange (PKCE). The flow proceeds as follows:

```
User -> Portal -> /v1/auth/oidc/authorize -> IdP Authorization Endpoint
                                                      |
User <- Portal <- /v1/auth/oidc/callback  <- IdP (authorization code)
                         |
                    Token Exchange (code + PKCE verifier)
                         |
                    ID Token Validation (JWKS)
                         |
                    JIT User Provisioning
                         |
                    Session Token Issued
```

**Step-by-step:**

1. **Authorize.** The Portal redirects the user to `/v1/auth/oidc/authorize` with the tenant slug or email address. The endpoint resolves the correct IdP configuration, generates a PKCE challenge and cryptographic nonce, signs the state parameter with HMAC-SHA256, and returns the IdP's authorization URL.

2. **IdP Authentication.** The user authenticates at the IdP (entering credentials, completing MFA, etc.). The IdP redirects back to the Portal's callback URL with an authorization code and the signed state.

3. **Callback.** The Portal sends the authorization code and state to `/v1/auth/oidc/callback`. The endpoint verifies the HMAC-signed state to prevent CSRF, validates the nonce to prevent replay, exchanges the code for tokens using the PKCE code verifier, and validates the ID token signature against the IdP's JWKS.

4. **JIT Provisioning.** The system creates or updates the user record in `_soul_users` based on the validated OIDC claims. Group memberships from the ID token are mapped to Tiresias RBAC roles.

5. **Session.** A session token is issued and returned to the Portal. Subsequent API calls include this token for authentication.

#### Security Properties

| Property | Mechanism |
|----------|-----------|
| CSRF prevention | HMAC-SHA256 signed state parameter with server-side secret |
| Replay prevention | Cryptographic nonce stored server-side, consumed on callback |
| Code interception prevention | PKCE S256 challenge/verifier pair |
| Token integrity | ID token signature verified against IdP JWKS |
| State durability | PKCE verifier embedded in signed state for instance-restart recovery |

**Production requirement:** The `oidc_state_secret` configuration parameter must be set to a cryptographically random value in production. The default value `dev-state-secret-change-me` is for development only and will allow state forgery if used in production.

**Scaling requirement:** The in-memory nonce store is not safe for horizontal scaling. Production deployments behind a load balancer must use a Redis or database-backed nonce store with TTL expiry to prevent nonce replay across instances.

#### Supported Identity Providers

Tiresias supports any OIDC-compliant identity provider. The system has been tested with:

| Provider | Provider Type | Notes |
|----------|--------------|-------|
| Google Workspace | `google` | Uses Google's OIDC discovery endpoint |
| Microsoft Entra ID (Azure AD) | `azure` | Supports single-tenant and multi-tenant app registrations |
| Okta | `okta` | Supports Okta org and custom authorization servers |
| Auth0 | `auth0` | Supports Auth0 tenants with custom domains |
| OneLogin | `onelogin` | Standard OIDC connector |
| Keycloak | `keycloak` | Self-hosted identity provider |

### 22.2 Configure SAML SSO

Tiresias SSO is built on OIDC, not SAML 2.0 directly. Most enterprise IdPs that support SAML also support OIDC. If your IdP only supports SAML 2.0, configure a SAML-to-OIDC bridge (such as Keycloak or Dex) as an intermediary.

For IdPs that support both protocols, use OIDC. The OIDC flow provides superior security properties (PKCE, nonce verification) and simpler configuration compared to SAML assertion signing and XML processing.

#### IdP Configuration Record

Each IdP configuration is stored in the `_soul_idp_configs` table:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Configuration identifier |
| `tenant_id` | UUID | Owning tenant |
| `provider_type` | string | Provider identifier: `google`, `azure`, `okta`, `auth0`, etc. |
| `client_id` | string | OIDC client ID from the IdP application registration |
| `client_secret` | string | OIDC client secret (encrypted at rest) |
| `discovery_url` | string | OIDC discovery document URL (`.well-known/openid-configuration`) |
| `scopes` | list | Requested OIDC scopes (default: `["openid", "email", "profile"]`) |
| `domain_hint` | string | Email domain for automatic IdP routing (e.g., `acme.com`) |
| `claim_mapping` | JSON | Maps IdP claim names to Tiresias user attributes |
| `group_role_map` | JSON | Maps IdP group names to Tiresias admin roles |
| `is_default` | boolean | Whether this is the default IdP for the tenant |
| `status` | enum | `active` or `disabled` |

#### Register an IdP

To register a new OIDC identity provider for a tenant:

1. **Create an application registration in your IdP.** Configure the redirect URI as `{PORTAL_BASE_URL}/api/auth/callback`. Request the `openid`, `email`, and `profile` scopes. If group-to-role mapping is needed, also request the `groups` scope (provider-specific).

2. **Obtain the discovery URL.** Typical formats:
   - Google: `https://accounts.google.com/.well-known/openid-configuration`
   - Azure AD: `https://login.microsoftonline.com/{tenant-id}/v2.0/.well-known/openid-configuration`
   - Okta: `https://{your-org}.okta.com/.well-known/openid-configuration`
   - Auth0: `https://{your-domain}.auth0.com/.well-known/openid-configuration`

3. **Create the IdP configuration record** in the Tiresias database with the `client_id`, `client_secret`, `discovery_url`, and `domain_hint` for your organization's email domain.

4. **Test the flow** by navigating to the Portal login and entering an email address that matches the configured `domain_hint`. The Portal should redirect to the IdP for authentication.

### 22.3 Configure OIDC SSO

#### Initiate Authorization

The Portal initiates SSO by calling the authorize endpoint:

```
GET /v1/auth/oidc/authorize
```

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email` | string | One of email, tenant_slug, or provider_type required | User email for domain-based IdP resolution |
| `tenant_slug` | string | | Tenant slug for direct tenant-based IdP lookup |
| `provider_type` | string | | Provider type for public sign-in without tenant context |
| `portal_base_url` | string | No | Override the redirect URI base (must be in allowed origins) |

The endpoint returns an `AuthorizeResponse` with the IdP authorization URL and the signed state token:

```json
{
  "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=...",
  "state": "eyJ0ZW5hbnRfaWQiOi..."
}
```

**Origin allowlist.** The `portal_base_url` parameter is checked against the configured `allowed_origins` list. If the origin is not in the allowlist, the system falls back to the default `public_url` to prevent open redirect attacks.

#### Complete the Callback

After the user authenticates at the IdP, the IdP redirects to the Portal's callback URL. The Portal extracts the authorization code and state, then calls:

```
POST /v1/auth/oidc/callback
```

**Request body:**

```json
{
  "code": "4/0AY0e-g7...",
  "state": "eyJ0ZW5hbnRfaWQiOi...",
  "redirect_uri": "https://portal.tiresias.network/api/auth/callback"
}
```

**Callback processing:**

1. Verify the HMAC-SHA256 state signature. Reject on mismatch (HTTP 400).
2. Verify the nonce against the server-side nonce store. Log a warning if the nonce store missed (instance restart), but continue using the state-embedded values.
3. Load the IdP configuration from the database.
4. Exchange the authorization code for tokens, including the PKCE code verifier.
5. Validate the ID token: verify the signature against the IdP's JWKS, check `iss`, `aud`, `exp`, and `nonce` claims.
6. Extract user claims and JIT-provision the user.
7. Create a session and return the session token.

**Callback response:**

```json
{
  "session_token": "sk_session_...",
  "user_id": "11111111-2222-3333-4444-555555555555",
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "admin@acme.com",
  "display_name": "Jane Admin",
  "admin_role": "admin",
  "expires_in": 86400,
  "tier": "enterprise",
  "tenant_name": "Acme Security Operations"
}
```

#### Session Management

Active sessions can be inspected and revoked:

**Get current user profile:**

```
GET /v1/auth/oidc/userinfo
```

Include the session token via the `X-OIDC-Session` header or `Authorization: Bearer` header. Returns the authenticated user's profile including tenant association, role, and IdP provider.

**Revoke a session:**

```
DELETE /v1/auth/oidc/session
```

Invalidates the session in the database. The user must re-authenticate to obtain a new session.

### 22.4 Map External Groups to Roles

Tiresias supports automatic role assignment based on IdP group memberships. When a user authenticates via SSO, the JIT provisioning system extracts group claims from the ID token and maps them to Tiresias RBAC roles.

#### Group Claim Extraction

The system checks for group memberships in the following claim keys, in order:

| Claim Key | Provider | Description |
|-----------|----------|-------------|
| `groups` | Most OIDC providers | Standard groups claim |
| `roles` | Azure AD, custom IdPs | Role-based claim |
| `cognito:groups` | AWS Cognito | Cognito-specific group claim |

If none of these claims are present, the user receives the default role (`viewer`).

#### Configure Group-to-Role Mapping

The `group_role_map` field in the IdP configuration defines the mapping from IdP group names to Tiresias roles:

```json
{
  "group_role_map": {
    "tiresias-owners": "owner",
    "tiresias-admins": "admin",
    "soc-analysts": "operator",
    "security-viewers": "viewer"
  }
}
```

**Role resolution logic:**

1. Extract all group memberships from the ID token claims.
2. For each group, look up the corresponding Tiresias role in the `group_role_map`.
3. If multiple groups map to different roles, select the highest-ranked role. The role hierarchy is: `viewer` (0) < `operator` (1) < `admin` (2) < `owner` (3).
4. If no groups match, use the default role (`viewer`).

**Example:** A user with IdP groups `["soc-analysts", "tiresias-admins"]` would receive the `admin` role because `admin` (rank 2) outranks `operator` (rank 1).

#### Role Updates on Re-Authentication

Group-to-role mapping is re-evaluated on every login. If an administrator removes a user from the `tiresias-admins` group in the IdP, the user's role in Tiresias is downgraded on their next authentication. This behavior is conditional:

- If the IdP configuration has a non-empty `group_role_map`, the role is updated on every login.
- If the `group_role_map` is empty or not configured, the existing role is preserved (manual role management mode).

### 22.5 Troubleshoot SSO Login Failures

#### Common Failure Modes

| Symptom | Cause | Resolution |
|---------|-------|------------|
| "No SSO provider for this email domain" | No IdP config with matching `domain_hint` | Verify the `domain_hint` in the IdP configuration matches the user's email domain exactly |
| "No SSO provider for this tenant" | Tenant exists but no active IdP config | Create and activate an IdP configuration for the tenant |
| "OIDC SSO is not enabled" | `oidc_enabled` setting is `false` | Set `OIDC_ENABLED=true` in the environment configuration |
| "Invalid state" on callback | HMAC signature mismatch | Ensure `oidc_state_secret` is consistent across all instances. If recently changed, have the user retry |
| "Nonce mismatch" | Nonce store lost between authorize and callback | This occurs after instance restarts. The system falls back to state-embedded values. If persistent, deploy a Redis-backed nonce store |
| "IdP did not return id_token" | Token exchange succeeded but no id_token in response | Verify the IdP application is configured to return ID tokens. Check that `openid` scope is requested |
| Token exchange failed | Incorrect `client_secret`, wrong redirect URI, or expired code | Check the IdP application credentials. Ensure the redirect URI registered at the IdP exactly matches `{PORTAL_BASE_URL}/api/auth/callback` |
| "Your account has been suspended" (HTTP 403) | User's `status` in `_soul_users` is `suspended` | An administrator must reactivate the user account |
| "Your account has been deactivated" (HTTP 403) | User's `status` in `_soul_users` is `deactivated` | The account has been permanently deactivated. Contact the tenant administrator |

#### Domain-Based Routing

When a user enters their email address on the Portal login page, the domain resolution system extracts the domain portion (everything after `@`) and queries the `_soul_idp_configs` table for a record where `domain_hint` matches the extracted domain. This enables automatic routing to the correct IdP without requiring the user to know their tenant slug.

**Domain resolution flow:**

1. Extract domain from email: `admin@acme.com` yields `acme.com`.
2. Query: `SELECT * FROM _soul_idp_configs WHERE domain_hint = 'acme.com' AND status = 'active'`.
3. If found, use the matched IdP config's `tenant_id` and settings.
4. If not found, return HTTP 404 ("No SSO provider for this email domain").

**Multi-domain support.** A single tenant can have multiple IdP configurations with different `domain_hint` values. For example, a tenant with two email domains (`acme.com` and `acme.io`) can register separate IdP configs for each, or use a single IdP config with one domain as the primary and add additional configs for subsidiary domains.

#### JWKS Cache

The system caches each IdP's JSON Web Key Set (JWKS) in memory with a configurable TTL (default: 3600 seconds). If the IdP rotates its signing keys and the cache has not expired, token validation will fail. To force a cache refresh:

1. Call `invalidate_jwks_cache()` with the specific `jwks_uri` to clear a single IdP's cache.
2. Call `invalidate_jwks_cache()` without arguments to clear all cached JWKS.
3. Restart the service to clear the in-memory cache entirely.

---

## Chapter 23: Role-Based Access Control

Tiresias implements a two-layer RBAC model for administrative access to the Portal and API. The first layer -- **portal-level roles** -- controls platform-wide access. The second layer -- **team-level roles** (v3.3.0) -- controls access within team-scoped operations. Every API request is evaluated against the caller's portal role, team role (when applicable), and account admin designations. This chapter describes the two-layer role hierarchy, permission matrix, team management, invitation flow, custom role creation, audit of privilege changes, and API key permission scoping.

### 23.1 RBAC Model

#### Two-Layer Role Architecture (v3.3.0)

Tiresias v3.3.0 introduces a two-layer role model:

1. **Portal-level roles** govern what a user can do across the entire tenant (e.g., issue SoulKeys, configure SIEM, manage billing).
2. **Team-level roles** govern what a user can do within a specific team context (e.g., investigate incidents assigned to the team, manage team members).

The effective permissions for a team-scoped operation are the **intersection** of the user's portal-level and team-level permissions. Portal-level permissions set the ceiling; team-level roles cannot exceed it.

#### Predefined Portal-Level Roles

Tiresias defines four predefined administrative roles in ascending order of privilege:

| Role | Rank | Description |
|------|------|-------------|
| `viewer` | 0 | Read-only access to dashboards, audit logs, policies, detection events, analytics, and keys |
| `operator` | 1 | Viewer permissions plus policy sync triggers and operational actions |
| `admin` | 2 | Operator permissions plus key management, policy authoring, detection and enforcement configuration, user/team management, and multi-tenant operations |
| `owner` | 3 | Full access including billing, tenant deletion, account admin designation, and all administrative operations |

The role hierarchy is defined in `ROLE_HIERARCHY = ["viewer", "operator", "admin", "owner"]`. Higher-ranked roles inherit all permissions of lower-ranked roles through the wildcard permission system.

#### Predefined Team-Level Roles (v3.3.0)

Team roles control access within a team context:

| Team Role | Rank | Description |
|-----------|------|-------------|
| `member` | 0 | Read-only access to team dashboards and shared resources |
| `analyst` | 1 | Operational team access: investigate incidents, manage quarantines, modify detection rules within team scope |
| `team_admin` | 2 | Full control of the team: manage members, edit team settings, perform all team-scoped operations |

#### Account Admin Designations (v3.3.0)

Two special designations provide elevated tenant-wide authority that operates independently of the standard role hierarchy:

| Designation | Field on `_soul_users` | Authority |
|-------------|------------------------|-----------|
| **Account Admin** | `is_account_admin` | Full administrative authority over the tenant account. Can designate secondary admins, manage all users and teams, access billing, override team-level restrictions. Typically the tenant owner. |
| **Secondary Admin** | `is_secondary_admin` | Delegated administrative authority. Can manage users and teams across the tenant but cannot modify account admin settings or designate other secondary admins. |

Account admin designations are checked before standard RBAC evaluation. An account admin bypasses team-level role checks for administrative operations.

#### Permission Matrix

Permissions follow the format `resource:action` where the action is one of `create`, `read`, `update`, `delete`, `sync`, or `*` (all actions).

**Viewer permissions:**

| Permission | Description |
|------------|-------------|
| `audit:read` | View audit log entries |
| `tenants:read` | View tenant details |
| `policy:read` | View policy configurations |
| `detection:read` | View detection events and rules |
| `analytics:read` | View analytics dashboards |
| `aletheia:read` | View chain-of-thought audit data |
| `keys:read` | View SoulKey inventory (no raw keys) |
| `enforcement:read` | View enforcement actions and quarantine status |

**Operator permissions (in addition to Viewer):**

| Permission | Description |
|------------|-------------|
| `policy:sync` | Trigger policy synchronization from Git |

**Admin permissions (in addition to Operator):**

| Permission | Description |
|------------|-------------|
| `keys:*` | Create, read, update, suspend, reinstate, and revoke SoulKeys |
| `policy:*` | Create, read, update, delete, and sync policies |
| `tenants:update` | Modify tenant properties (name, tier, status, metadata) |
| `detection:*` | Manage detection rules and thresholds |
| `enforcement:*` | Configure enforcement actions and quarantine policies |
| `analytics:*` | Full analytics access including data export |
| `aletheia:*` | Full chain-of-thought audit access |
| `multi_tenant` | Access multi-tenant management operations |
| `users:*` | Create, read, update, and delete portal user accounts (v3.3.0) |
| `teams:*` | Create, read, update, and delete teams; manage team membership (v3.3.0) |
| `invites:*` | Create, read, revoke, and manage user invitations (v3.3.0) |

**Owner permissions:**

| Permission | Description |
|------------|-------------|
| `*` | Wildcard: all permissions on all resources. Includes tenant creation, deletion, billing, and license management |

#### Permission Evaluation

The `require_permission()` function is a FastAPI dependency that enforces RBAC on every protected endpoint. The evaluation proceeds as follows:

1. **Extract credentials.** Check for `X-SoulKey` header or `Authorization: Bearer` token.
2. **Resolve role.** Look up the SoulKey in the database, extract the `admin_role` from its `metadata_` field. Default to `viewer` if no role is set.
3. **Check permission.** Compare the role's permissions against the required permission using wildcard matching.
4. **Deny or allow.** If the role does not have the required permission, return HTTP 403 with a structured error including the role, required permission, and a descriptive message.

**Wildcard matching rules:**

- `*` matches any permission (Owner role).
- `keys:*` matches `keys:create`, `keys:read`, `keys:update`, `keys:delete`.
- `policy:sync` matches only `policy:sync` (exact match).

#### Authentication Fallback Chain

The RBAC middleware supports multiple authentication methods, evaluated in order:

| Priority | Method | Header | Description |
|----------|--------|--------|-------------|
| 1 | Testing bypass | Environment variables | Active only when `SOULAUTH_TESTING=true` AND `ENVIRONMENT != production`. Grants Owner role. Never active in production. |
| 2 | Service-to-service | `X-Internal-Key` | Validated against `SOULWATCH_INTERNAL_API_KEY` or `INTERNAL_API_KEY`. Grants Admin role. Used for inter-service calls (Portal to SoulWatch). |
| 3 | SoulKey | `X-SoulKey` or `Authorization: Bearer` | Primary authentication. Role resolved from SoulKey metadata. |
| 4 | OIDC session | `Authorization: Bearer` (session token) | Fallback when SoulKey lookup returns no match. Role resolved from `SoulUser.admin_role`. |

If all methods fail, the endpoint returns HTTP 401 ("Authentication required. Provide X-SoulKey header.").

### 23.2 Assign Roles to Portal Users

#### SoulKey-Based Role Assignment

For API and programmatic access, the admin role is stored in the SoulKey's `metadata_` field under the `admin_role` key:

```json
{
  "metadata": {
    "admin_role": "admin"
  }
}
```

To change a SoulKey's role, update its metadata via the Admin API:

```
PATCH /v1/soulauth/admin/keys/{key_id}
```

**Required permission:** `keys:update` (Admin or Owner role)

#### OIDC-Based Role Assignment

For Portal users who authenticate via SSO, the role is determined by one of two methods:

1. **Group-to-role mapping (recommended).** The IdP sends group memberships in the ID token. The JIT provisioning system maps these groups to Tiresias roles using the `group_role_map` in the IdP configuration. See Section 22.4.

2. **Manual role assignment.** An administrator sets the `admin_role` field directly on the `SoulUser` record. This is used when the IdP does not provide group claims or when group mapping is not configured.

Group-to-role mapping takes precedence when configured. If the `group_role_map` is non-empty, the role is re-evaluated on every login, overriding any manual assignment.

#### Per-Tenant Role Scoping

Each role assignment is scoped to a single tenant. A user can have different roles in different tenants if they have accounts (SoulKeys or SSO users) in multiple tenants. There is no global "super admin" role -- even platform operators must authenticate with a SoulKey bound to a specific tenant.

Multi-tenant visibility is available only to keys with the `multi_tenant` permission (Admin role and above on Enterprise tier).

#### Least Privilege Recommendations

| Use Case | Recommended Role |
|----------|-----------------|
| SOC analyst viewing alerts and events | `viewer` |
| SOC analyst with policy sync privileges | `operator` |
| Security engineer managing keys and rules | `admin` |
| Tenant administrator with full control | `owner` |
| Automated CI/CD pipeline for policy deployment | `operator` (with `policy:sync` only) |
| SIEM integration service account | `viewer` (read-only analytics and audit) |

### 23.2.1 Manage Users (v3.3.0)

Tiresias v3.3.0 provides a dedicated User Management API for portal user lifecycle operations.

#### List Users

**Endpoint:** `GET /v1/users`
**Required permission:** `users:read`

```bash
curl -s "https://tiresias.network/v1/users" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

**Response:** Returns a list of all portal users in the tenant, including their portal role, team memberships, account admin status, and last login timestamp.

#### Get User Details

**Endpoint:** `GET /v1/users/{user_id}`
**Required permission:** `users:read`

```bash
curl -s "https://tiresias.network/v1/users/$USER_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

#### Update User

**Endpoint:** `PATCH /v1/users/{user_id}`
**Required permission:** `users:update`

```bash
curl -s -X PATCH "https://tiresias.network/v1/users/$USER_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "admin_role": "operator",
    "is_secondary_admin": true,
    "primary_team_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012"
  }'
```

**Updatable fields:**

| Field | Type | Description |
|-------|------|-------------|
| `admin_role` | string | Portal-level role: `viewer`, `operator`, `admin`, `owner` |
| `is_account_admin` | boolean | Account admin designation (requires current user to be account admin) |
| `is_secondary_admin` | boolean | Secondary admin designation (requires admin or owner role) |
| `primary_team_id` | UUID | User's primary team for default context |
| `status` | string | User status: `active`, `suspended`, `deactivated` |

#### Delete User

**Endpoint:** `DELETE /v1/users/{user_id}`
**Required permission:** `users:delete`

```bash
curl -s -X DELETE "https://tiresias.network/v1/users/$USER_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

Deleting a user removes all team memberships and revokes any active sessions. The user's audit trail is preserved.

### 23.2.2 Manage Teams (v3.3.0)

Teams organize portal users into operational groups with dedicated team-level roles. Teams are tenant-scoped: each team belongs to exactly one tenant.

#### Create a Team

**Endpoint:** `POST /v1/teams`
**Required permission:** `teams:create`

```bash
curl -s -X POST "https://tiresias.network/v1/teams" \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SOC Tier-1",
    "description": "First-line security operations analysts"
  }'
```

**Response:**

```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "SOC Tier-1",
  "description": "First-line security operations analysts",
  "created_at": "2026-04-02T12:00:00Z",
  "member_count": 0
}
```

#### List Teams

**Endpoint:** `GET /v1/teams`
**Required permission:** `teams:read`

```bash
curl -s "https://tiresias.network/v1/teams" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

#### Update a Team

**Endpoint:** `PATCH /v1/teams/{team_id}`
**Required permission:** `teams:update`

```bash
curl -s -X PATCH "https://tiresias.network/v1/teams/$TEAM_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SOC Tier-1 (Primary)",
    "description": "Updated description"
  }'
```

#### Delete a Team

**Endpoint:** `DELETE /v1/teams/{team_id}`
**Required permission:** `teams:delete`

```bash
curl -s -X DELETE "https://tiresias.network/v1/teams/$TEAM_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

Deleting a team removes all member associations. Users are not deleted; they retain their portal-level role.

#### Add a Member to a Team

**Endpoint:** `POST /v1/teams/{team_id}/members`
**Required permission:** `teams:update`

```bash
curl -s -X POST "https://tiresias.network/v1/teams/$TEAM_ID/members" \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "11111111-2222-3333-4444-555555555555",
    "role": "analyst"
  }'
```

**Team role values:** `team_admin`, `analyst`, `member`

#### List Team Members

**Endpoint:** `GET /v1/teams/{team_id}/members`
**Required permission:** `teams:read`

```bash
curl -s "https://tiresias.network/v1/teams/$TEAM_ID/members" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

#### Update a Member's Team Role

**Endpoint:** `PATCH /v1/teams/{team_id}/members/{user_id}`
**Required permission:** `teams:update`

```bash
curl -s -X PATCH "https://tiresias.network/v1/teams/$TEAM_ID/members/$USER_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "team_admin"
  }'
```

#### Remove a Member from a Team

**Endpoint:** `DELETE /v1/teams/{team_id}/members/{user_id}`
**Required permission:** `teams:update`

```bash
curl -s -X DELETE "https://tiresias.network/v1/teams/$TEAM_ID/members/$USER_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

### 23.2.3 Manage Invitations (v3.3.0)

The invitation system enables administrators to pre-provision portal access for new users before they authenticate for the first time. Invitations specify the portal role, team assignment, and team role. When the invited user logs in via OIDC, JIT provisioning honors the invite and assigns the pre-configured access.

#### Create an Invitation

**Endpoint:** `POST /v1/invites`
**Required permission:** `invites:create`

```bash
curl -s -X POST "https://tiresias.network/v1/invites" \
  -H "X-SoulKey: $ADMIN_SOULKEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "analyst@acme.com",
    "portal_role": "operator",
    "team_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "team_role": "analyst"
  }'
```

**Request fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Email address of the invited user |
| `portal_role` | string | No | Pre-assigned portal role (default: `viewer`) |
| `team_id` | UUID | No | Team to add the user to on first login |
| `team_role` | string | No | Team role to assign (default: `member`) |

**Response:**

```json
{
  "id": "d4e5f6a7-b8c9-0123-def0-456789abcdef",
  "email": "analyst@acme.com",
  "portal_role": "operator",
  "team_id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "team_role": "analyst",
  "status": "pending",
  "invited_by": "11111111-2222-3333-4444-555555555555",
  "created_at": "2026-04-02T12:00:00Z",
  "expires_at": "2026-04-09T12:00:00Z"
}
```

#### List Invitations

**Endpoint:** `GET /v1/invites`
**Required permission:** `invites:read`

```bash
curl -s "https://tiresias.network/v1/invites" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

Returns all invitations for the tenant, including pending, accepted, expired, and revoked invites.

#### Revoke an Invitation

**Endpoint:** `DELETE /v1/invites/{invite_id}`
**Required permission:** `invites:delete`

```bash
curl -s -X DELETE "https://tiresias.network/v1/invites/$INVITE_ID" \
  -H "X-SoulKey: $ADMIN_SOULKEY"
```

Sets the invite status to `revoked`. If the user has not yet authenticated, the invite will no longer be honored during JIT provisioning.

#### Accept an Invitation

**Endpoint:** `POST /v1/invites/{invite_id}/accept`
**Required permission:** None (authenticated user, invite must match email)

```bash
curl -s -X POST "https://tiresias.network/v1/invites/$INVITE_ID/accept" \
  -H "Authorization: Bearer $SESSION_TOKEN"
```

This endpoint is called automatically during JIT provisioning. It can also be called manually by an authenticated user whose email matches the invite. Accepting an invite:

1. Sets the invite status to `accepted`.
2. Updates the user's portal role to the invite's `portal_role`.
3. Adds the user to the invite's `team_id` with the invite's `team_role`.
4. Sets the user's `primary_team_id` if not already set.

#### Invitation Lifecycle

```
  pending
    |
    +--- User logs in via OIDC --> accepted
    |
    +--- Admin revokes --> revoked
    |
    +--- Expiration time reached --> expired
```

**Default expiration:** 7 days from creation. Expired invitations are not honored during JIT provisioning.

### 23.3 Create Custom Roles

Tiresias supports custom roles by defining a custom permission set in the role's SoulKey metadata. While the four predefined roles cover most use cases, custom roles allow fine-grained access for specialized operational needs.

#### Define a Custom Permission Set

Create a SoulKey with an `admin_role` that matches one of the predefined roles, then restrict its effective permissions using the `permissions` metadata field:

```json
{
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "persona_id": "siem-integration",
  "label": "SIEM read-only integration key",
  "metadata": {
    "admin_role": "viewer",
    "permissions": [
      "audit:read",
      "detection:read",
      "analytics:read"
    ]
  }
}
```

This creates a key with Viewer-level access, but the `permissions` field documents the intended scope. The RBAC system evaluates against the `admin_role` value; the `permissions` metadata serves as an operational contract that can be enforced by a Policy Decision Point (PDP) in deployments with the SaaS hardening layer enabled.

#### Role Composition Patterns

| Pattern | Role | Custom Permissions | Use Case |
|---------|------|--------------------|----------|
| Read-only analyst | `viewer` | Default viewer permissions | SOC L1 analyst |
| Detection manager | `operator` | `detection:read`, `detection:update`, `policy:sync` | Detection engineering lead |
| Key administrator | `admin` | `keys:*`, `tenants:read` | Agent provisioning automation |
| Audit-only | `viewer` | `audit:read` | Compliance officer |

### 23.4 Audit Role Assignments

#### Tracking Privilege Changes

Every role assignment and modification is recorded in the audit log. The following events track RBAC changes:

| Event Type | Description | Logged Fields |
|------------|-------------|---------------|
| `key_issued` | New SoulKey created with admin_role | soulkey_id, persona_id, admin_role, tenant_id |
| `key_updated` | SoulKey metadata modified (including role changes) | soulkey_id, old_role, new_role, updated_by |
| `key_suspended` | SoulKey suspended (access revoked) | soulkey_id, suspended_by, reason |
| `key_reinstated` | SoulKey reinstated (access restored) | soulkey_id, reinstated_by |
| `key_revoked` | SoulKey permanently revoked | soulkey_id, revoked_by, revocation_reason |

#### Permission Denial Logging

When a request is denied due to insufficient permissions, the RBAC middleware logs a structured event at the `warning` level:

```json
{
  "event": "rbac.permission_denied",
  "soulkey_id": "11111111-2222-3333-4444-555555555555",
  "role": "operator",
  "required_permission": "keys:create"
}
```

These events should be forwarded to the SIEM and monitored for patterns that indicate:

- **Misconfigured automation.** A service account repeatedly hitting endpoints it is not authorized for indicates a configuration error.
- **Privilege probing.** A user systematically testing different endpoints may be attempting privilege escalation.
- **Role drift.** An account whose required permissions have changed but whose role has not been updated.

#### Periodic Access Review

Conduct periodic access reviews by querying the SoulKey inventory filtered by admin role:

```
GET /v1/soulauth/admin/keys?tenant_id={tenant_id}&status=active
```

For each active key, verify:

1. The `admin_role` in the metadata is appropriate for the key's `persona_id` and intended function.
2. The key's `last_used_at` timestamp is recent. Stale keys (no usage in 90+ days) should be investigated and potentially revoked.
3. The key's `expires_at` value is set. Keys without expiration dates represent an operational risk and should have rotation policies applied.

### 23.5 Configure API Key Permissions

#### Scope API Keys to Specific Roles

When issuing SoulKeys for API integrations, assign the minimum role required for the integration's function:

**SIEM integration (read-only):**

```json
{
  "persona_id": "splunk-forwarder",
  "label": "Splunk HEC integration - read-only audit and detection",
  "metadata": {
    "admin_role": "viewer",
    "integration_type": "siem",
    "allowed_endpoints": ["/v1/analytics", "/v1/detection"]
  }
}
```

**CI/CD policy deployment:**

```json
{
  "persona_id": "github-actions-policy-sync",
  "label": "GitHub Actions policy sync pipeline",
  "metadata": {
    "admin_role": "operator",
    "integration_type": "cicd",
    "allowed_endpoints": ["/v1/soulauth/admin/policy"]
  }
}
```

**Automated agent provisioning:**

```json
{
  "persona_id": "terraform-provisioner",
  "label": "Terraform agent provisioning",
  "metadata": {
    "admin_role": "admin",
    "integration_type": "iac",
    "allowed_endpoints": ["/v1/soulauth/admin/keys", "/v1/soulauth/admin/tenants"]
  }
}
```

#### API Key Rotation

All API keys should have an expiration date set at issuance. Configure rotation schedules appropriate to the key's risk level:

| Risk Level | Rotation Interval | Example |
|------------|-------------------|---------|
| High (Owner/Admin keys) | 90 days | Tenant administrator keys |
| Medium (Operator keys) | 180 days | CI/CD pipeline keys |
| Low (Viewer keys) | 365 days | SIEM integration keys |

Set the `expires_at` field during key issuance to enforce automatic expiration. The system rejects authentication attempts with expired keys, forcing key holders to request a new key before the expiration date.

---

## Chapter 24: Compliance and Regulatory

Tiresias provides built-in compliance reporting that maps platform security controls to major regulatory frameworks. The SoulWatch detection engine continuously collects evidence for control effectiveness, and the compliance reporting module generates framework-specific reports with quantified evidence for audit periods.

This chapter covers the compliance dashboard, automated report generation, data residency configuration, retention policies, privacy controls, and audit evidence export.

### 24.1 Compliance Dashboard

The compliance dashboard provides a real-time view of the platform's compliance posture across three supported frameworks:

| Framework | Coverage | Primary Controls |
|-----------|----------|-----------------|
| **SOC 2 Type II** | Trust Services Criteria CC6, CC7, CC8 | Logical access, system operations, change management |
| **ISO 27001** | Annex A.9 | Access control (business requirements, user management, system access) |
| **NIST 800-53** | AC, AU, IR families | Access control, audit, incident response |

The dashboard displays:

- **Control status indicators.** Each mapped control shows one of four statuses: `effective`, `compliant`, `implemented`, `monitoring_active`, `needs_review`, or `needs_improvement`.
- **Evidence counts.** Quantified evidence for each control (e.g., "47 credential-related detections in period").
- **Resolution rate.** Percentage of anomalies resolved or classified as false positives during the reporting period.
- **Period selector.** Configurable reporting period from 1 to 365 days.

#### SOC 2 Type II Control Mapping

The SoulWatch compliance engine maps Tiresias controls to SOC 2 Trust Services Criteria:

**CC6 -- Logical and Physical Access Controls:**

| Control ID | Control Name | Tiresias Evidence Source |
|------------|-------------|------------------------|
| CC6.1 | Access Security -- Authentication | Credential-related detection count from SoulWatch |
| CC6.2 | Access Security -- Authorization | Agent behavioral baselines tracked for access pattern analysis |
| CC6.6 | Access Restriction -- Least Privilege | Automated quarantine actions enforcing least privilege |

**CC7 -- System Operations:**

| Control ID | Control Name | Tiresias Evidence Source |
|------------|-------------|------------------------|
| CC7.2 | Monitoring -- Anomaly Detection | Total anomalies detected and resolution rate percentage |
| CC7.3 | Incident Response | Automated incident responses (quarantine actions executed) |
| CC7.4 | Incident Recovery | Anomaly resolution rate (effective if >= 80%) |

**CC8 -- Change Management:**

| Control ID | Control Name | Tiresias Evidence Source |
|------------|-------------|------------------------|
| CC8.1 | Detection Rule Management | Rule-based detection count demonstrating active change monitoring |

#### ISO 27001 Annex A.9 Control Mapping

| Control | Name | Tiresias Evidence Source |
|---------|------|------------------------|
| A9.1 | Business requirements of access control | Behavioral baselines enforce least-privilege access patterns |
| A9.2 | User access management | Real-time monitoring with anomaly detection counts |
| A9.4 | System and application access control | Sigma rule detections and automated quarantine responses |

#### NIST 800-53 Control Mapping

**AC -- Access Control Family:**

| Control | Name | Tiresias Evidence Source |
|---------|------|------------------------|
| AC-2 | Account Management | Automated agent identity lifecycle monitoring |
| AC-6 | Least Privilege | Behavioral baselines detect scope escalation (anomaly count) |
| AC-7 | Unsuccessful Logon Attempts | Credential stuffing detection (detection count) |
| AC-17 | Remote Access | Impossible travel detection and automated quarantines |

**AU -- Audit Family:**

| Control | Name | Tiresias Evidence Source |
|---------|------|------------------------|
| AU-6 | Audit Review, Analysis, and Reporting | Continuous real-time audit analysis via SoulWatch pipeline |

**IR -- Incident Response Family:**

| Control | Name | Tiresias Evidence Source |
|---------|------|------------------------|
| IR-4 | Incident Handling | Automated playbook execution with incident count |

### 24.2 Generate Compliance Reports

#### API Endpoints

Generate compliance reports via the SoulWatch reports API:

**Framework-specific compliance report:**

```
GET /watch/v1/reports/compliance?framework={framework}&days={days}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `framework` | string | Yes | Framework identifier: `soc2`, `iso27001`, or `nist` |
| `days` | integer | No | Reporting period in days (1-365, default: 30) |

**Example request:**

```
GET /watch/v1/reports/compliance?framework=soc2&days=90
```

**Example response (SOC 2):**

```json
{
  "framework": "SOC2 Type II",
  "period_days": 90,
  "generated_at": "2026-04-01T12:00:00Z",
  "controls": {
    "CC6_Logical_Access": {
      "description": "Logical and physical access controls",
      "controls": [
        {
          "id": "CC6.1",
          "name": "Access Security - Authentication",
          "evidence": "312 credential-related detections in period",
          "status": "effective"
        }
      ]
    }
  },
  "summary": {
    "total_anomalies": 1847,
    "total_detections": 312,
    "total_quarantines": 89,
    "tracked_agents": 142,
    "resolution_rate_pct": 94.2
  }
}
```

**Executive summary report:**

```
GET /watch/v1/reports/executive?days={days}
```

Returns a high-level security summary with severity breakdown and top anomaly types, suitable for management briefing:

```json
{
  "title": "SoulWatch Executive Security Report",
  "period_days": 30,
  "generated_at": "2026-04-01T12:00:00Z",
  "highlights": {
    "total_anomalies": 614,
    "total_detections": 103,
    "total_quarantines": 28,
    "critical_anomalies": 3,
    "high_anomalies": 17
  },
  "severity_breakdown": {
    "critical": 3,
    "high": 17,
    "medium": 124,
    "low": 341,
    "info": 129
  },
  "top_anomaly_types": {
    "rate_spike": 187,
    "unusual_resource": 143,
    "off_hours_activity": 98,
    "scope_escalation": 67,
    "credential_stuffing": 45
  }
}
```

#### Scheduled Report Generation

Configure recurring compliance reports for automated delivery:

1. Set up a cron job or scheduled task that calls the compliance report API.
2. Pipe the JSON response through a report formatter to produce PDF or HTML output.
3. Deliver the formatted report via the configured notification channels (email, Slack, webhook).

**Recommended schedule:**

| Report Type | Frequency | Audience |
|-------------|-----------|----------|
| Executive summary | Weekly | CISO, security leadership |
| SOC 2 compliance | Monthly | Compliance team, external auditors |
| ISO 27001 compliance | Monthly | GRC team |
| NIST 800-53 compliance | Quarterly | Federal/regulated environments |

### 24.3 Configure Data Residency

#### Geographic Constraints

For organizations subject to data sovereignty requirements (GDPR, CCPA, regional regulations), Tiresias supports configuring geographic constraints on data storage and processing.

**Deployment-level residency.** In self-hosted and hybrid deployments, data residency is enforced by the deployment location. Deploy Tiresias infrastructure within the required geographic region to ensure all data remains within jurisdictional boundaries.

**SaaS residency.** In SaaS deployments, configure the data residency region in the tenant metadata:

```json
{
  "metadata": {
    "data_residency": "eu-west-1",
    "data_residency_constraint": "strict"
  }
}
```

When `data_residency_constraint` is set to `strict`, the platform enforces that:

- Audit log storage is restricted to the specified region.
- Detection event processing occurs in the specified region.
- Compliance report generation runs within the specified region.
- No data is replicated to infrastructure outside the specified region.

#### Cross-Region Restrictions

When data residency is enabled, the following cross-region operations are blocked:

- Cross-region audit log replication
- Cross-region backup targets (backups must remain in the same region)
- Cross-region SIEM forwarding (unless the SIEM endpoint is within the allowed region)

### 24.4 Configure Data Retention for Compliance

#### Retention Policy Framework

Data retention policies determine how long different categories of data are preserved before archival or deletion. Tiresias supports per-tenant retention configuration that maps to regulatory requirements.

**Default retention periods by data category:**

| Data Category | Default Retention | Regulatory Driver | Notes |
|---------------|-------------------|-------------------|-------|
| Audit logs | 365 days | SOC 2, ISO 27001 | Tamper-evident hash chain preserved |
| Detection events | 180 days | NIST 800-53 AU-6 | Includes anomaly, detection, quarantine records |
| Agent baselines | Indefinite (active agents) | Operational | Purged on agent decommission |
| Session data | 90 days | GDPR, privacy | Includes login history, session tokens |
| Compliance reports | 730 days (2 years) | SOC 2 Type II | Generated reports archived for multi-year audits |

#### Configure Per-Tenant Retention

Override default retention periods in the tenant metadata:

```json
{
  "metadata": {
    "retention_audit_days": 730,
    "retention_detection_days": 365,
    "retention_session_days": 30,
    "retention_report_days": 1825
  }
}
```

**Regulatory mapping guidance:**

| Regulation | Minimum Retention | Recommended Setting |
|------------|-------------------|-------------------|
| SOC 2 Type II | 12 months (audit period) | `retention_audit_days: 730` |
| ISO 27001 | 3 years (A.12.4.1) | `retention_audit_days: 1095` |
| GDPR | As short as possible (data minimization) | `retention_session_days: 30` |
| HIPAA | 6 years | `retention_audit_days: 2190` |
| PCI DSS | 1 year (accessible), 7 years (total) | `retention_audit_days: 2555` |
| NIST 800-53 AU-11 | Organization-defined | Configure per policy |

#### Retention Enforcement

The retention scheduler runs periodically and executes the following actions:

1. **Soft delete.** Records past their retention period are marked with a `deleted_at` timestamp. They are excluded from queries but remain in the database.
2. **Hard delete.** Records with `deleted_at` older than a configurable grace period (default: 30 days) are permanently removed from the database.
3. **Crypto-shred.** For tenants using envelope encryption, the retention scheduler verifies that the DEK is still valid before hard deletion. If the DEK has been destroyed (tenant offboarded), the encrypted data is cryptographically inaccessible and is hard-deleted immediately.

### 24.5 Privacy Controls

#### Data Minimization

Tiresias collects only the data necessary for security monitoring and enforcement. The following data minimization controls are in place:

| Control | Implementation |
|---------|---------------|
| Prompt/completion storage | Optional -- can be disabled per-tenant. When disabled, only metadata (timestamps, agent ID, resource, action) is stored |
| PII in audit logs | SoulKey raw values are never stored. Only SHA-512 hashes are persisted |
| Session data | Session tokens are hashed before storage. Raw tokens exist only in transit |
| IP addresses | Stored with audit events for forensic purposes. Can be anonymized per-tenant |

#### Purpose Limitation

All collected data is used exclusively for the following purposes:

1. Security monitoring and threat detection
2. Access control enforcement
3. Compliance reporting and audit evidence
4. Incident investigation and forensics

Data is not used for advertising, profiling, or any purpose outside security operations.

#### Right to Erasure

Tiresias supports right-to-erasure requests through the tenant offboarding cascade (Section 21.5). The offboarding process:

1. Revokes all SoulKeys (removes authentication capability)
2. Destroys the wrapped DEK (crypto-shreds encrypted content)
3. NULLs all encrypted fields (removes plaintext access)
4. Deactivates the tenant (prevents further data creation)
5. Retention scheduler hard-deletes remaining records after the configured grace period

For individual user erasure (within an active tenant), administrators can:

1. Deactivate the user's SSO account in the IdP (prevents re-authentication)
2. Revoke the user's SoulKeys
3. Request erasure of the user's session records via the admin API

### 24.6 Export Audit Evidence Packages

#### Evidence Collection

The audit evidence export feature packages logs, configurations, and policies into a single archive suitable for external auditors. This feature requires the Enterprise tier or higher (`audit_export` feature gate).

**Export contents:**

| Component | Description | Format |
|-----------|-------------|--------|
| Audit log extract | All audit events for the specified period | JSON Lines (.jsonl) |
| Hash chain verification | Integrity verification results for the audit hash chain | JSON |
| Detection summary | Anomaly, detection, and quarantine statistics | JSON |
| Policy snapshot | Active policies at export time | YAML |
| Compliance report | Framework-specific compliance report for the period | JSON |
| Configuration snapshot | Non-secret configuration parameters | JSON |
| Agent inventory | Active agents with roles and last-activity timestamps | JSON |

#### Generate an Evidence Package

Export an evidence package for a specific audit period:

```
POST /v1/soulauth/admin/audit/export
```

**Request body:**

```json
{
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "start_date": "2025-10-01T00:00:00Z",
  "end_date": "2026-04-01T00:00:00Z",
  "frameworks": ["soc2", "iso27001"],
  "include_policies": true,
  "include_agent_inventory": true,
  "include_hash_verification": true
}
```

**Required permission:** `audit:read` (any role)

The export is generated asynchronously and delivered to the configured notification channel or made available for download via the Portal.

#### Evidence Package Integrity

Each evidence package includes a manifest file with SHA-256 checksums for every included file. The manifest itself is signed with the platform's signing key, allowing auditors to verify that the package has not been modified after export.

**Manifest structure:**

```json
{
  "export_id": "export-20260401-acme",
  "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "generated_at": "2026-04-01T15:30:00Z",
  "period": {
    "start": "2025-10-01T00:00:00Z",
    "end": "2026-04-01T00:00:00Z"
  },
  "files": [
    {
      "name": "audit_log.jsonl",
      "sha256": "a3f2b1c4d5e6f7...",
      "records": 48291
    },
    {
      "name": "compliance_soc2.json",
      "sha256": "b4c3d2e1f0a9b8...",
      "records": 1
    }
  ],
  "signature": "MEUCIQDx..."
}
```

#### Auditor Workflow

The recommended workflow for external auditors receiving a Tiresias evidence package:

1. **Verify manifest integrity.** Validate the manifest signature against the platform's public key.
2. **Verify file checksums.** Compare SHA-256 hashes of each included file against the manifest values.
3. **Review audit log completeness.** Check for gaps in the hash chain by examining the hash chain verification results.
4. **Evaluate control effectiveness.** Review the compliance report for each requested framework. Controls with `needs_review` or `needs_improvement` status require additional investigation.
5. **Sample test.** Select random audit log entries and verify they correspond to actual platform events by cross-referencing with agent activity and detection records.

---

## Summary

Part VII covers the enterprise features that enable Tiresias deployments in regulated, multi-organization, and large-scale environments:

- **Chapter 21** describes the multi-tenant architecture including tenant lifecycle (create, suspend, offboard), namespace isolation at the database, API, and encryption layers, tier-based feature gating, and quota management.
- **Chapter 22** covers SSO integration via OIDC with PKCE, IdP configuration, domain-based routing, group-to-role mapping with automatic re-evaluation on login, and troubleshooting common authentication failures.
- **Chapter 23** details the hierarchical RBAC model with four predefined roles, the permission matrix, authentication fallback chain, API key permission scoping, and audit of privilege changes.
- **Chapter 24** describes compliance reporting for SOC 2 Type II, ISO 27001, and NIST 800-53, data residency controls, retention policy configuration, privacy controls, and audit evidence package export with integrity verification.
