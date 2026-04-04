# Part X: Reference

> **Tiresias Administration Guide v3.0**
> **Classification:** Customer-Facing
> **Audience:** Security administrators, SOC managers, MSSPs, platform operators

---

## Chapter 31: API Reference

This chapter provides the complete endpoint catalog for all Tiresias services. All API endpoints use JSON request and response bodies unless otherwise noted. All timestamps use ISO 8601 format in UTC.

### 31.1 API Authentication

Tiresias uses a two-stage authentication model for API access.

**Stage 1: SoulKey Authentication.** Every agent is issued a SoulKey -- a high-entropy credential displayed once at creation time. The raw SoulKey value is hashed with SHA-512 before storage; the platform never stores the plaintext credential. Agents present their SoulKey in the `X-SoulKey` header on every request.

**Stage 2: Capability Token Acquisition.** After SoulKey authentication, agents call the token endpoint to receive a short-lived ES256-signed JWT (capability token). This token encodes the agent's identity, tenant, scopes, and expiry. Subsequent API calls present this token in the `Authorization: Bearer <token>` header.

**Portal Authentication.** Human administrators authenticate via OIDC (Google SSO, Okta, Azure AD) or local/LDAP credentials. Portal sessions use HttpOnly cookies (`tiresias_oidc_session`, `tiresias_oidc_data`). The Portal middleware injects `X-SoulKey` headers on backend API calls.

**Inter-Service Authentication.** Internal service-to-service calls use the `X-Internal-Key` header with a shared secret configured via the `INTERNAL_API_KEY` environment variable.

**Request Signing Example:**

```
GET /v1/auth/me HTTP/1.1
Host: api.tiresias.network
X-SoulKey: sk_live_a1b2c3d4e5f6...
```

```
POST /v1/auth/token HTTP/1.1
Host: api.tiresias.network
X-SoulKey: sk_live_a1b2c3d4e5f6...
Content-Type: application/json

{"scopes": ["agents:read", "analytics:read"]}
```

### 31.2 SoulAuth API

SoulAuth is the core identity and authorization engine. Base URL: `https://tiresias-soulauth-<project>.run.app` (SaaS) or `http://soulauth:8000` (Docker Compose).

#### Health and System

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Service health check. Returns `{"status": "healthy"}`. |
| `GET` | `/metrics` | Internal Key | Prometheus metrics endpoint. |

#### Authentication -- Core (`/v1/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/auth/me` | SoulKey | Return the authenticated agent's identity, scopes, and tenant. |
| `POST` | `/v1/auth/token` | SoulKey | Issue an ES256-signed capability token with requested scopes. |
| `GET` | `/v1/auth/verify` | Bearer Token | Validate a capability token and return decoded claims. |

#### Authentication -- OIDC (`/v1/auth/oidc`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/auth/oidc/authorize` | None | Initiate OIDC authorization flow. Returns `authorization_url` and `state`. |
| `POST` | `/v1/auth/oidc/callback` | None | Handle OIDC callback with authorization code. Exchanges code for tokens and creates session. |
| `DELETE` | `/v1/auth/oidc/session` | Session Cookie | Revoke the current OIDC session. |
| `GET` | `/v1/auth/oidc/userinfo` | Session Cookie | Return current user profile from OIDC session. |

#### Authentication -- Local (`/v1/auth/local`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/auth/local/session/verify` | Session Cookie | Verify the current local auth session. |
| `POST` | `/v1/auth/local/login` | None | Authenticate with email and password. Returns session token. |
| `POST` | `/v1/auth/local/register` | Admin | Register a new local user account. |
| `PUT` | `/v1/auth/local/password` | Session Cookie | Change the current user's password. |

#### Authentication -- LDAP (`/v1/auth/ldap`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/auth/ldap/login` | None | Authenticate against configured LDAP directory. Returns session token with mapped roles. |
| `GET` | `/v1/auth/ldap/groups` | Admin | List LDAP group-to-role mappings. |

#### Admin API (`/v1/soulauth/admin`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/soulauth/admin/agents` | `keys:create` | Register a new agent. Returns SoulKey (one-time display). |
| `GET` | `/v1/soulauth/admin/agents` | `keys:read` | List all registered agents with filtering and pagination. |
| `GET` | `/v1/soulauth/admin/agents/{id}` | `keys:read` | Get agent details by ID. |
| `PATCH` | `/v1/soulauth/admin/agents/{id}` | `keys:write` | Update agent metadata, scopes, or status. |
| `POST` | `/v1/soulauth/admin/agents/{id}/suspend` | `keys:write` | Suspend an agent's SoulKey. Blocks all authentication. |
| `POST` | `/v1/soulauth/admin/agents/{id}/reinstate` | `keys:write` | Reinstate a suspended agent. |
| `POST` | `/v1/soulauth/admin/agents/{id}/rotate` | `keys:write` | Rotate an agent's SoulKey. Invalidates old key, returns new key (one-time display). |
| `GET` | `/v1/soulauth/admin/audit` | `audit:read` | Query the tamper-evident audit log. Supports filtering by agent, time range, and event type. |
| `GET` | `/v1/soulauth/admin/audit/chain/verify` | `audit:read` | Verify SHA-256 hash chain integrity of audit records. |
| `POST` | `/v1/soulauth/admin/policies/sync` | `policies:write` | Trigger policy sync from the configured git repository. |
| `POST` | `/v1/soulauth/admin/policies/evaluate` | `policies:read` | Dry-run policy evaluation against a synthetic request. |
| `POST` | `/v1/soulauth/admin/rbac/assign` | `admin:*` | Assign an RBAC role to a portal user. |
| `POST` | `/v1/soulauth/admin/rbac/revoke` | `admin:*` | Revoke an RBAC role from a portal user. |
| `GET` | `/v1/soulauth/admin/rbac/roles` | `admin:read` | List all defined RBAC roles and their permissions. |
| `GET` | `/v1/soulauth/admin/license` | `admin:read` | Return current license status, tier, and expiry. |
| `POST` | `/v1/soulauth/admin/license/validate` | `admin:read` | Force license re-validation. |
| `POST` | `/v1/soulauth/admin/chatbot/config` | `admin:*` | Configure the AI support chatbot (OpenRouter model, system prompt). |

#### User Management (`/v1/users`) -- v3.3.0

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/users` | `users:read` | List all portal users in the tenant. Returns user profile, portal role, team memberships, account admin status, and last login. |
| `GET` | `/v1/users/{user_id}` | `users:read` | Get user details by ID including team memberships and admin designations. |
| `PATCH` | `/v1/users/{user_id}` | `users:update` | Update user properties: `admin_role`, `is_account_admin`, `is_secondary_admin`, `primary_team_id`, `status`. |
| `DELETE` | `/v1/users/{user_id}` | `users:delete` | Delete a portal user. Removes all team memberships and revokes active sessions. Audit trail preserved. |

#### Team Management (`/v1/teams`) -- v3.3.0

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/teams` | `teams:read` | List all teams in the tenant with member counts and descriptions. |
| `POST` | `/v1/teams` | `teams:create` | Create a new team. Required fields: `name`. Optional: `description`. |
| `GET` | `/v1/teams/{team_id}` | `teams:read` | Get team details including member list with roles. |
| `PATCH` | `/v1/teams/{team_id}` | `teams:update` | Update team name or description. |
| `DELETE` | `/v1/teams/{team_id}` | `teams:delete` | Delete a team. Removes all member associations; users retain portal roles. |

#### Team Member Management (`/v1/teams/{team_id}/members`) -- v3.3.0

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/teams/{team_id}/members` | `teams:read` | List all members of a team with their team roles. |
| `POST` | `/v1/teams/{team_id}/members` | `teams:update` | Add a user to a team. Required: `user_id`, `role` (`team_admin`, `analyst`, `member`). |
| `PATCH` | `/v1/teams/{team_id}/members/{user_id}` | `teams:update` | Update a member's team role. |
| `DELETE` | `/v1/teams/{team_id}/members/{user_id}` | `teams:update` | Remove a member from a team. |

#### Invitation Management (`/v1/invites`) -- v3.3.0

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/invites` | `invites:read` | List all invitations in the tenant (pending, accepted, expired, revoked). |
| `POST` | `/v1/invites` | `invites:create` | Create an invitation. Required: `email`. Optional: `portal_role` (default `viewer`), `team_id`, `team_role` (default `member`). Expires in 7 days. |
| `DELETE` | `/v1/invites/{invite_id}` | `invites:delete` | Revoke a pending invitation. Sets status to `revoked`. |
| `POST` | `/v1/invites/{invite_id}/accept` | Session (email must match) | Accept an invitation. Updates user's portal role and team membership per the invite. Called automatically during JIT provisioning. |

#### Tenant Management (`/v1/tenant`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/tenant` | `admin:read` | Get tenant configuration and feature flags. |
| `PUT` | `/v1/tenant` | `admin:write` | Update tenant configuration. |

#### Identity Provider Management (`/v1/idp`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/idp` | `keys:*` | Create an OIDC/SAML IdP configuration. |
| `GET` | `/v1/idp` | `keys:read` | List all IdP configurations for the tenant. |
| `GET` | `/v1/idp/{config_id}` | `keys:read` | Get an IdP configuration by ID. |
| `PUT` | `/v1/idp/{config_id}` | `keys:*` | Update an IdP configuration. |
| `DELETE` | `/v1/idp/{config_id}` | `keys:*` | Delete an IdP configuration. |
| `POST` | `/v1/idp/{config_id}/test` | `keys:read` | Test IdP connectivity and metadata retrieval. |

#### Analytics (`/v1/analytics`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/analytics/anomalies` | `analytics:read` | List detected anomalies with filtering and pagination. |
| `GET` | `/v1/analytics/baseline/{soulkey_id}` | `analytics:read` | Get behavioral baseline for a specific agent. |
| `GET` | `/v1/analytics/dashboard` | `analytics:read` | Analytics dashboard summary with aggregated metrics. |
| `POST` | `/v1/analytics/baseline/rebuild` | `analytics:write` | Rebuild all agent baselines. |

#### Detection (`/v1/detection`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/detection/rules` | `detection:read` | List Sigma detection rules. |
| `POST` | `/v1/detection/rules` | `detection:write` | Create a new Sigma detection rule. |
| `GET` | `/v1/detection/rules/{rule_id}` | `detection:read` | Get detection rule details. |
| `PUT` | `/v1/detection/rules/{rule_id}` | `detection:write` | Update a detection rule. |
| `DELETE` | `/v1/detection/rules/{rule_id}` | `detection:write` | Delete a detection rule. |
| `POST` | `/v1/detection/rules/{rule_id}/test` | `detection:write` | Test a rule against a sample event. Returns match result and matched fields. |
| `GET` | `/v1/detection/playbooks` | `detection:read` | List response playbooks. |
| `POST` | `/v1/detection/playbooks` | `detection:write` | Create a response playbook. |
| `GET` | `/v1/detection/matches` | `detection:read` | Get recent detection matches. |
| `GET` | `/v1/detection/status` | `detection:read` | Get detection engine status (loaded rules, engine uptime, last evaluation). |

#### Enforcement (`/v1/enforcement`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/enforcement/quarantine` | `enforcement:read` | List all quarantined agents. |
| `POST` | `/v1/enforcement/quarantine/{soulkey_id}` | `enforcement:write` | Quarantine an agent by SoulKey ID. |
| `POST` | `/v1/enforcement/quarantine/{soulkey_id}/release` | `enforcement:write` | Release an agent from quarantine. |
| `GET` | `/v1/enforcement/quarantine/policies` | `enforcement:read` | List quarantine policies (legacy). |
| `GET` | `/v1/enforcement/policies` | `enforcement:read` | List quarantine policy configurations. |
| `POST` | `/v1/enforcement/policies` | `enforcement:write` | Create a quarantine policy. |
| `PATCH` | `/v1/enforcement/policies/{policy_id}` | `enforcement:write` | Update a quarantine policy. |
| `DELETE` | `/v1/enforcement/policies/{policy_id}` | `enforcement:write` | Delete a quarantine policy. |

#### SIEM Integration (`/v1/siem`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/siem/destinations` | `admin:write` | Create a SIEM destination (Splunk, Elastic, Syslog, Webhook, Azure Sentinel). |
| `GET` | `/v1/siem/destinations` | `admin:read` | List configured SIEM destinations. |
| `GET` | `/v1/siem/destinations/{id}` | `admin:read` | Get a SIEM destination by ID. |
| `PUT` | `/v1/siem/destinations/{id}` | `admin:write` | Update a SIEM destination configuration. |
| `DELETE` | `/v1/siem/destinations/{id}` | `admin:write` | Delete a SIEM destination. |
| `GET` | `/v1/siem/destinations/{id}/health` | `admin:read` | Check SIEM destination connectivity and delivery health. |

#### Notifications (`/v1/notifications`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/notifications/channels` | `admin:write` | Create a notification channel (Slack, PagerDuty, Email, Teams, OpsGenie, Webhook). |
| `GET` | `/v1/notifications/channels` | `admin:read` | List notification channels. |
| `GET` | `/v1/notifications/channels/{id}` | `admin:read` | Get notification channel by ID. |
| `PUT` | `/v1/notifications/channels/{id}` | `admin:write` | Update a notification channel. |
| `DELETE` | `/v1/notifications/channels/{id}` | `admin:write` | Delete a notification channel. |
| `POST` | `/v1/notifications/channels/{id}/test` | `admin:write` | Send a test notification to the channel. |

#### Billing (`/v1/billing`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/billing/checkout` | Session | Create a Stripe checkout session for subscription upgrade. |
| `POST` | `/v1/billing/webhook` | Stripe Signature | Stripe webhook receiver for payment events. |
| `GET` | `/v1/billing/portal` | Session | Generate a Stripe customer portal URL. |

#### Usage and Limits (`/v1/usage`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/usage/summary` | `admin:read` | Current usage metrics (agents, requests, storage) vs. tier limits. |
| `GET` | `/v1/usage/history` | `admin:read` | Historical usage data for billing and capacity planning. |

#### SaaS Tenant Management (`/v1/saas`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/saas/tenants` | `mssp:write` | Provision a new SaaS tenant. Accepts optional `parent_tenant_id` to place the tenant in the hierarchy. |
| `GET` | `/v1/saas/tenants` | `mssp:read` | List all managed SaaS tenants. |
| `POST` | `/v1/saas/tenants/{id}/suspend` | `mssp:write` | Suspend a tenant. |
| `POST` | `/v1/saas/tenants/{id}/activate` | `mssp:write` | Activate or reactivate a tenant. |
| `POST` | `/v1/saas/tenants/{id}/offboard` | `mssp:write` | Offboard a tenant (data export, retention hold, access revocation). |

#### SaaS Admin Hierarchy API (`/v1/saas/admin`) -- v3.2.0

These endpoints are restricted to the SaaS master tier (`tier = saas`). They provide platform-wide tenant hierarchy management.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/saas/admin/tenants` | `saas:admin` | List all tenants across the platform with hierarchy metadata (`parent_tenant_id`, `hierarchy_depth`, child count). Supports filtering by `tier`, `status`, `depth`, and `parent_tenant_id`. |
| `POST` | `/v1/saas/admin/tenants` | `saas:admin` | Create a tenant at any hierarchy level. Required fields: `name`, `slug`. Optional: `tier` (default `community`), `parent_tenant_id`, `metadata`. Enforces tier creation matrix and max depth of 3. |
| `GET` | `/v1/saas/admin/tenants/{id}/subtree` | `saas:admin` | Retrieve the full subtree rooted at the specified tenant. Returns a nested JSON tree with each node containing tenant summary, child count, and aggregate metrics (total agents, total requests). |
| `PATCH` | `/v1/saas/admin/tenants/{id}/reparent` | `saas:admin` | Move a tenant to a different parent. Request body: `{"new_parent_tenant_id": "<uuid>"}`. Validates that the move does not violate depth constraints or create circular references. Returns the updated tenant with new `hierarchy_depth`. |
| `GET` | `/v1/saas/admin/hierarchy/stats` | `saas:admin` | Platform-wide hierarchy statistics: tenant count by depth level, tier distribution per depth, orphan count, and average subtree depth. |
| `POST` | `/v1/saas/admin/hierarchy/validate` | `saas:admin` | Run hierarchy integrity validation. Checks for: orphaned tenants (non-null `parent_tenant_id` referencing a missing tenant), depth constraint violations (depth > 3), circular references, and tier constraint violations. Returns a list of findings with severity and suggested remediation. |

#### MSSP Operations (`/v1/mssp`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/mssp/dashboard` | `mssp:read` | Aggregated multi-customer security dashboard. |
| `POST` | `/v1/mssp/tenants` | `mssp:write` | Onboard a new customer tenant with tier assignment. |
| `GET` | `/v1/mssp/tenants` | `mssp:read` | List managed customer tenants with status. |
| `GET` | `/v1/mssp/tenants/{id}` | `mssp:read` | Get customer tenant details and health. |
| `GET` | `/v1/mssp/tenants/{id}/alerts` | `mssp:read` | Get alerts for a specific customer tenant. |
| `POST` | `/v1/mssp/tenants/{id}/detections/push` | `mssp:write` | Push detection rules to a customer tenant. |

#### Partner Channel (`/v1/partner`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/partner/register` | Session | Register as a partner. |
| `POST` | `/v1/partner/connect` | Session | Connect a partner referral. |
| `GET` | `/v1/partner/dashboard` | `partner:read` | Partner dashboard with referral metrics and revenue. |
| `GET` | `/v1/partner/referrals` | `partner:read` | List partner referrals and their statuses. |
| `POST` | `/v1/partner/promos` | `partner:write` | Create a promotional code. |
| `GET` | `/v1/partner/promos` | `partner:read` | List promotional codes. |
| `POST` | `/v1/partner/payouts/request` | `partner:write` | Request a partner payout. |
| `GET` | `/v1/partner/payouts` | `partner:read` | Get partner payout history. |

#### Investigation (`/v1/investigation`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/investigation/access/request` | `admin:write` | Request access to tenant investigation data. |
| `POST` | `/v1/investigation/access/grant` | `admin:*` | Grant investigation access request. |
| `POST` | `/v1/investigation/query` | `investigation:read` | Query investigation data within granted access window. |
| `POST` | `/v1/investigation/export` | `investigation:read` | Export investigation data package. |

#### Contracts (`/v1/contracts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/contracts/submit` | Session | Submit a proposed contract version. |
| `GET` | `/v1/contracts/latest` | Session | Get the latest contract version. |
| `GET` | `/v1/contracts/chain/verify` | Session | Verify contract chain integrity. |
| `POST` | `/v1/contracts/sign` | Session | Sign the agreed contract. |
| `POST` | `/v1/contracts/discount` | Session | Generate a discount code from a signed contract. |

#### Aletheia CoT (`/v1/aletheia/cot`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/aletheia/cot/chain` | `aletheia:read` | List CoT chain entries with filtering by agent, time range. |
| `GET` | `/v1/aletheia/cot/chain/{request_id}` | `aletheia:read` | Get full CoT content for a specific request. |
| `POST` | `/v1/aletheia/cot/verify` | `aletheia:read` | Verify CoT hash chain integrity for a set of entries. |
| `POST` | `/v1/aletheia/cot/export` | `aletheia:read` | Export CoT chain with integrity proof for audit package. |

#### PRH -- Post-Response Handling (`/v1/prh`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/prh/config` | Session | Get PRH configuration. |
| `PUT` | `/v1/prh/config` | `admin:write` | Update PRH configuration. |
| `GET` | `/v1/prh/recent` | Session | Get recent PRH scores. |
| `GET` | `/v1/prh/stats` | Session | Get PRH aggregate statistics. |
| `POST` | `/v1/prh/analyze` | Session | On-demand prompt analysis. |

#### Trial and Waitlist

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/trial/start` | None | Start a trial account. Sends verification email via Resend. |
| `POST` | `/v1/trial/verify` | None | Verify trial email address with token. |
| `POST` | `/v1/waitlist/join` | None | Join the waitlist for a subscription tier. |

#### Support Chatbot (`/v1/support`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/support/chat` | Session | Send a message to the AI support chatbot. Streams response via SSE. |
| `GET` | `/v1/support/chat/history` | Session | List chat sessions. |
| `GET` | `/v1/support/chat/history/{session_id}` | Session | Get chat history for a session. |

### 31.3 SoulWatch API

SoulWatch provides behavioral analytics, anomaly detection, and threat response. Base URL: `https://tiresias-soulwatch-<project>.run.app` (SaaS) or `http://soulwatch:8001` (Docker Compose).

#### Health and System

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Service health check. |
| `GET` | `/metrics` | Internal Key | Prometheus metrics endpoint. |

#### Dashboard (`/watch/v1/dashboard`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/watch/v1/dashboard` | Internal Key | Full dashboard summary: anomaly counts, severity breakdown, engine status. |
| `GET` | `/watch/v1/dashboard/timeline` | Internal Key | Event timeline with bucketed counts by severity and time window. |
| `GET` | `/watch/v1/dashboard/llm` | Internal Key | LLM-specific analytics: model usage, token counts, provider breakdown. |
| `GET` | `/watch/v1/dashboard/agents` | Internal Key | Per-agent risk scores and anomaly counts. |

#### Analytics (`/watch/v1`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/watch/v1/anomalies` | Internal Key | List anomalies with pagination, filtering by severity, agent, type, status. |
| `GET` | `/watch/v1/anomalies/stats` | Internal Key | Aggregate anomaly statistics: counts by type, severity distribution, trending. |
| `GET` | `/watch/v1/anomalies/{anomaly_id}` | Internal Key | Get anomaly details including context, matched rules, and baseline deviation. |
| `PATCH` | `/watch/v1/anomalies/{anomaly_id}` | Internal Key | Update anomaly status (acknowledged, investigating, resolved, false_positive). |
| `GET` | `/watch/v1/baselines` | Internal Key | List all agent behavioral baselines. |
| `GET` | `/watch/v1/baselines/{soulkey_id}` | Internal Key | Get baseline for a specific agent. |
| `POST` | `/watch/v1/baselines/rebuild` | Internal Key | Rebuild all baselines from historical data. |
| `POST` | `/watch/v1/baselines/{soulkey_id}/rebuild` | Internal Key | Rebuild baseline for a specific agent. |

#### Detection (`/watch/v1`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/watch/v1/rules` | Internal Key | List Sigma detection rules loaded in the engine. |
| `POST` | `/watch/v1/rules` | Internal Key | Create a new Sigma detection rule. |
| `GET` | `/watch/v1/rules/{rule_id}` | Internal Key | Get rule details and match history. |
| `PUT` | `/watch/v1/rules/{rule_id}` | Internal Key | Update a detection rule. |
| `DELETE` | `/watch/v1/rules/{rule_id}` | Internal Key | Delete a detection rule. |
| `POST` | `/watch/v1/rules/{rule_id}/test` | Internal Key | Test a rule against a sample event. |
| `GET` | `/watch/v1/detections` | Internal Key | List detection matches with filtering by rule, severity, time range. |
| `GET` | `/watch/v1/playbooks` | Internal Key | List response playbooks. |
| `POST` | `/watch/v1/playbooks` | Internal Key | Create a response playbook. |
| `GET` | `/watch/v1/playbooks/{playbook_id}` | Internal Key | Get playbook details. |
| `PUT` | `/watch/v1/playbooks/{playbook_id}` | Internal Key | Update a playbook. |
| `GET` | `/watch/v1/playbooks/executions` | Internal Key | List recent playbook executions with outcomes. |

#### Enforcement (`/watch/v1`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/watch/v1/quarantines` | Internal Key | List all quarantine records. |
| `POST` | `/watch/v1/quarantines` | Internal Key | Create a quarantine record (manual or playbook-triggered). |
| `POST` | `/watch/v1/quarantines/{id}/release` | Internal Key | Release an agent from quarantine. |
| `POST` | `/watch/v1/quarantines/{id}/approve` | Internal Key | Approve a quarantine action (for approval-required policies). |

#### Integrations (`/watch/v1/integrations`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/watch/v1/integrations` | Internal Key | List configured SIEM integrations and their status. |
| `GET` | `/watch/v1/integrations/health` | Internal Key | Get integration health: delivery success rate, latency, queue depth. |
| `GET` | `/watch/v1/integrations/dlq` | Internal Key | Query the dead letter queue for failed SIEM deliveries. |
| `GET` | `/watch/v1/integrations/syslog` | Internal Key | Get syslog configuration. |
| `PUT` | `/watch/v1/integrations/syslog` | Internal Key | Update syslog configuration. |
| `POST` | `/watch/v1/integrations/syslog/test` | Internal Key | Send a test syslog message to validate connectivity. |
| `DELETE` | `/watch/v1/integrations/syslog` | Internal Key | Delete syslog configuration. |

#### Reports (`/watch/v1/reports`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/watch/v1/reports/compliance` | Internal Key | Generate a compliance posture report. |
| `GET` | `/watch/v1/reports/executive` | Internal Key | Generate an executive security summary report. |

#### Aletheia -- Tool Invocations (`/watch/v1/aletheia/tools`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/watch/v1/aletheia/tools/invocations` | `aletheia:read` | List tool invocations with filtering by agent, tool, time range, risk. |
| `GET` | `/watch/v1/aletheia/tools/invocations/{id}` | `aletheia:read` | Get tool invocation details with input/output and risk assessment. |
| `GET` | `/watch/v1/aletheia/tools/summary` | `aletheia:read` | Aggregated tool usage summary: call counts, risk distribution, top tools. |
| `GET` | `/watch/v1/aletheia/tools/timeline` | `aletheia:read` | Tool invocation timeline chart data. |

#### Aletheia -- CoT Chain (`/watch/v1/aletheia/cot`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/watch/v1/aletheia/cot/chain` | `aletheia:read` | List CoT hash chain entries. |
| `GET` | `/watch/v1/aletheia/cot/chain/{request_id}/content` | `aletheia:read` | Get full chain-of-thought content for a request. |
| `POST` | `/watch/v1/aletheia/cot/chain/verify` | `aletheia:read` | Verify CoT chain integrity. Returns gap and tamper indicators. |
| `POST` | `/watch/v1/aletheia/cot/chain/proof` | `aletheia:read` | Generate a cryptographic proof for CoT chain segment. |

#### WebSocket

| Protocol | Path | Auth | Description |
|----------|------|------|-------------|
| `WS` | `/watch/v1/ws` | Internal Key | Real-time event stream. Pushes anomalies, detections, and quarantine actions to connected clients. |

### 31.4 SoulGate API

SoulGate provides API gateway security with rate limiting, access control, prompt injection detection, and circuit breaker protection. Base URL: `https://tiresias-soulgate-<project>.run.app` (SaaS) or `http://soulgate:8002` (Docker Compose).

#### Health and System

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Service health check. |
| `GET` | `/metrics` | Internal Key | Prometheus metrics endpoint. |

#### Proxy

SoulGate acts as a reverse proxy. Requests to paths not matching the admin API prefixes are forwarded through the seven-stage security pipeline to the configured upstream service.

#### API Keys (`/gate/v1/apikeys`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/gate/v1/apikeys` | SoulKey | List API keys for the authenticated tenant. |
| `POST` | `/gate/v1/apikeys` | SoulKey | Issue a new API key. Returns the key value (one-time display). |
| `POST` | `/gate/v1/apikeys/{key_id}/rotate` | SoulKey | Rotate an API key. Invalidates old key, returns new key. |
| `DELETE` | `/gate/v1/apikeys/{key_id}` | SoulKey | Revoke an API key. |
| `GET` | `/gate/v1/apikeys/stats` | SoulKey | Get API key usage statistics. |

#### Rate Limits (`/gate/v1/ratelimits`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/gate/v1/ratelimits` | SoulKey | List rate limit policies. |
| `POST` | `/gate/v1/ratelimits` | SoulKey | Create a rate limit policy with scope (global, per-tenant, per-agent, per-endpoint). |
| `PUT` | `/gate/v1/ratelimits/{policy_id}` | SoulKey | Update a rate limit policy. |
| `DELETE` | `/gate/v1/ratelimits/{policy_id}` | SoulKey | Delete a rate limit policy. |

#### Access Rules (`/gate/v1/access`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/gate/v1/access` | SoulKey | List IP/geographic access rules (allow/deny). |
| `POST` | `/gate/v1/access` | SoulKey | Create an access rule (IP range, CIDR, country code, or ASN). |
| `PUT` | `/gate/v1/access/{rule_id}` | SoulKey | Update an access rule. |
| `DELETE` | `/gate/v1/access/{rule_id}` | SoulKey | Delete an access rule. |

#### Circuit Breakers (`/gate/v1/circuits`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/gate/v1/circuits` | SoulKey | List circuit breaker states for all upstreams. |
| `GET` | `/gate/v1/circuits/{upstream_id}` | SoulKey | Get circuit breaker state for a specific upstream. |
| `POST` | `/gate/v1/circuits/{upstream_id}/reset` | SoulKey | Reset circuit breaker to closed state. |
| `POST` | `/gate/v1/circuits/{upstream_id}/trip` | SoulKey | Manually trip circuit breaker to open state. |
| `POST` | `/gate/v1/circuits/{upstream_id}/lock` | SoulKey | Lock circuit breaker in current state (admin lock). Prevents automatic transitions. |
| `POST` | `/gate/v1/circuits/{upstream_id}/unlock` | SoulKey | Unlock circuit breaker to allow automatic transitions. |

#### Audit Log (`/gate/v1/audit`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/gate/v1/audit/logs` | SoulKey | Query gateway audit logs with filtering by source, status, time range. |
| `GET` | `/gate/v1/audit/stats` | SoulKey | Get gateway audit statistics: request volume, error rates, top endpoints. |

### 31.5 Portal API

The Portal (Next.js) exposes API routes under `/api/` that proxy to backend services. These are internal routes consumed by the Portal frontend.

#### Tiresias Proxy Dashboard (`/dash/v1`)

The Tiresias Proxy provides observability endpoints for LLM traffic.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/dash/health` | SoulKey | Proxy health check. |
| `GET` | `/dash/v1/spend` | SoulKey | Aggregated LLM spend by provider and model over time. |
| `GET` | `/dash/v1/requests` | SoulKey | Request volume and success rate metrics. |
| `GET` | `/dash/v1/latency` | SoulKey | Latency percentiles (p50, p95, p99) by provider. |
| `GET` | `/dash/v1/errors` | SoulKey | Error rate breakdown by provider and error type. |
| `GET` | `/dash/v1/sessions/top` | SoulKey | Top sessions by request count, cost, or duration. |
| `GET` | `/dash/v1/sessions/{session_id}/replay` | SoulKey | Full session replay with request/response pairs. |
| `GET` | `/dash/v1/traces` | SoulKey | Request traces with timing and provider details. |
| `GET` | `/dash/v1/providers/health` | SoulKey | Provider health status and availability metrics. |

### 31.6 API Rate Limits and Pagination

**Rate Limits.** All API endpoints are subject to rate limiting. Rate limit information is returned in response headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed per window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `Retry-After` | Seconds to wait before retrying (returned with 429 responses) |

Default rate limits by tier:

| Tier | Requests/Minute | Burst |
|------|----------------|-------|
| Community | 30 | 5 |
| Starter | 60 | 10 |
| Professional | 120 | 20 |
| Enterprise | 300 | 50 |
| MSSP | 600 | 100 |

**Pagination.** List endpoints support cursor-based pagination with the following query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Number of items to return (max 200) |
| `offset` | integer | 0 | Number of items to skip |
| `sort` | string | `created_at` | Field to sort by |
| `order` | string | `desc` | Sort order: `asc` or `desc` |

Responses include pagination metadata:

```json
{
  "items": [...],
  "total": 1247,
  "limit": 50,
  "offset": 0,
  "has_more": true
}
```

### 31.7 Error Codes and Responses

All error responses follow a consistent format:

```json
{
  "detail": "Human-readable error message",
  "error_code": "SOULAUTH_ERR_001",
  "status_code": 401
}
```

**SoulAuth Error Codes:**

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `AUTH_001` | 401 | Missing or invalid SoulKey | Verify the `X-SoulKey` header is present and the key has not been revoked. |
| `AUTH_002` | 401 | SoulKey suspended | Contact an administrator to reinstate the agent. |
| `AUTH_003` | 401 | Capability token expired | Re-acquire a token from `/v1/auth/token`. |
| `AUTH_004` | 401 | Invalid token signature | Verify the token was issued by this SoulAuth instance. Check JWT public key. |
| `AUTH_005` | 403 | Insufficient scopes | The token does not include required scopes for this operation. |
| `AUTH_006` | 403 | Policy denied | Authorization policy evaluation returned deny. Check policy rules. |
| `AUTH_007` | 403 | Agent quarantined | The agent is quarantined. Contact an administrator. |
| `AUTH_008` | 403 | Tier restriction | The requested feature is not available in the current subscription tier. |
| `AUTH_009` | 409 | Duplicate agent name | An agent with this name already exists in the tenant. |
| `AUTH_010` | 423 | Account locked | Too many failed login attempts. Wait for lockout to expire. |
| `AUTH_011` | 402 | License expired | Renew or update the license key. Grace period may apply. |

**SoulWatch Error Codes:**

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `WATCH_001` | 404 | Anomaly not found | Verify the anomaly ID is correct and belongs to the current tenant. |
| `WATCH_002` | 404 | Baseline not found | The agent has no baseline yet. Allow the learning period to complete. |
| `WATCH_003` | 400 | Invalid Sigma rule | The rule YAML is malformed or uses unsupported syntax. |
| `WATCH_004` | 409 | Duplicate rule ID | A rule with this ID already exists. Use PUT to update. |
| `WATCH_005` | 503 | Detection engine unavailable | The engine is restarting or overloaded. Retry after backoff. |

**SoulGate Error Codes:**

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `GATE_001` | 401 | Invalid API key | Verify the API key and check if it has been rotated or revoked. |
| `GATE_002` | 403 | Access rule blocked | The request source is blocked by an IP or geographic access rule. |
| `GATE_003` | 429 | Rate limit exceeded | Reduce request frequency. Check `Retry-After` header. |
| `GATE_004` | 403 | Prompt injection detected | The request body triggered prompt injection detection. Review the request content. |
| `GATE_005` | 503 | Circuit breaker open | The upstream circuit breaker is open. Wait for recovery or contact an administrator. |
| `GATE_006` | 502 | Upstream error | The upstream service returned an error. Check upstream health. |
| `GATE_007` | 504 | Upstream timeout | The upstream request exceeded the configured timeout. |
| `GATE_008` | 413 | Request body too large | The request body exceeds the configured maximum size. |

---

## Chapter 32: Configuration Reference

This chapter documents every environment variable for all Tiresias services. All variables use the service-specific prefix shown below unless otherwise noted.

### 32.1 Environment Variables

#### SoulAuth Environment Variables

Prefix: `SOULAUTH_`

**Application Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_APP_NAME` | string | `SoulAuth` | Application name for logging and metrics. |
| `SOULAUTH_APP_VERSION` | string | `1.0.0` | Application version identifier. |
| `SOULAUTH_DEBUG` | bool | `false` | Enable debug mode. Do not enable in production. |
| `SOULAUTH_LOG_LEVEL` | string | `INFO` | Log level: DEBUG, INFO, WARNING, ERROR, CRITICAL. |
| `SOULAUTH_MODE` | string | `enterprise` | Operating mode: `enterprise` (PostgreSQL) or `local` (SQLite, zero-config). |
| `SOULAUTH_LOCAL_DB_PATH` | string | `~/.soulauth/soulauth.db` | Override SQLite database path for local mode. |

**Database Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_DATABASE_URL` | string | _(required in enterprise)_ | Async database URL. Format: `postgresql+asyncpg://user:pass@host:5432/db`. |
| `SOULAUTH_DATABASE_URL_SYNC` | string | _(required in enterprise)_ | Sync database URL for Alembic migrations. Format: `postgresql://user:pass@host:5432/db`. |
| `SOULAUTH_DB_POOL_SIZE` | int | `10` | SQLAlchemy connection pool size. |
| `SOULAUTH_DB_MAX_OVERFLOW` | int | `20` | Maximum overflow connections beyond pool size. |
| `SOULAUTH_DB_POOL_TIMEOUT` | int | `30` | Seconds to wait for a connection from the pool before timeout. |

**JWT and Capability Token Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_JWT_ALGORITHM` | string | `ES256` | JWT signing algorithm. Only ES256 is supported. |
| `SOULAUTH_JWT_PRIVATE_KEY_PATH` | string | _(none)_ | File path to the EC private key (PEM format) for signing tokens. |
| `SOULAUTH_JWT_PUBLIC_KEY_PATH` | string | _(none)_ | File path to the EC public key (PEM format) for verifying tokens. |
| `SOULAUTH_JWT_PRIVATE_KEY` | string | _(none)_ | Inline EC private key (PEM). Use when file paths are not available (e.g., Cloud Run secrets). |
| `SOULAUTH_JWT_PUBLIC_KEY` | string | _(none)_ | Inline EC public key (PEM). |
| `SOULAUTH_DEFAULT_TOKEN_TTL` | int | `300` | Default capability token lifetime in seconds. |
| `SOULAUTH_MAX_TOKEN_TTL` | int | `900` | Maximum allowed capability token lifetime in seconds. |
| `SOULAUTH_JWT_KID` | string | _(none)_ | Key ID (kid) for JWT header. Used for key rotation identification. |

**SoulKey Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_SOULKEY_HASH_ALGORITHM` | string | `sha512` | Hash algorithm for SoulKey storage. |

**Policy Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_POLICY_REPO_PATH` | string | _(none)_ | Local git repository path for policy-as-code YAML files. |
| `SOULAUTH_POLICY_CACHE_TTL` | int | `300` | Seconds to cache compiled policy objects. |

**Server Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_HOST` | string | `0.0.0.0` | Server bind address. Set to `127.0.0.1` for local-only access. |
| `SOULAUTH_SERVER_PORT` | int | `8000` | Server listen port. |

**Notification Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_NOTIFICATIONS_ENABLED` | bool | `false` | Enable notification dispatching. |
| `SOULAUTH_PAGERDUTY_ROUTING_KEY` | string | _(none)_ | PagerDuty Events API v2 routing key. |
| `SOULAUTH_SLACK_WEBHOOK_URL` | string | _(none)_ | Slack incoming webhook URL for alert delivery. |
| `SOULAUTH_TEAMS_WEBHOOK_URL` | string | _(none)_ | Microsoft Teams incoming webhook URL. |
| `SOULAUTH_OPSGENIE_API_KEY` | string | _(none)_ | OpsGenie API key for alert integration. |
| `SOULAUTH_EMAIL_SMTP_HOST` | string | _(none)_ | SMTP server hostname for email notifications. |
| `SOULAUTH_EMAIL_SMTP_PORT` | int | `587` | SMTP server port. Use 587 for STARTTLS, 465 for implicit TLS. |
| `SOULAUTH_EMAIL_SMTP_USER` | string | _(none)_ | SMTP authentication username. |
| `SOULAUTH_EMAIL_SMTP_PASSWORD` | string | _(none)_ | SMTP authentication password. |
| `SOULAUTH_EMAIL_FROM` | string | _(none)_ | Sender email address for notifications. |
| `SOULAUTH_EMAIL_TO` | string | _(none)_ | Comma-separated list of recipient email addresses. |
| `SOULAUTH_SNS_TOPIC_ARN` | string | _(none)_ | AWS SNS topic ARN for notification delivery. |
| `SOULAUTH_NOTIFICATION_SEVERITY_THRESHOLD` | string | `medium` | Minimum severity to trigger notifications: `info`, `low`, `medium`, `high`, `critical`. |
| `SOULAUTH_TELEGRAM_BOT_TOKEN` | string | _(none)_ | Telegram bot token for alert delivery. |
| `SOULAUTH_TELEGRAM_CHAT_ID` | string | _(none)_ | Telegram chat ID for alert delivery. |

**Detection Engine Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_DETECTION_ENABLED` | bool | `true` | Enable the Sigma detection engine. |
| `SOULAUTH_DETECTION_RULES_DIR` | string | _(none)_ | Path to directory containing Sigma rule YAML files. |
| `SOULAUTH_DETECTION_PLAYBOOKS_DIR` | string | _(none)_ | Path to directory containing response playbook YAML files. |

**SIEM Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_SIEM_ENABLED` | bool | `false` | Enable SIEM event forwarding. |
| `SOULAUTH_SIEM_BUFFER_SIZE` | int | `100` | Number of events to buffer before flushing to SIEM. |
| `SOULAUTH_SIEM_FLUSH_INTERVAL` | int | `30` | Seconds between SIEM buffer flushes. |
| `SOULAUTH_SIEM_DESTINATIONS` | string | _(none)_ | JSON-encoded list of SIEM destination configurations. |

**License Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TIRESIAS_LICENSE_KEY` | string | _(none)_ | Tiresias license JWT. Required for enterprise features. |
| `SOULAUTH_LICENSE_GRACE_HOURS` | float | `72.0` | Hours to allow degraded operation after license expiry. |
| `SOULAUTH_LICENSE_REQUIRED` | bool | `true` | If true, missing or invalid license causes startup failure. |
| `TIRESIAS_TIER` | string | _(none)_ | Override the license tier at deploy time. Valid: `community`, `starter`, `pro`, `enterprise`, `mssp`, `saas`. |

**Authentication Mode Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_AUTH_MODE` | string | `oidc` | Authentication mode: `oidc`, `local`, `ldap`, or comma-separated for multi-mode. |
| `SOULAUTH_LOCAL_ADMIN_EMAIL` | string | _(none)_ | Bootstrap admin email for local auth (first run only). |
| `SOULAUTH_LOCAL_ADMIN_PASSWORD` | string | _(none)_ | Bootstrap admin password for local auth (first run only, hashed on creation). |
| `SOULAUTH_LOGIN_MAX_ATTEMPTS` | int | `5` | Maximum failed login attempts before lockout. |
| `SOULAUTH_LOGIN_LOCKOUT_MINUTES` | int | `15` | Minutes to lock account after max failed attempts. |

**LDAP Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_LDAP_URL` | string | _(none)_ | LDAP server URL (e.g., `ldaps://dc.example.com:636`). |
| `SOULAUTH_LDAP_BIND_DN` | string | _(none)_ | Service account DN for LDAP bind. |
| `SOULAUTH_LDAP_BIND_PASSWORD` | string | _(none)_ | Service account password for LDAP bind. |
| `SOULAUTH_LDAP_SEARCH_BASE` | string | _(none)_ | LDAP search base DN. |
| `SOULAUTH_LDAP_USER_FILTER` | string | `(sAMAccountName={username})` | LDAP user search filter template. |
| `SOULAUTH_LDAP_GROUP_ATTRIBUTE` | string | `memberOf` | LDAP attribute containing group memberships. |
| `SOULAUTH_LDAP_GROUP_ROLE_MAP` | string | _(none)_ | JSON mapping of LDAP group DNs to SoulAuth roles. |

**OIDC / SSO Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_OIDC_ENABLED` | bool | `false` | Feature flag: enable SSO/OIDC portal authentication. |
| `SOULAUTH_OIDC_SECRET_KEY` | string | _(none)_ | Fernet key for encrypting `client_secret` in IdP configs at rest. |
| `SOULAUTH_OIDC_STATE_SECRET` | string | _(none)_ | HMAC secret for PKCE state parameter signing. |
| `SOULAUTH_OIDC_SESSION_TTL` | int | `28800` | OIDC portal session TTL in seconds (default: 8 hours). |
| `SOULAUTH_OIDC_JWKS_CACHE_TTL` | int | `3600` | JWKS cache TTL in seconds (default: 1 hour). |
| `SOULAUTH_PUBLIC_URL` | string | `https://tiresias.network` | Public base URL for OAuth `redirect_uri` construction. |
| `SOULAUTH_ALLOWED_ORIGINS` | list | `["https://tiresias.network"]` | Allowlist of portal origins for OIDC redirect_uri validation. |

**Resend and Trial Settings:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_RESEND_API_KEY` | string | _(none)_ | Resend API key for transactional email (trial verification). |
| `SOULAUTH_TRIAL_FROM_EMAIL` | string | `Tiresias <onboarding@resend.dev>` | Sender address for trial verification emails. |
| `SOULAUTH_TRIAL_VERIFY_BASE_URL` | string | `https://tiresias.network/trial/verify` | Base URL for trial email verification links. |
| `OPENROUTER_API_KEY` | string | _(none)_ | OpenRouter API key for the AI support chatbot. |

**Supabase Settings (Legacy):**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULAUTH_SUPABASE_URL` | string | _(none)_ | Supabase project URL (legacy, for migration). |
| `SOULAUTH_SUPABASE_SERVICE_KEY` | string | _(none)_ | Supabase service role key (legacy, for migration). |

---

#### SoulWatch Environment Variables

Prefix: `SOULWATCH_`

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULWATCH_APP_NAME` | string | `SoulWatch` | Application name. |
| `SOULWATCH_APP_VERSION` | string | `1.0.0` | Application version. |
| `SOULWATCH_DEBUG` | bool | `false` | Enable debug mode. |
| `SOULWATCH_LOG_LEVEL` | string | `INFO` | Log level. |
| `SOULWATCH_MODE` | string | `sidecar` | Operating mode: `sidecar` (polls audit table) or `standalone` (receives events via API). |
| `SOULWATCH_SOULAUTH_BASE_URL` | string | `http://localhost:8000` | SoulAuth base URL for admin API callbacks. |
| `SOULWATCH_DATABASE_URL` | string | _(see note)_ | Async database URL (shared DB with SoulAuth). |
| `SOULWATCH_DB_POOL_SIZE` | int | `10` | Connection pool size. |
| `SOULWATCH_DB_MAX_OVERFLOW` | int | `20` | Maximum overflow connections. |
| `SOULWATCH_DB_POOL_TIMEOUT` | int | `30` | Pool timeout in seconds. |
| `SOULWATCH_DETECTION_ENABLED` | bool | `true` | Enable Sigma detection engine. |
| `SOULWATCH_DETECTION_RULES_DIR` | string | _(none)_ | Path to Sigma rule YAML files. |
| `SOULWATCH_DETECTION_PLAYBOOKS_DIR` | string | _(none)_ | Path to response playbook YAML files. |
| `SOULWATCH_SIEM_ENABLED` | bool | `false` | Enable SIEM event forwarding. |
| `SOULWATCH_SIEM_BUFFER_SIZE` | int | `100` | SIEM event buffer size. |
| `SOULWATCH_SIEM_FLUSH_INTERVAL` | int | `30` | SIEM flush interval in seconds. |
| `SOULWATCH_SIEM_DESTINATIONS` | string | _(none)_ | JSON-encoded list of SIEM destination configs. |
| `SOULWATCH_NOTIFICATIONS_ENABLED` | bool | `false` | Enable notification dispatching. |
| `SOULWATCH_TELEGRAM_BOT_TOKEN` | string | _(none)_ | Telegram bot token. |
| `SOULWATCH_TELEGRAM_CHAT_ID` | string | _(none)_ | Telegram chat ID. |
| `SOULWATCH_PAGERDUTY_ROUTING_KEY` | string | _(none)_ | PagerDuty routing key. |
| `SOULWATCH_SLACK_WEBHOOK_URL` | string | _(none)_ | Slack incoming webhook URL. |
| `SOULWATCH_TEAMS_WEBHOOK_URL` | string | _(none)_ | Microsoft Teams webhook URL. |
| `SOULWATCH_OPSGENIE_API_KEY` | string | _(none)_ | OpsGenie API key. |
| `SOULWATCH_EMAIL_SMTP_HOST` | string | _(none)_ | SMTP server hostname. |
| `SOULWATCH_EMAIL_SMTP_PORT` | int | `587` | SMTP server port. |
| `SOULWATCH_EMAIL_SMTP_USER` | string | _(none)_ | SMTP username. |
| `SOULWATCH_EMAIL_SMTP_PASSWORD` | string | _(none)_ | SMTP password. |
| `SOULWATCH_EMAIL_FROM` | string | _(none)_ | Sender email address. |
| `SOULWATCH_EMAIL_TO` | string | _(none)_ | Comma-separated recipient list. |
| `SOULWATCH_SNS_TOPIC_ARN` | string | _(none)_ | AWS SNS topic ARN. |
| `SOULWATCH_NOTIFICATION_SEVERITY_THRESHOLD` | string | `medium` | Minimum notification severity. |
| `SOULWATCH_INTERNAL_API_KEY` | string | _(none)_ | Shared secret for inter-service authentication (X-Internal-Key header). |
| `SOULWATCH_RESEND_API_KEY` | string | _(none)_ | Resend API key for alert emails. |
| `SOULWATCH_BASELINE_REBUILD_INTERVAL_HOURS` | int | `6` | Hours between automatic baseline rebuilds. |
| `SOULWATCH_BASELINE_LOOKBACK_HOURS` | int | `168` | Hours of historical data to include in baseline calculation (default: 7 days). |
| `SOULWATCH_ANOMALY_RETENTION_DAYS` | int | `90` | Days to retain anomaly records before purge. |
| `SOULWATCH_DETECTION_RETENTION_DAYS` | int | `90` | Days to retain detection match records. |
| `SOULWATCH_POLL_INTERVAL_SECONDS` | int | `5` | Sidecar mode: polling interval for the SoulAuth audit table. |
| `SOULWATCH_PIPELINE_BATCH_SIZE` | int | `100` | Maximum events per pipeline processing batch. |
| `SOULWATCH_WS_MAX_CONNECTIONS` | int | `100` | Maximum concurrent WebSocket connections. |
| `SOULWATCH_WS_HEARTBEAT_INTERVAL` | int | `30` | WebSocket heartbeat interval in seconds. |
| `SOULWATCH_HOST` | string | `0.0.0.0` | Server bind address. |
| `SOULWATCH_SERVER_PORT` | int | `8001` | Server listen port. |

---

#### SoulGate Environment Variables

Prefix: `SOULGATE_`

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SOULGATE_APP_NAME` | string | `SoulGate` | Application name. |
| `SOULGATE_APP_VERSION` | string | `1.0.0` | Application version. |
| `SOULGATE_DEBUG` | bool | `false` | Enable debug mode. |
| `SOULGATE_LOG_LEVEL` | string | `INFO` | Log level. |
| `SOULGATE_MODE` | string | `gateway` | Operating mode. |
| `SOULGATE_SOULAUTH_BASE_URL` | string | `http://localhost:8000` | SoulAuth base URL for token validation and identity resolution. |
| `SOULGATE_SOULWATCH_BASE_URL` | string | `http://localhost:8001` | SoulWatch base URL for event forwarding. |
| `SOULGATE_DATABASE_URL` | string | _(none)_ | Async database URL. Set for PostgreSQL; leave unset for per-tenant SQLite. |
| `SOULGATE_DB_POOL_SIZE` | int | `10` | Connection pool size. |
| `SOULGATE_DB_MAX_OVERFLOW` | int | `20` | Maximum overflow connections. |
| `SOULGATE_DB_POOL_TIMEOUT` | int | `30` | Pool timeout in seconds. |
| `SOULGATE_DATA_ROOT` | string | `/data` | Root directory for per-tenant SQLite databases (used when `DATABASE_URL` is unset). |
| `SOULGATE_DEFAULT_RATE_LIMIT_RPM` | int | `60` | Default requests per minute for rate limiting. |
| `SOULGATE_DEFAULT_BURST_SIZE` | int | `10` | Default burst size above rate limit before hard reject. |
| `SOULGATE_AUDIT_BATCH_SIZE` | int | `50` | Number of audit log entries to batch before DB flush. |
| `SOULGATE_AUDIT_FLUSH_INTERVAL` | int | `5` | Seconds between audit log flushes. |
| `SOULGATE_CIRCUIT_FAILURE_THRESHOLD` | int | `5` | Consecutive failures before circuit breaker opens. |
| `SOULGATE_CIRCUIT_COOLDOWN_SECONDS` | int | `30` | Seconds to wait in open state before half-open probe. |
| `SOULGATE_PROXY_TIMEOUT_MS` | int | `30000` | Upstream proxy request timeout in milliseconds. |
| `SOULGATE_MAX_REQUEST_BODY_BYTES` | int | `10485760` | Maximum request body size in bytes (default: 10 MB). |
| `SOULGATE_INTERNAL_API_KEY` | string | _(none)_ | Shared secret for internal requests (e.g., Prometheus scraping). |
| `SOULGATE_PROMPT_GUARD_ENABLED` | bool | `true` | Enable prompt injection detection on request bodies. |
| `SOULGATE_COT_POLICY_ENABLED` | bool | `false` | Enable CoT policy enforcement (inject/reject/warn on requests). |
| `SOULGATE_COT_POLICY_DIR` | string | `policies/cot` | Directory containing CoT policy YAML files. |
| `SOULGATE_HOST` | string | `0.0.0.0` | Server bind address. |
| `SOULGATE_SERVER_PORT` | int | `8002` | Server listen port. |

---

#### Tiresias Proxy Environment Variables

No prefix (uses alias-based env var names).

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TIRESIAS_TENANT_ID` | string | _(auto-generated UUID)_ | Tenant identifier. Auto-generated if not set. |
| `TIRESIAS_KEK_PROVIDER` | string | `local` | Key Encryption Key provider: `local`, `aws-kms`, `hashicorp-vault`, `azure-kv`, `gcp-sm`. |
| `TIRESIAS_KEK` | string | _(none)_ | Key Encryption Key value for local provider. Auto-generated if not set. |
| `TIRESIAS_RETENTION_DAYS` | int | `30` | Days to retain request/response data. |
| `TIRESIAS_USAGE_RETENTION_DAYS` | int | `90` | Days to retain usage metrics. |
| `PROXY_PORT` | int | `8080` | Proxy listen port. |
| `DASHBOARD_PORT` | int | `3000` | Dashboard listen port. |
| `TIRESIAS_DATA_ROOT` | path | `/data` | Root directory for data storage. |
| `TIRESIAS_DATABASE_URL` | string | _(none)_ | Database URL. Uses SQLite under `DATA_ROOT` if not set. |
| `TIRESIAS_PURGE_DEK` | bool | `false` | Enable Data Encryption Key purge on retention expiry (crypto-shredding). |
| `TIRESIAS_PURGE_INTERVAL_HOURS` | int | `24` | Hours between purge cycles. |
| `TIRESIAS_UPSTREAM_URL` | string | `https://api.openai.com` | Default upstream provider URL. |
| `TIRESIAS_PROVIDERS` | string | `openai` | Comma-separated list of enabled providers: `openai`, `anthropic`, `gemini`, `groq`, `ollama`. |
| `TIRESIAS_GENERIC_PROXY_MODE` | bool | `false` | When true, all `/api/{path}` requests are forwarded to `upstream_url/{path}`. |
| `TIRESIAS_API_SERVICE` | string | _(none)_ | API service label for cost attribution (e.g., `stripe`, `twilio`). |

**KMS Provider Settings (when `KEK_PROVIDER` is not `local`):**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TIRESIAS_AWS_KMS_KEY_ID` | string | _(none)_ | AWS KMS key ARN or alias. |
| `TIRESIAS_AWS_KMS_REGION` | string | _(none)_ | AWS region for KMS. |
| `TIRESIAS_VAULT_URL` | string | _(none)_ | HashiCorp Vault URL. |
| `TIRESIAS_VAULT_TOKEN` | string | _(none)_ | HashiCorp Vault authentication token. |
| `TIRESIAS_VAULT_MOUNT` | string | _(none)_ | Vault secrets engine mount path. |
| `TIRESIAS_VAULT_PATH` | string | _(none)_ | Vault secret path. |
| `TIRESIAS_AZURE_VAULT_URL` | string | _(none)_ | Azure Key Vault URL. |
| `TIRESIAS_AZURE_KEY_NAME` | string | _(none)_ | Azure Key Vault key name. |
| `TIRESIAS_GCP_PROJECT_ID` | string | _(none)_ | GCP project ID for Secret Manager. |
| `TIRESIAS_GCP_SECRET_ID` | string | _(none)_ | GCP Secret Manager secret ID. |

---

#### Portal Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| `NEXT_PUBLIC_SOULAUTH_API_URL` | string | SoulAuth base URL. **Must be set as `--build-arg` at Docker build time.** |
| `NEXT_PUBLIC_SOULWATCH_API_URL` | string | SoulWatch base URL for dashboard API calls. |
| `NEXT_PUBLIC_SOULGATE_API_URL` | string | SoulGate base URL for gateway API calls. |
| `SOULAUTH_INTERNAL_URL` | string | SoulAuth internal URL for server-side API routes (Cloud Run service-to-service). |
| `SOULWATCH_INTERNAL_URL` | string | SoulWatch internal URL with X-Internal-Key authentication. |
| `SOULGATE_INTERNAL_URL` | string | SoulGate internal URL. |
| `TIRESIAS_PROXY_URL` | string | Tiresias Proxy URL with X-SoulKey authentication. |

> **Caution:** Portal Docker builds require `NEXT_PUBLIC_*` variables passed as `--build-arg` values because Next.js inlines these at compile time. Runtime environment variables alone are insufficient for these values.

### 32.2 YAML Policy Schema

Authorization policies use YAML format and are synced from a git repository.

```yaml
apiVersion: tiresias.network/v1
kind: AuthorizationPolicy
metadata:
  name: restrict-production-access
  description: Limit production resource access to approved agents
  labels:
    environment: production
    team: platform
spec:
  # Match criteria
  match:
    agents:
      - "agent-deployer-*"
      - "agent-monitor-prod"
    scopes:
      - "resources:write"
      - "deployments:*"
    resources:
      - "/api/v1/production/**"
  # Policy decision
  decision: allow    # allow | deny
  # Conditions (all must be true)
  conditions:
    - field: request.time
      operator: between
      value: ["06:00", "22:00"]
    - field: agent.risk_score
      operator: lt
      value: 0.7
  # Priority (higher = evaluated first)
  priority: 100
```

### 32.3 Sigma Rule Field Mapping

Tiresias maps internal event fields to Sigma taxonomy for rule portability.

| Tiresias Field | Sigma Field | Description |
|---------------|-------------|-------------|
| `agent_id` | `User` | Agent identifier |
| `soulkey_id` | `SubjectUserName` | SoulKey identifier |
| `tenant_id` | `ComputerName` | Tenant identifier |
| `action` | `EventType` | Action performed (authenticate, authorize, proxy, etc.) |
| `resource` | `TargetFilename` | Resource path accessed |
| `source_ip` | `SourceIp` | Request source IP address |
| `status` | `Status` | Outcome (success, failure, denied) |
| `severity` | `Level` | Event severity |
| `timestamp` | `UtcTime` | Event timestamp (ISO 8601 UTC) |
| `method` | `CommandLine` | HTTP method or action verb |
| `scope` | `ShareName` | Scope or permission context |
| `anomaly_type` | `RuleName` | Type of anomaly detected |
| `risk_score` | `Score` | Calculated risk score (0.0-1.0) |

### 32.4 CEF Field Mapping

Tiresias generates Common Event Format (CEF) messages for SIEM integration.

```
CEF:0|Saluca|Tiresias|3.0|AUTH_001|SoulKey Authentication Failure|7|
  src=192.168.1.100 suser=agent-xyz dst=soulauth dpt=8000
  msg=Invalid SoulKey presented cs1Label=tenant_id cs1=7f561f93-...
  cs2Label=soulkey_id cs2=sk_abc123 outcome=failure
```

| CEF Field | Tiresias Source | Description |
|-----------|----------------|-------------|
| `deviceVendor` | `Saluca` | Vendor name (constant). |
| `deviceProduct` | `Tiresias` | Product name (constant). |
| `deviceVersion` | `3.0` | Platform version. |
| `signatureId` | Event code | Internal event identifier (e.g., `AUTH_001`). |
| `name` | Event description | Human-readable event summary. |
| `severity` | Risk score | CEF severity 0-10, mapped from Tiresias risk score. |
| `src` | `source_ip` | Request source IP. |
| `suser` | `agent_id` | Agent identifier. |
| `outcome` | `status` | Event outcome. |
| `cs1` | `tenant_id` | Custom string 1: tenant identifier. |
| `cs2` | `soulkey_id` | Custom string 2: SoulKey identifier. |
| `cs3` | `anomaly_type` | Custom string 3: anomaly type (if applicable). |
| `cn1` | `risk_score` | Custom number 1: calculated risk score. |

### 32.5 Portal Build Arguments

These variables must be passed as `--build-arg` during the Portal Docker image build.

```bash
docker build \
  --build-arg NEXT_PUBLIC_SOULAUTH_API_URL=https://tiresias-soulauth-253892677982.us-central1.run.app \
  --build-arg NEXT_PUBLIC_SOULWATCH_API_URL=https://tiresias-soulwatch-253892677982.us-central1.run.app \
  --build-arg NEXT_PUBLIC_SOULGATE_API_URL=https://tiresias-soulgate-zsnoaggk6q-uc.a.run.app \
  -t tiresias-portal:v3.0 \
  ./portal
```

**Verification.** After building, run the smoke test to verify all build arguments were correctly inlined:

```bash
./portal/smoke-test.sh
```

### 32.6 Docker Compose Reference

See Appendix B for the complete annotated `docker-compose.yml`.

---

## Chapter 33: Security Hardening Guide

This chapter provides a systematic approach to hardening a Tiresias deployment for production. Each section includes specific configuration steps and verification procedures.

### 33.1 Production Security Checklist

Complete every item on this checklist before exposing a Tiresias deployment to production traffic. Items marked with **(Critical)** must not be skipped.

**Authentication and Secrets:**

- [ ] **(Critical)** Generate production EC P-256 key pair for JWT signing. Do not use development keys.
- [ ] **(Critical)** Set `SOULAUTH_OIDC_SECRET_KEY` to a unique Fernet key (use `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
- [ ] **(Critical)** Set `SOULAUTH_OIDC_STATE_SECRET` to a unique 32+ character random string
- [ ] **(Critical)** Set unique `INTERNAL_API_KEY` for inter-service authentication (64+ hex characters)
- [ ] **(Critical)** Set strong PostgreSQL credentials. Do not use default usernames.
- [ ] **(Critical)** Set `TIRESIAS_LICENSE_KEY` to a valid license JWT
- [ ] Rotate all default credentials and tokens
- [ ] Verify `SOULAUTH_LICENSE_REQUIRED=true` in production

**Network:**

- [ ] **(Critical)** Ensure TLS termination is in place for all external-facing endpoints
- [ ] **(Critical)** Bind PostgreSQL to localhost or internal network only (127.0.0.1:5432)
- [ ] **(Critical)** Do not expose SoulWatch or SoulGate ports to the host (internal-only services)
- [ ] Configure firewall rules to restrict access to management ports
- [ ] Enable CORS allowlisting via `SOULAUTH_ALLOWED_ORIGINS`

**Application:**

- [ ] **(Critical)** Set `SOULAUTH_DEBUG=false` and `SOULWATCH_DEBUG=false` and `SOULGATE_DEBUG=false`
- [ ] Set log level to `INFO` or `WARNING` (not `DEBUG`)
- [ ] Configure audit log retention policies
- [ ] Enable detection engine (`SOULWATCH_DETECTION_ENABLED=true`)
- [ ] Configure at least one notification channel for critical alerts
- [ ] Set `SOULAUTH_LOGIN_MAX_ATTEMPTS` to 5 or lower
- [ ] Set `SOULAUTH_LOGIN_LOCKOUT_MINUTES` to 15 or higher

**Container Security:**

- [ ] **(Critical)** Verify all containers run with `no-new-privileges:true`
- [ ] **(Critical)** Verify all containers drop `ALL` capabilities
- [ ] **(Critical)** Enable `read_only: true` filesystem for all containers
- [ ] Scan container images for vulnerabilities before deployment
- [ ] Pin base images to specific digests, not floating tags

**Monitoring:**

- [ ] Configure Prometheus scraping for all service `/metrics` endpoints
- [ ] Configure Alertmanager with at least one receiver
- [ ] Verify health check endpoints are accessible from the orchestrator
- [ ] Set up log aggregation for all service containers

### 33.2 Network Hardening

#### TLS Configuration

All external-facing endpoints must terminate TLS 1.2 or higher. In the GCP Cloud Run deployment, Google-managed TLS certificates are provisioned automatically. For self-hosted deployments:

**Recommended TLS Configuration (Nginx or similar reverse proxy):**

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_timeout 1d;
ssl_session_cache shared:TiresiasSSL:10m;
ssl_session_tickets off;

# HSTS
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

**Internal Service-to-Service Communication.** Within a Docker Compose network or Kubernetes cluster, services communicate over the internal network without TLS. For distributed deployments where services span network boundaries, configure mutual TLS (mTLS):

1. Generate a CA certificate for the Tiresias deployment.
2. Issue server certificates for each service.
3. Configure each service with the CA certificate for upstream verification.

#### Firewall Rules

Minimum required firewall rules for a production deployment:

| Source | Destination | Port | Protocol | Purpose |
|--------|-------------|------|----------|---------|
| Internet | Load Balancer | 443 | TCP | Portal and API access |
| Load Balancer | Portal | 3000 | TCP | Portal frontend |
| Load Balancer | SoulAuth | 8000 | TCP | API access |
| Portal (internal) | SoulAuth | 8000 | TCP | Server-side API calls |
| Portal (internal) | SoulWatch | 8001 | TCP | Dashboard data |
| Portal (internal) | SoulGate | 8002 | TCP | Gateway management |
| SoulWatch | SoulAuth | 8000 | TCP | Audit table polling |
| SoulGate | SoulAuth | 8000 | TCP | Token validation |
| All services | PostgreSQL | 5432 | TCP | Database access |
| Prometheus | All services | varies | TCP | Metrics scraping |

**Deny all other traffic by default.**

#### Network Segmentation

For high-security deployments, separate services into network zones:

1. **DMZ Zone:** Portal, load balancer
2. **Application Zone:** SoulAuth, SoulWatch, SoulGate
3. **Data Zone:** PostgreSQL, Prometheus data volumes
4. **Management Zone:** Alertmanager, Grafana, monitoring tools

### 33.3 Secret Management

#### Required Secrets

The following secrets must be provisioned securely in production:

| Secret | Service | Purpose |
|--------|---------|---------|
| PostgreSQL password | All | Database authentication |
| JWT private key (PEM) | SoulAuth | Capability token signing |
| JWT public key (PEM) | SoulAuth, SoulGate | Token verification |
| OIDC secret key (Fernet) | SoulAuth | IdP client_secret encryption at rest |
| OIDC state secret | SoulAuth | PKCE state parameter HMAC |
| Internal API key | SoulWatch, SoulGate | Inter-service authentication |
| License key (JWT) | SoulAuth | License validation |
| Resend API key | SoulAuth | Transactional email |
| SIEM credentials | SoulWatch | SIEM destination authentication |
| Stripe API keys | SoulAuth | Billing integration |
| KEK (or KMS credentials) | Tiresias Proxy | Envelope encryption |

#### GCP Secret Manager (Recommended for SaaS)

```bash
# Create secrets
echo -n "$(openssl ecparam -genkey -name prime256v1 -noout 2>/dev/null)" | \
  gcloud secrets create tiresias-jwt-private --data-file=-

# Grant Cloud Run access
gcloud secrets add-iam-policy-binding tiresias-jwt-private \
  --member="serviceAccount:253892677982-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Reference in Cloud Run
gcloud run services update tiresias-soulauth \
  --set-secrets="SOULAUTH_JWT_PRIVATE_KEY=tiresias-jwt-private:latest"
```

#### HashiCorp Vault Integration

Configure Tiresias Proxy to use Vault for KEK management:

```bash
export TIRESIAS_KEK_PROVIDER=hashicorp-vault
export TIRESIAS_VAULT_URL=https://vault.internal:8200
export TIRESIAS_VAULT_TOKEN=hvs.CAESI...
export TIRESIAS_VAULT_MOUNT=transit
export TIRESIAS_VAULT_PATH=tiresias-kek
```

#### Secret Rotation Procedure

1. Generate new secret material.
2. Update the secret in the secret manager.
3. Deploy the service with the new secret reference.
4. Verify service health with the new secret.
5. Wait for all in-flight operations using the old secret to complete.
6. Delete the old secret version.

For JWT key rotation, use the `SOULAUTH_JWT_KID` mechanism:

1. Generate a new EC P-256 key pair.
2. Assign a new `kid` value (e.g., `soulauth-2026-04`).
3. Deploy with the new key and `SOULAUTH_JWT_KID` set to the new kid.
4. Both old and new public keys must be available for verification during the transition window.
5. After `max_token_ttl` seconds (default 900s), all old tokens have expired. Remove the old public key.

### 33.4 Container Hardening

The default `docker-compose.yml` applies the following hardening measures:

**Applied by Default:**

| Measure | Configuration | Purpose |
|---------|--------------|---------|
| Drop all capabilities | `cap_drop: [ALL]` | Remove all Linux capabilities from the container. |
| No new privileges | `security_opt: [no-new-privileges:true]` | Prevent privilege escalation via setuid/setgid binaries. |
| Read-only filesystem | `read_only: true` | Prevent writes to the container filesystem. |
| tmpfs for writable paths | `tmpfs: [/tmp]` | Provide in-memory writable space for temporary files. |
| Localhost-only port binding | `127.0.0.1:port:port` | Prevent external access to management ports. |
| Non-root execution | `USER` in Dockerfile | Run processes as a non-root user. |

**Additional Hardening for High-Security Deployments:**

```yaml
services:
  soulauth:
    # Resource limits
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2G
        reservations:
          cpus: "0.5"
          memory: 512M
    # Seccomp profile
    security_opt:
      - no-new-privileges:true
      - seccomp:seccomp-profile.json
    # AppArmor (Linux)
    security_opt:
      - apparmor:docker-tiresias
```

**Image Scanning:**

Scan images with Trivy or Grype before deployment:

```bash
trivy image tiresias-soulauth:v3.0
grype tiresias-soulauth:v3.0
```

Fail the build pipeline if any critical or high-severity vulnerabilities are detected.

### 33.5 Database Hardening

**Encryption at Rest:**

| Setting | Configuration | Description |
|---------|--------------|-------------|
| Cloud SQL encryption | Enabled by default | Google-managed AES-256 encryption at rest. |
| CMEK (optional) | `--disk-encryption-key` | Customer-managed encryption key via Cloud KMS. |
| Self-hosted Postgres | `ssl = on` in `postgresql.conf` | Enable TLS for connections. |

**Connection Security:**

```ini
# postgresql.conf
ssl = on
ssl_cert_file = '/etc/ssl/certs/server.crt'
ssl_key_file = '/etc/ssl/private/server.key'
ssl_ca_file = '/etc/ssl/certs/ca.crt'
ssl_min_protocol_version = 'TLSv1.2'

# pg_hba.conf — require SSL for all connections
hostssl all all 0.0.0.0/0 scram-sha-256
hostssl all all ::/0 scram-sha-256
```

**Access Restrictions:**

- Create a dedicated database user for each service with minimum required permissions.
- Do not use the `postgres` superuser for application connections.
- Use `scram-sha-256` authentication (not `md5`).
- Restrict connections to the internal network only.

**Audit Logging:**

```ini
# postgresql.conf
log_connections = on
log_disconnections = on
log_statement = 'ddl'
log_min_duration_statement = 1000  # Log queries taking >1s
```

### 33.6 Portal Hardening

**Security Headers:**

The Portal should serve the following security headers. Configure in your reverse proxy or Next.js middleware:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.run.app https://tiresias.network; frame-ancestors 'none';
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

**CORS Configuration:**

Restrict allowed origins to the production portal domain:

```
SOULAUTH_ALLOWED_ORIGINS=["https://tiresias.network"]
```

**Session Management:**

| Setting | Recommended Value | Description |
|---------|------------------|-------------|
| Session TTL | `28800` (8 hours) | Maximum session duration before re-authentication required. |
| Cookie flags | `HttpOnly; Secure; SameSite=Lax` | Prevent XSS access, require HTTPS, restrict cross-site requests. |
| Idle timeout | `3600` (1 hour) | Expire sessions after 1 hour of inactivity. |

---

## Chapter 34: Glossary

### 34.1 Platform Terminology

**Agent.** An autonomous AI system (LLM-based agent, bot, or automated process) that authenticates to Tiresias via a SoulKey and performs actions within defined scope boundaries.

**Aletheia.** The transparency and verification subsystem of SoulWatch. Provides tool invocation auditing, chain-of-thought (CoT) hash chain integrity verification, and output sanitization monitoring. Named after the Greek concept of truth/disclosure.

**Baseline.** A statistical model of an agent's normal behavior, computed from historical audit data. Includes request rate distributions, resource access patterns, temporal profiles, and scope usage patterns. Deviations from the baseline trigger anomaly alerts.

**Capability Token.** A short-lived ES256-signed JSON Web Token (JWT) issued by SoulAuth after SoulKey authentication. Encodes the agent's identity, tenant, authorized scopes, and expiry. Default lifetime: 300 seconds. Maximum lifetime: 900 seconds.

**Closed-Loop Security.** The Tiresias architecture pattern where detection findings (SoulWatch) trigger enforcement actions (SoulGate, SoulAuth), and enforcement actions generate audit events that feed back into detection. This creates a continuous feedback loop between monitoring and response.

**Data Encryption Key (DEK).** A per-request AES-256-GCM key used by Tiresias Proxy to encrypt LLM request and response payloads at rest. DEKs are themselves encrypted by the Key Encryption Key (KEK) using envelope encryption.

**Hash Chain.** A tamper-evident data structure where each audit record includes a SHA-256 hash of the previous record. Breaking any link in the chain is detectable, providing cryptographic proof that audit records have not been modified or deleted.

**Key Encryption Key (KEK).** The master encryption key used to encrypt Data Encryption Keys in Tiresias Proxy's envelope encryption scheme. Can be stored locally, in AWS KMS, HashiCorp Vault, Azure Key Vault, or GCP Secret Manager.

**Policy Decision Point (PDP).** The authorization engine in SoulAuth that evaluates authorization policies against incoming requests. Policies are defined in YAML and synced from a git repository.

**Portal.** The Next.js 14 management dashboard for Tiresias. Provides security monitoring, configuration management, investigation tools, and compliance reporting for administrators and analysts.

**SoulAuth.** The core identity and authorization service. Manages agent registration, SoulKey issuance, capability token generation, RBAC, OIDC/LDAP/local authentication, policy evaluation, and audit logging.

**SoulGate.** The API gateway service. Provides a seven-stage security pipeline: authentication, authorization, rate limiting, IP/geographic access control, prompt injection detection, circuit breaking, and upstream proxying.

**SoulKey.** A high-entropy cryptographic credential issued to each agent. The raw key value is displayed once at creation time and stored as a SHA-512 hash. SoulKeys serve as the primary agent identity credential. Format: `sk_live_<random>` or `sk_test_<random>`.

**SoulWatch.** The behavioral analytics and threat detection service. Provides per-agent baselines, statistical anomaly detection, Sigma rule evaluation, automated response playbooks, SIEM integration, and the Aletheia transparency subsystem.

**Tenant.** An isolated organizational unit within Tiresias. Each tenant has its own agents, policies, baselines, audit logs, and configuration. Tenants are identified by UUID. All data operations are scoped to the requesting tenant.

### 34.2 Security Terminology

**Anomaly Detection.** The process of identifying agent behavior that deviates from the established baseline. Tiresias supports eight anomaly types: rate spikes, off-hours activity, credential stuffing, scope escalation, unusual resource access, geographic anomalies, pattern breaks, and privilege accumulation.

**Anti-Weaponization.** Protections built into SoulGate's circuit breaker to prevent attackers from deliberately triggering circuit opens to deny service. Includes minimum request thresholds, per-source failure ratio tracking, and admin lock capability.

**Circuit Breaker.** A resilience pattern in SoulGate that monitors upstream service health. States: Closed (normal operation), Open (requests rejected without forwarding), Half-Open (probe requests sent to test recovery). Prevents cascading failures.

**Crypto-Shredding.** The practice of deleting Data Encryption Keys to render encrypted data permanently unrecoverable. Tiresias Proxy supports crypto-shredding via the `TIRESIAS_PURGE_DEK=true` setting for compliance with data deletion requirements.

**Envelope Encryption.** A two-layer encryption scheme where data is encrypted with a DEK (AES-256-GCM) and the DEK is encrypted with a KEK. This approach allows key rotation without re-encrypting all data.

**Prompt Injection.** An attack where an adversary embeds malicious instructions in input data to manipulate an LLM's behavior. SoulGate includes 40+ OWASP-aligned detection patterns for identifying prompt injection attempts.

**Quarantine.** An enforcement action that suspends an agent's SoulKey and blocks all authentication until an administrator manually releases the agent. Triggered by automated response playbooks or manual operator action.

**Zero Trust.** A security model that requires verification for every access request regardless of network location. Tiresias applies zero trust to AI agents: every request is authenticated, authorized, rate-limited, and scanned before forwarding to upstream services.

### 34.3 Integration Terminology

**CEF (Common Event Format).** A standardized log format developed by ArcSight (now Micro Focus). Tiresias generates CEF-formatted events for SIEM integration. See Section 32.4 for field mapping.

**HEC (HTTP Event Collector).** A Splunk endpoint that accepts events over HTTP/HTTPS. Tiresias SIEM integration supports HEC for Splunk delivery.

**OIDC (OpenID Connect).** An identity layer built on OAuth 2.0 for authenticating portal administrators. Tiresias supports Google, Okta, Azure AD, and any OIDC-compliant IdP.

**RFC 5424.** The IETF standard for the Syslog protocol. Tiresias SIEM integration supports RFC 5424 formatted syslog output for compatibility with traditional SIEM infrastructure.

**SAML (Security Assertion Markup Language).** An XML-based authentication standard for enterprise SSO. Tiresias supports SAML 2.0 IdP integration for portal authentication.

**Sigma.** A generic and open signature format for SIEM detection rules. Tiresias uses Sigma-compatible YAML syntax for detection rules, with custom field mappings (see Section 32.3).

**Webhook.** An HTTP callback endpoint that receives events via POST requests. Tiresias supports webhook destinations for SIEM integration and notification delivery.

---

## Chapter 35: Release Notes and Changelog

### 35.1 v3.0 Release Notes

**Release Date:** April 2026
**Minimum Upgrade Path:** v2.5 or later

#### New Features

- **SaaS Deployment on GCP Cloud Run.** Full multi-tenant SaaS platform with five Cloud Run services, Google-managed TLS, and Cloudflare DNS.
- **OIDC/SSO Authentication.** Native Google SSO, Okta, and Azure AD integration with PKCE flow and JIT user provisioning.
- **Local and LDAP Authentication.** Multi-mode authentication support: local credentials with bcrypt hashing, LDAP/Active Directory bind with group-to-role mapping.
- **Aletheia Transparency Module.** Tool invocation auditing, chain-of-thought hash chain verification, and output sanitization monitoring.
- **Enterprise Tier System.** Five-tier subscription model (Community, Starter, Professional, Enterprise, MSSP) with feature gating, Stripe billing integration, and partner revenue share.
- **SoulGate API Gateway.** New microservice with seven-stage security pipeline: rate limiting, IP/geo access control, prompt injection detection (40+ patterns), circuit breakers with anti-weaponization, and upstream proxying.
- **MSSP Operations.** Multi-customer tenant management, cross-tenant detection rule push, white-labeled reporting, and partner dashboard.
- **Investigation Access Control.** Time-boxed, approval-gated access to tenant investigation data with full audit trail.
- **Contract Management.** Hash-chained contract versioning with digital signature and discount code generation.
- **CoT Policy Enforcement.** SoulGate-level chain-of-thought injection, rejection, and warning policies.
- **Generic API Proxy Mode.** Tiresias Proxy now supports proxying arbitrary API services (not just LLM providers) for cost attribution and observability.
- **Multi-Provider LLM Routing.** Cascade failover across OpenAI, Anthropic, Gemini, Groq, and Ollama providers.

#### Breaking Changes

| Change | Migration Action |
|--------|-----------------|
| Database schema v3.0 | Run Alembic migrations: `alembic upgrade head`. New tables for SoulGate, Aletheia, contracts, billing, and partner modules. |
| Environment variable prefix changes | SoulWatch variables now use `SOULWATCH_` prefix. SoulGate variables use `SOULGATE_` prefix. Update `.env` files. |
| JWT signing algorithm | ES256 is now the only supported algorithm. RSA keys from v2.x must be replaced with EC P-256 keys. |
| Portal build arguments | `NEXT_PUBLIC_*` variables must be passed as `--build-arg` at Docker build time. Runtime-only configuration no longer works. |
| SoulKey format | SoulKeys now use `sk_live_` and `sk_test_` prefixes. Existing keys remain valid but new keys use the new format. |
| Audit log schema | Audit log entries now include `hash_chain_prev` for tamper-evident chaining. Existing entries are grandfathered without chain links. |

#### Migration Guide

1. **Back up the database** before upgrading.
2. Stop all v2.x services.
3. Pull v3.0 container images.
4. Update `.env` files with new variable names and prefixes.
5. Generate EC P-256 key pair for JWT signing (replaces RSA keys).
6. Run Alembic migrations: `alembic upgrade head`.
7. Rebuild the Portal image with `--build-arg` for `NEXT_PUBLIC_*` variables.
8. Start services in order: PostgreSQL, SoulAuth, SoulWatch, SoulGate, Portal.
9. Verify with health check endpoints and smoke tests.
10. Re-issue SoulKeys for agents if migrating from pre-hash-chain format.

### 35.2 v2.x Release Notes

#### v2.5 (January 2026)

- Added Sigma detection rule engine with file-based rule loading.
- Added response playbook framework.
- Added SIEM integration (Splunk HEC, Elasticsearch, Syslog, Webhook).
- Added behavioral baseline engine with per-agent profiles.
- Improved audit log performance with batch writes.

#### v2.0 (October 2025)

- Introduced SoulWatch as a dedicated detection service (previously embedded in SoulAuth).
- Added Prometheus metrics endpoints to all services.
- Added notification channels (PagerDuty, Slack, email, Telegram).
- Added tenant isolation with per-tenant data partitioning.
- Moved from SQLite to PostgreSQL for enterprise deployments.

### 35.3 Deprecation Notices

| Feature | Deprecated In | Removal Target | Migration Path |
|---------|--------------|----------------|----------------|
| Supabase integration | v3.0 | v4.0 | Migrate to direct PostgreSQL with Alembic. |
| RSA JWT signing | v3.0 | v3.1 | Replace RSA keys with EC P-256 keys. Set `SOULAUTH_JWT_ALGORITHM=ES256`. |
| `SOULAUTH_MODE=local` SQLite | _(active)_ | No removal planned | For production, use `enterprise` mode with PostgreSQL. |
| Telegram notifications | _(active)_ | No removal planned | Consider migrating to Slack or PagerDuty for enterprise alerting. |

### 35.4 Known Issues

| Issue | Severity | Workaround | Fix Target |
|-------|----------|------------|------------|
| Policy sync shows "No cached policy found" when git repo is not configured | Low | Configure `SOULAUTH_POLICY_REPO_PATH` to point to a valid git repo with policy YAML files. | N/A (expected behavior) |
| Reports page shows hardcoded mock data | Low | No backend API for reports generation yet. Use SIEM exports for reporting. | v3.1 |
| DLQ shows hardcoded mock numbers | Low | Query dead letter queue directly via SoulWatch API. | v3.1 |
| Partner page returns 404 for non-partner tenants | Low | Register as a partner via `/v1/partner/register` first. | N/A (expected behavior) |
| Support tickets stored in local JSON | Medium | Backend support router not wired to database. Tickets are not persisted across restarts. | v3.1 |
| SoulWatch/SoulGate dashboards show zeros when no data | Info | By design. Dashboards display real data; zeros indicate no events have been processed. | N/A |

---

# Appendices

---

## Appendix A: Quick Reference Cards

### A.1 SoulKey Management Quick Reference

```
ISSUE A SOULKEY
  POST /v1/soulauth/admin/agents
  Body: {"name": "my-agent", "scopes": ["resources:read"]}
  Response includes "soulkey" field (one-time display -- save it immediately)

AUTHENTICATE WITH SOULKEY
  Add header: X-SoulKey: sk_live_<your_key>

GET A CAPABILITY TOKEN
  POST /v1/auth/token
  Header: X-SoulKey: sk_live_<your_key>
  Body: {"scopes": ["resources:read"]}
  Response: {"token": "eyJ...", "expires_at": "..."}

USE THE CAPABILITY TOKEN
  Add header: Authorization: Bearer eyJ...

ROTATE A SOULKEY
  POST /v1/soulauth/admin/agents/{id}/rotate
  Response includes new "soulkey" (one-time display)
  Old key is immediately invalidated

SUSPEND AN AGENT
  POST /v1/soulauth/admin/agents/{id}/suspend
  Agent cannot authenticate until reinstated

REINSTATE AN AGENT
  POST /v1/soulauth/admin/agents/{id}/reinstate

CHECK AGENT STATUS
  GET /v1/soulauth/admin/agents/{id}
  Look for "status" field: active, suspended, quarantined
```

### A.2 Sigma Rule Writing Quick Reference

```yaml
# Minimal Sigma rule for Tiresias
title: High-Volume Agent Requests
id: custom-001
status: experimental
level: high
description: Detect agents exceeding 1000 requests per 5 minutes
logsource:
  category: agent_activity
  product: tiresias
detection:
  selection:
    action: authenticate
  timeframe: 5m
  condition: selection | count() > 1000

---

# Field-matching rule
title: Unauthorized Scope Escalation
id: custom-002
status: experimental
level: critical
description: Detect agents requesting scopes beyond their baseline
logsource:
  category: agent_activity
  product: tiresias
detection:
  selection:
    action: authorize
    status: denied
    anomaly_type: scope_escalation
  condition: selection

---

# Supported operators:
#   | count() > N           Aggregation threshold
#   field: value            Exact match
#   field: "val*"           Wildcard match
#   field|contains: "str"   Substring match
#   field|startswith: "pre" Prefix match
#   field|endswith: "suf"   Suffix match
#   field|re: "regex"       Regular expression
#
# Supported timeframes: 1m, 5m, 15m, 1h, 6h, 24h
# Supported levels: informational, low, medium, high, critical
# Supported statuses: experimental, testing, stable, deprecated
```

### A.3 Troubleshooting Decision Tree

```
AGENT CANNOT AUTHENTICATE
|
+-- Is the SoulKey correct?
|   +-- No  --> Re-issue: POST /v1/soulauth/admin/agents/{id}/rotate
|   +-- Yes --> Is the agent suspended?
|       +-- Yes --> Reinstate: POST /v1/soulauth/admin/agents/{id}/reinstate
|       +-- No  --> Is the agent quarantined?
|           +-- Yes --> Release: POST /v1/enforcement/quarantine/{id}/release
|           +-- No  --> Check clock skew (JWT validation requires <30s drift)

TOKEN VALIDATION FAILS
|
+-- Is the token expired? (check "exp" claim)
|   +-- Yes --> Re-acquire from /v1/auth/token
|   +-- No  --> Is the JWT public key correct?
|       +-- Check SOULAUTH_JWT_PUBLIC_KEY or SOULAUTH_JWT_PUBLIC_KEY_PATH
|       +-- If using key rotation, verify JWT_KID matches the signing key

REQUESTS RETURNING 429
|
+-- Check X-RateLimit-Remaining header
|   +-- 0 --> Wait for X-RateLimit-Reset or increase rate limit
|   +-- >0 --> Check for burst limit (SOULGATE_DEFAULT_BURST_SIZE)

REQUESTS RETURNING 403
|
+-- "Policy denied" --> Check authorization policies in git repo
+-- "Prompt injection detected" --> Review request body, whitelist if false positive
+-- "Access rule blocked" --> Check IP/geo access rules in SoulGate
+-- "Tier restriction" --> Upgrade subscription tier

CIRCUIT BREAKER OPEN (503)
|
+-- Check upstream health: GET /gate/v1/circuits/{upstream_id}
+-- Manual reset: POST /gate/v1/circuits/{upstream_id}/reset
+-- If repeated: check upstream service health, increase failure threshold

SOULWATCH NOT DETECTING EVENTS
|
+-- Is detection enabled? Check SOULWATCH_DETECTION_ENABLED=true
+-- Are rules loaded? GET /watch/v1/rules (should return non-empty list)
+-- Is polling working? Check SOULWATCH_POLL_INTERVAL_SECONDS
+-- Check SoulWatch logs for pipeline errors
```

---

## Appendix B: Sample Configurations

### B.1 Starter Deployment

Minimal configuration for evaluation on a single machine.

**Environment File (`.env`):**

```bash
# Database
POSTGRES_USER=tiresias
POSTGRES_PASSWORD=change-me-in-production
POSTGRES_DB=tiresias

# SoulAuth
SOULAUTH_MODE=enterprise
SOULAUTH_DEBUG=false
SOULAUTH_LOG_LEVEL=INFO
SOULAUTH_AUTH_MODE=local
SOULAUTH_LOCAL_ADMIN_EMAIL=admin@example.com
SOULAUTH_LOCAL_ADMIN_PASSWORD=change-me-in-production
SOULAUTH_LICENSE_REQUIRED=false

# SoulWatch
SOULWATCH_MODE=sidecar
SOULWATCH_DETECTION_ENABLED=true

# SoulGate
SOULGATE_PROMPT_GUARD_ENABLED=true

# Internal
INTERNAL_API_KEY=generate-a-64-char-hex-string-here
```

**Docker Compose Override (`docker-compose.override.yml`):**

```yaml
services:
  soulauth:
    environment:
      SOULAUTH_MODE: enterprise
      SOULAUTH_AUTH_MODE: local
      SOULAUTH_LOCAL_ADMIN_EMAIL: admin@example.com
      SOULAUTH_LOCAL_ADMIN_PASSWORD: ${SOULAUTH_LOCAL_ADMIN_PASSWORD:?Must set admin password}
      SOULAUTH_LICENSE_REQUIRED: "false"

  portal:
    build:
      args:
        NEXT_PUBLIC_SOULAUTH_API_URL: http://localhost:8000
    ports:
      - "3000:3000"
```

**Start the deployment:**

```bash
docker compose up -d
docker compose ps     # Verify all services are healthy
curl http://localhost:8000/health
curl http://localhost:3000/
```

### B.2 Production Single-Tenant

Recommended configuration for a single-organization deployment with full security hardening.

**Environment File (`.env`):**

```bash
# Database
POSTGRES_USER=tiresias_prod
POSTGRES_PASSWORD=<generate-strong-password>
POSTGRES_DB=tiresias_prod

# SoulAuth
SOULAUTH_MODE=enterprise
SOULAUTH_DEBUG=false
SOULAUTH_LOG_LEVEL=INFO
SOULAUTH_AUTH_MODE=oidc
SOULAUTH_OIDC_ENABLED=true
SOULAUTH_OIDC_SECRET_KEY=<fernet-key>
SOULAUTH_OIDC_STATE_SECRET=<random-32-char-string>
SOULAUTH_OIDC_SESSION_TTL=28800
SOULAUTH_PUBLIC_URL=https://tiresias.example.com
SOULAUTH_ALLOWED_ORIGINS=["https://tiresias.example.com"]
SOULAUTH_JWT_PRIVATE_KEY_PATH=/run/secrets/jwt_private_key
SOULAUTH_JWT_PUBLIC_KEY_PATH=/run/secrets/jwt_public_key
SOULAUTH_JWT_KID=soulauth-2026-04
SOULAUTH_DEFAULT_TOKEN_TTL=300
SOULAUTH_MAX_TOKEN_TTL=900
SOULAUTH_LOGIN_MAX_ATTEMPTS=5
SOULAUTH_LOGIN_LOCKOUT_MINUTES=15
SOULAUTH_NOTIFICATIONS_ENABLED=true
SOULAUTH_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
SOULAUTH_NOTIFICATION_SEVERITY_THRESHOLD=medium
SOULAUTH_DETECTION_ENABLED=true
TIRESIAS_LICENSE_KEY=<license-jwt>
SOULAUTH_LICENSE_REQUIRED=true

# SoulWatch
SOULWATCH_MODE=sidecar
SOULWATCH_DETECTION_ENABLED=true
SOULWATCH_SIEM_ENABLED=true
SOULWATCH_SIEM_DESTINATIONS=[{"type":"splunk","url":"https://splunk.example.com:8088/services/collector","token":"<hec-token>"}]
SOULWATCH_ANOMALY_RETENTION_DAYS=90
SOULWATCH_DETECTION_RETENTION_DAYS=90
SOULWATCH_BASELINE_LOOKBACK_HOURS=168

# SoulGate
SOULGATE_PROMPT_GUARD_ENABLED=true
SOULGATE_DEFAULT_RATE_LIMIT_RPM=120
SOULGATE_DEFAULT_BURST_SIZE=20
SOULGATE_CIRCUIT_FAILURE_THRESHOLD=5
SOULGATE_CIRCUIT_COOLDOWN_SECONDS=30
SOULGATE_PROXY_TIMEOUT_MS=30000
SOULGATE_MAX_REQUEST_BODY_BYTES=10485760

# Internal
INTERNAL_API_KEY=<64-char-hex>
```

**Docker Compose Production Override:**

```yaml
services:
  postgres:
    environment:
      POSTGRES_INITDB_ARGS: "--auth-host=scram-sha-256"
    volumes:
      - pgdata:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 4G

  soulauth:
    secrets:
      - jwt_private_key
      - jwt_public_key
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2G
      replicas: 2

  soulwatch:
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 1G

  soulgate:
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 1G

  portal:
    build:
      args:
        NEXT_PUBLIC_SOULAUTH_API_URL: https://api.tiresias.example.com
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 1G

secrets:
  jwt_private_key:
    file: ./secrets/jwt_private.pem
  jwt_public_key:
    file: ./secrets/jwt_public.pem
```

### B.3 MSSP Multi-Tenant

Reference architecture for managed security service providers operating multiple customer tenants.

**GCP Cloud Run Deployment Commands:**

```bash
# Build and push images
gcloud builds submit --tag gcr.io/${PROJECT_ID}/tiresias-soulauth:v3.0 .
gcloud builds submit --tag gcr.io/${PROJECT_ID}/tiresias-soulwatch:v3.0 --file soulWatch/Dockerfile .
gcloud builds submit --tag gcr.io/${PROJECT_ID}/tiresias-soulgate:v3.0 --file soulGate/Dockerfile .
gcloud builds submit --tag gcr.io/${PROJECT_ID}/tiresias-portal:v3.0 \
  --file portal/Dockerfile \
  --substitutions="_SOULAUTH_URL=https://tiresias-soulauth-${PROJECT_NUMBER}.us-central1.run.app" \
  ./portal

# Deploy SoulAuth
gcloud run deploy tiresias-soulauth \
  --image gcr.io/${PROJECT_ID}/tiresias-soulauth:v3.0 \
  --region us-central1 \
  --memory 2Gi --cpu 2 \
  --min-instances 1 --max-instances 10 \
  --set-secrets="SOULAUTH_DATABASE_URL=tiresias-db-url:latest" \
  --set-secrets="SOULAUTH_DATABASE_URL_SYNC=tiresias-db-url-sync:latest" \
  --set-secrets="SOULAUTH_JWT_PRIVATE_KEY=tiresias-jwt-private:latest" \
  --set-secrets="SOULAUTH_JWT_PUBLIC_KEY=tiresias-jwt-public:latest" \
  --set-secrets="SOULAUTH_OIDC_SECRET_KEY=tiresias-oidc-secret:latest" \
  --set-secrets="SOULAUTH_OIDC_STATE_SECRET=tiresias-oidc-state:latest" \
  --set-secrets="TIRESIAS_LICENSE_KEY=tiresias-license:latest" \
  --set-env-vars="SOULAUTH_MODE=enterprise" \
  --set-env-vars="SOULAUTH_AUTH_MODE=oidc" \
  --set-env-vars="SOULAUTH_OIDC_ENABLED=true" \
  --set-env-vars="SOULAUTH_PUBLIC_URL=https://tiresias.network" \
  --set-env-vars="SOULAUTH_LICENSE_REQUIRED=true" \
  --set-env-vars="TIRESIAS_TIER=mssp" \
  --add-cloudsql-instances=${PROJECT_ID}:us-central1:tiresias-db

# Deploy SoulWatch
gcloud run deploy tiresias-soulwatch \
  --image gcr.io/${PROJECT_ID}/tiresias-soulwatch:v3.0 \
  --region us-central1 \
  --memory 1Gi --cpu 1 \
  --min-instances 1 --max-instances 5 \
  --set-secrets="SOULWATCH_DATABASE_URL=tiresias-db-url:latest" \
  --set-secrets="SOULWATCH_INTERNAL_API_KEY=tiresias-internal-key:latest" \
  --set-env-vars="SOULWATCH_MODE=sidecar" \
  --set-env-vars="SOULWATCH_DETECTION_ENABLED=true" \
  --set-env-vars="SOULWATCH_SIEM_ENABLED=true" \
  --add-cloudsql-instances=${PROJECT_ID}:us-central1:tiresias-db

# Deploy SoulGate
gcloud run deploy tiresias-soulgate \
  --image gcr.io/${PROJECT_ID}/tiresias-soulgate:v3.0 \
  --region us-central1 \
  --memory 1Gi --cpu 1 \
  --min-instances 1 --max-instances 10 \
  --set-secrets="SOULGATE_DATABASE_URL=tiresias-db-url:latest" \
  --set-secrets="SOULGATE_INTERNAL_API_KEY=tiresias-internal-key:latest" \
  --set-env-vars="SOULGATE_PROMPT_GUARD_ENABLED=true" \
  --add-cloudsql-instances=${PROJECT_ID}:us-central1:tiresias-db

# Deploy Portal
gcloud run deploy tiresias-portal \
  --image gcr.io/${PROJECT_ID}/tiresias-portal:v3.0 \
  --region us-central1 \
  --memory 1Gi --cpu 1 \
  --min-instances 1 --max-instances 5 \
  --set-env-vars="SOULAUTH_INTERNAL_URL=https://tiresias-soulauth-${PROJECT_NUMBER}.us-central1.run.app" \
  --set-env-vars="SOULWATCH_INTERNAL_URL=https://tiresias-soulwatch-${PROJECT_NUMBER}.us-central1.run.app" \
  --set-env-vars="SOULGATE_INTERNAL_URL=https://tiresias-soulgate-${PROJECT_NUMBER}.us-central1.run.app"

# Map custom domain
gcloud run domain-mappings create \
  --service tiresias-portal \
  --domain tiresias.network \
  --region us-central1
```

**MSSP Tenant Onboarding:**

```bash
# 1. Create customer tenant
curl -X POST https://tiresias.network/v1/saas/tenants \
  -H "X-SoulKey: sk_live_mssp_admin_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "tier": "professional",
    "admin_email": "soc@acme.com",
    "config": {
      "detection_enabled": true,
      "siem_enabled": false,
      "max_agents": 50,
      "retention_days": 90
    }
  }'

# 2. Push default detection rules
curl -X POST https://tiresias.network/v1/mssp/tenants/{tenant_id}/detections/push \
  -H "X-SoulKey: sk_live_mssp_admin_key" \
  -H "Content-Type: application/json" \
  -d '{"rule_set": "mssp-standard-v1"}'

# 3. Issue admin SoulKey for customer
curl -X POST https://tiresias.network/v1/soulauth/admin/agents \
  -H "X-SoulKey: sk_live_mssp_admin_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "acme-admin",
    "tenant_id": "{tenant_id}",
    "scopes": ["admin:*"],
    "metadata": {"type": "human", "role": "tenant_admin"}
  }'
```

---

## Appendix C: Compliance Mapping

### C.1 SOC 2 Type II Control Mapping

Tiresias platform capabilities mapped to SOC 2 Trust Services Criteria (TSC).

| TSC ID | Criteria | Tiresias Feature | Evidence Source |
|--------|----------|-----------------|----------------|
| **CC1.1** | Control environment integrity | RBAC with four predefined roles, OIDC/SSO enforcement | Admin API audit log, role assignment records |
| **CC1.2** | Board oversight | Executive dashboard, compliance reports | `/watch/v1/reports/executive` |
| **CC2.1** | Information quality | Tamper-evident SHA-256 hash chain for audit logs | Hash chain verification: `GET /v1/soulauth/admin/audit/chain/verify` |
| **CC3.1** | Risk assessment | Behavioral baselines, anomaly detection, risk scoring | SoulWatch anomaly records, baseline data |
| **CC3.2** | Fraud risk factors | Prompt injection detection, anti-weaponization safeguards | SoulGate audit logs, detection matches |
| **CC4.1** | Monitoring activities | Real-time event streaming, Prometheus metrics, alerting | WebSocket feed, Prometheus `/metrics`, Alertmanager |
| **CC4.2** | Evaluate and communicate deficiencies | Notification channels (Slack, PagerDuty, email), escalation paths | Notification delivery logs |
| **CC5.1** | Control activities | Policy-as-code authorization, rate limiting, circuit breakers | Policy evaluation logs, rate limit records |
| **CC5.2** | Technology controls | SoulKey authentication (SHA-512), ES256 capability tokens, envelope encryption | Token issuance logs, encryption records |
| **CC5.3** | Policy deployment | Git-synced policy repository, policy version history | Policy sync logs |
| **CC6.1** | Logical access | SoulKey-based agent identity, OIDC portal authentication | Authentication audit trail |
| **CC6.2** | Access provisioning | Agent registration with scope assignment, RBAC role assignment | Agent creation records, role assignment audit |
| **CC6.3** | Access modification | SoulKey rotation, scope updates, role changes | Audit log with before/after state |
| **CC6.4** | Access removal | Agent suspension, SoulKey revocation, quarantine | Suspension and revocation records |
| **CC6.5** | Account management | Agent lifecycle (active, suspended, quarantined, decommissioned) | Agent status history |
| **CC6.6** | Authentication mechanisms | SHA-512 SoulKey hashing, ES256 JWT, OIDC/SAML, LDAP, MFA via IdP | Configuration records, auth logs |
| **CC6.7** | Access restrictions | IP/geo access rules, rate limits, prompt injection blocking | SoulGate access rule records, block logs |
| **CC6.8** | Prevention of unauthorized access | Circuit breakers, quarantine automation, anti-weaponization | Circuit breaker state logs, quarantine records |
| **CC7.1** | Detection mechanisms | Sigma rules, behavioral baselines, 8 anomaly types | Detection match records, anomaly alerts |
| **CC7.2** | Security incident monitoring | Real-time WebSocket feed, Prometheus alerting, SIEM forwarding | Event stream, alert history |
| **CC7.3** | Incident response | Automated response playbooks, quarantine actions, notification dispatch | Playbook execution history |
| **CC7.4** | Incident recovery | Agent reinstatement, circuit breaker reset, policy rollback | Recovery action audit trail |
| **CC8.1** | Change management | Policy git sync, detection rule versioning, schema migrations | Git history, Alembic migration records |
| **CC9.1** | Risk mitigation | Multi-tier subscription with feature gating, tenant isolation | License records, tenant configuration |
| **A1.2** | Availability monitoring | Health check endpoints, Prometheus metrics, Alertmanager | `/health` responses, uptime metrics |
| **C1.1** | Confidentiality controls | Envelope encryption (AES-256-GCM), crypto-shredding, per-tenant isolation | Encryption configuration, DEK lifecycle |
| **C1.2** | Confidentiality disposal | Retention policies, automated purge, crypto-shredding | Purge execution logs |
| **PI1.1** | Privacy controls | Data minimization, purpose limitation, tenant isolation | Retention configuration, data flow documentation |

### C.2 ISO 27001 Annex A Mapping

Tiresias features mapped to ISO/IEC 27001:2022 Annex A controls.

| Control | Title | Tiresias Feature |
|---------|-------|-----------------|
| **A.5.1** | Policies for information security | Policy-as-code with git sync, policy evaluation PDP |
| **A.5.2** | Information security roles | RBAC (Global Admin, Tenant Admin, Analyst, Viewer) |
| **A.5.3** | Segregation of duties | Scope-based agent permissions, approval-required quarantine release |
| **A.5.15** | Access control | SoulKey authentication, capability tokens, OIDC/SSO |
| **A.5.16** | Identity management | Agent registration, SoulKey lifecycle, tenant identity |
| **A.5.17** | Authentication information | SHA-512 SoulKey hashing, one-time display, ES256 signing |
| **A.5.18** | Access rights | Scope assignment, policy evaluation, tier-based feature gating |
| **A.5.23** | Information security for cloud services | GCP Cloud Run deployment, Secret Manager, Cloud SQL |
| **A.5.24** | Incident management planning | Response playbooks, quarantine policies, escalation paths |
| **A.5.25** | Assessment of information security events | Sigma rules, anomaly detection, risk scoring |
| **A.5.26** | Response to information security incidents | Automated playbook execution, quarantine, notification dispatch |
| **A.5.28** | Collection of evidence | Tamper-evident audit logs, hash chain verification, investigation export |
| **A.5.33** | Protection of records | Hash-chained audit logs, retention policies, backup procedures |
| **A.5.34** | Privacy and PII | Tenant isolation, data minimization, crypto-shredding |
| **A.8.1** | User endpoint devices | Agent identity bound to SoulKey (not device) |
| **A.8.3** | Information access restriction | Rate limiting, IP/geo access rules, circuit breakers |
| **A.8.4** | Access to source code | Policy repository access controlled via git permissions |
| **A.8.5** | Secure authentication | ES256 JWT tokens, PKCE OIDC flow, bcrypt password hashing |
| **A.8.6** | Capacity management | Usage metrics, tier limits, capacity planning dashboards |
| **A.8.9** | Configuration management | Environment-based settings, infrastructure as code |
| **A.8.15** | Logging | Tamper-evident audit trail, CEF formatting, SIEM forwarding |
| **A.8.16** | Monitoring activities | Prometheus metrics, Alertmanager, WebSocket live feed |
| **A.8.20** | Networks security | Internal-only service ports, TLS termination, network segmentation |
| **A.8.24** | Use of cryptography | AES-256-GCM envelope encryption, SHA-256 hash chains, SHA-512 key hashing |
| **A.8.25** | Secure development lifecycle | Container hardening, image scanning, read-only filesystems |
| **A.8.28** | Secure coding | Input validation, prompt injection detection, OWASP pattern matching |

### C.3 NIST CSF Mapping

Tiresias features mapped to the NIST Cybersecurity Framework (CSF) v2.0 functions and categories.

| Function | Category | Tiresias Feature |
|----------|----------|-----------------|
| **GOVERN (GV)** | | |
| GV.OC | Organizational Context | Multi-tenant architecture with tier-based feature gating |
| GV.RM | Risk Management Strategy | Behavioral baselines, risk scoring, anomaly classification |
| GV.RR | Roles, Responsibilities | RBAC with four roles, scope-based agent permissions |
| GV.PO | Policy | Policy-as-code with git sync, policy evaluation PDP, version control |
| GV.SC | Supply Chain Risk | Prompt injection detection, upstream circuit breakers |
| **IDENTIFY (ID)** | | |
| ID.AM | Asset Management | Agent inventory, SoulKey registry, tenant configuration database |
| ID.RA | Risk Assessment | Per-agent risk scoring, behavioral baseline deviation analysis |
| ID.IM | Improvement | Compliance dashboard, detection efficacy metrics, false positive tracking |
| **PROTECT (PR)** | | |
| PR.AA | Identity Management and Access Control | SoulKey authentication, OIDC/SSO, capability tokens, RBAC, policy evaluation |
| PR.AT | Awareness and Training | Documentation portal, admin guide, security best practices |
| PR.DS | Data Security | Envelope encryption (AES-256-GCM), crypto-shredding, tenant isolation |
| PR.PS | Platform Security | Container hardening, read-only filesystems, capability drops, non-root execution |
| PR.IR | Technology Infrastructure Resilience | Circuit breakers, health checks, graceful degradation, horizontal scaling |
| **DETECT (DE)** | | |
| DE.CM | Continuous Monitoring | SoulWatch behavioral baselines, Sigma rule engine, real-time WebSocket feed |
| DE.AE | Adverse Event Analysis | Eight anomaly detectors, cross-agent correlation, investigation tools |
| **RESPOND (RS)** | | |
| RS.MA | Incident Management | Quarantine automation, response playbooks, notification dispatch |
| RS.AN | Incident Analysis | Investigation access control, event correlation, timeline reconstruction |
| RS.CO | Incident Reporting | SIEM forwarding (Splunk, Elastic, Syslog), CEF formatting, compliance reports |
| RS.MI | Incident Mitigation | SoulKey suspension, token revocation, rate throttling, circuit breaker trip |
| **RECOVER (RC)** | | |
| RC.RP | Incident Recovery Plan Execution | Agent reinstatement, circuit breaker reset, baseline rebuild |
| RC.CO | Recovery Communication | Notification channels (Slack, PagerDuty, email, Teams), executive reports |

---

> **Document End**
> Tiresias Administration Guide v3.0 -- Part X: Reference and Appendices
> Copyright 2026 Saluca LLC. All rights reserved.
