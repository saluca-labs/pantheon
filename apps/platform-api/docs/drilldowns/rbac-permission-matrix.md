# RBAC Permission Matrix

> **Tiresias Administration Guide v3.3 -- L3 Drill-Down**
> **Classification:** Customer-Facing
> **Parent chapters:** Chapter 6 (Authorization Policies), Chapter 23 (Role-Based Access Control)
> **Audience:** Security administrators, IAM engineers, compliance officers

---

## 1. Role Hierarchy

### 1.1 Portal-Level Roles

Tiresias defines four predefined portal-level roles in a strict hierarchy. Each role inherits all permissions of the roles below it.

```
Global Admin
    |
Tenant Admin
    |
  Analyst
    |
  Viewer
```

| Role | Slug | Scope | Description |
|---|---|---|---|
| **Global Admin** | `global_admin` | All tenants | Full platform access. Can create tenants, manage billing, configure SSO, and modify any resource. |
| **Tenant Admin** | `tenant_admin` | Single tenant | Full control within their tenant. Can manage agents, policies, rules, users, teams, invitations, and settings. Cannot create tenants or access other tenants. |
| **Analyst** | `analyst` | Single tenant | Operational access. Can view all data, investigate incidents, manage quarantines, and modify detection rules. Can view users and teams. Cannot manage SoulKeys, billing, or user/team administration. |
| **Viewer** | `viewer` | Single tenant | Read-only access. Can view dashboards, audit logs, reports, users, and teams. Cannot modify any resource. |

### 1.2 Team-Level Roles (v3.3.0)

Team roles control access within a team context. They operate as a second authorization layer that further restricts permissions within team-scoped operations.

```
Team Admin
    |
  Analyst
    |
  Member
```

| Team Role | Slug | Scope | Description |
|---|---|---|---|
| **Team Admin** | `team_admin` | Single team | Full control of the team: manage members, edit team settings, perform all team-scoped operations. |
| **Analyst** | `analyst` | Single team | Operational team access: investigate incidents, manage quarantines, modify detection rules within team scope. |
| **Member** | `member` | Single team | Read-only team access: view team dashboards and shared resources. |

### 1.3 Account Admin Designations (v3.3.0)

Two special designations on the `_soul_users` record provide elevated tenant-wide authority:

| Designation | Field | Authority |
|-------------|-------|-----------|
| **Account Admin** | `is_account_admin` | Full tenant administrative authority. Bypasses team-level role checks. Can designate secondary admins. |
| **Secondary Admin** | `is_secondary_admin` | Delegated tenant administrative authority. Can manage users and teams but cannot modify account admin settings. |

---

## 2. Tier-Based Feature Gating

In addition to RBAC, features are gated by subscription tier. The tier hierarchy (lowest to highest):

```
community < starter < pro < enterprise < mssp < saas
```

The `TierGate` component and backend `feature_gate` middleware enforce this. A user with `Tenant Admin` role on a `starter` tier tenant cannot access `enterprise`-gated features regardless of their role.

| Feature | Minimum Tier | Gating Mechanism |
|---|---|---|
| Basic agent management | `community` | Always available |
| SoulKey creation/revocation | `starter` | Backend tier check |
| Detection rules (Sigma) | `pro` | Backend `feature_gate` |
| Response playbooks | `pro` | Backend `feature_gate` |
| SIEM integration | `pro` | Backend `feature_gate` |
| OIDC/SSO configuration | `pro` | Portal `TierGate` + backend |
| Team management (v3.3.0) | `starter` | Backend `feature_gate` |
| User management (v3.3.0) | `starter` | Backend `feature_gate` |
| Invitation management (v3.3.0) | `starter` | Backend `feature_gate` |
| Custom authorization policies | `enterprise` | Backend `feature_gate` |
| Delegation chains | `enterprise` | Backend `feature_gate` |
| Aletheia (CoT audit, tool activity) | `enterprise` | Backend `feature_gate` |
| Multi-tenancy | `enterprise` | Backend tenant model |
| MSSP console | `mssp` | Portal `TierGate` (requiredTier="mssp") |
| SaaS admin panel | `mssp` | Portal `TierGate` (requiredTier="mssp") |
| Cross-tenant detection | `mssp` | Portal `TierGate` (requiredTier="mssp") |
| Partner revenue share | `mssp` | Backend + Portal |
| White-label branding | `enterprise` | Portal `TierGate` |
| Investigation (evidence hashes) | `pro` | Portal `TierGate` |
| Investigation (full context) | `enterprise` | Portal `TierGate` |

---

## 3. API Endpoint Permission Matrix

### 3.1 Authentication Endpoints

| Endpoint | Method | Auth Required | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|---|
| `/v1/auth/whoami` | GET | SoulKey | Any | `community` | Validate SoulKey, return tenant/persona metadata |
| `/api/session` | POST | SoulKey (in body) | Any | `community` | Create HttpOnly session cookie |
| `/api/session` | DELETE | Session cookie | Any | `community` | Destroy session |
| `/api/auth/login` | POST | None | N/A | `community` | Local auth login (email/password) |
| `/api/auth/callback` | GET | OIDC state | Any | `pro` | OIDC callback handler |
| `/api/auth/authorize` | GET | None | N/A | `pro` | Initiate OIDC PKCE flow |
| `/api/auth/forgot-password` | POST | None | N/A | `community` | Password reset request |
| `/api/auth/reset-password` | POST | Reset token | N/A | `community` | Password reset execution |

### 3.2 Agent Management Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/v1/soulauth/admin/keys` | GET | `tenant_admin` | `starter` | List all SoulKeys for tenant |
| `/v1/soulauth/admin/keys` | POST | `tenant_admin` | `starter` | Issue a new SoulKey |
| `/v1/soulauth/admin/keys/:id/suspend` | POST | `tenant_admin` | `starter` | Suspend a SoulKey |
| `/v1/soulauth/admin/keys/:id/reactivate` | POST | `tenant_admin` | `starter` | Reactivate a suspended SoulKey |
| `/v1/soulauth/admin/keys/:id/revoke` | POST | `tenant_admin` | `starter` | Permanently revoke a SoulKey |
| `/api/soulauth/agents` | GET | `viewer` | `community` | List agents (portal proxy) |

### 3.3 Policy Management Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/v1/pdp/evaluate` | POST | Any (agent) | `community` | Evaluate authorization policy |
| `/v1/pdp/policies` | GET | `analyst` | `enterprise` | List all policies |
| `/v1/pdp/policies` | POST | `tenant_admin` | `enterprise` | Create/update policy |
| `/v1/pdp/policies/:id` | DELETE | `tenant_admin` | `enterprise` | Delete a policy |
| `/v1/pdp/policies/sync` | POST | `tenant_admin` | `enterprise` | Sync policies from git repo |

### 3.4 Detection and SoulWatch Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/api/soulwatch/dashboard` | GET | `viewer` | `community` | SoulWatch overview metrics |
| `/api/soulwatch/agents` | GET | `viewer` | `community` | Agent behavioral data |
| `/api/soulwatch/audit` | GET | `viewer` | `community` | SoulWatch audit events |
| `/api/soulwatch/llm` | GET | `analyst` | `pro` | LLM-specific detection data |
| `/api/soulwatch/syslog` | POST | `tenant_admin` | `pro` | Configure syslog forwarding |
| `/v1/detection/rules` | GET | `analyst` | `pro` | List Sigma detection rules |
| `/v1/detection/rules` | POST | `tenant_admin` | `pro` | Create/update detection rule |
| `/v1/detection/rules/:id` | DELETE | `tenant_admin` | `pro` | Delete a detection rule |
| `/v1/detection/matches` | GET | `analyst` | `pro` | List detection matches |
| `/v1/detection/playbooks` | GET | `analyst` | `pro` | List response playbooks |
| `/v1/detection/playbooks` | POST | `tenant_admin` | `pro` | Create/update playbook |
| `/v1/enforcement/quarantine` | GET | `analyst` | `pro` | List quarantine entries |
| `/v1/enforcement/quarantine` | POST | `analyst` | `pro` | Create quarantine entry |
| `/v1/enforcement/quarantine/:id/release` | POST | `analyst` | `pro` | Release quarantined agent |

### 3.5 SoulGate Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/api/soulgate/dashboard` | GET | `viewer` | `community` | Gateway metrics overview |
| `/api/soulgate/upstreams` | GET | `analyst` | `pro` | List upstream services |
| `/api/soulgate/upstreams` | POST | `tenant_admin` | `pro` | Register upstream service |
| `/api/soulgate/audit` | GET | `viewer` | `community` | Gateway audit trail |
| `/v1/soulgate/rate-limits` | GET | `analyst` | `pro` | View rate limit config |
| `/v1/soulgate/rate-limits` | POST | `tenant_admin` | `pro` | Configure rate limits |
| `/v1/soulgate/access-rules` | GET | `analyst` | `pro` | View IP/geo access rules |
| `/v1/soulgate/access-rules` | POST | `tenant_admin` | `pro` | Configure access rules |
| `/v1/soulgate/circuit-breakers` | GET | `analyst` | `pro` | Circuit breaker state |
| `/v1/soulgate/circuit-breakers/lock` | POST | `tenant_admin` | `enterprise` | Admin lock circuit breaker |

### 3.6 Portal Dashboard Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/api/dash/v1/spend` | GET | `viewer` | `community` | Cost summary (30d) |
| `/api/dash/v1/requests` | GET | `viewer` | `community` | Daily request counts |
| `/api/dash/v1/providers/health` | GET | `viewer` | `community` | Provider UP/DOWN status |
| `/v1/usage/alerts` | GET | `viewer` | `community` | Tier usage alerts |

### 3.7 Investigation Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/api/investigation/evidence/hashes` | POST | `analyst` | `pro` | Query evidence hashes by time range |
| `/api/investigation/evidence/context` | POST | `analyst` | `enterprise` | Query full evidence context (provider, tokens, cost) |

### 3.8 Billing and Subscription Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/api/billing/checkout` | POST | `tenant_admin` | `community` | Create Stripe checkout session |
| `/api/billing/portal` | POST | `tenant_admin` | `starter` | Create Stripe billing portal session |
| `/api/billing/session` | GET | `tenant_admin` | `starter` | Get current billing session |
| `/api/billing/webhook` | POST | None (Stripe) | N/A | Stripe webhook receiver |

### 3.9 User Management Endpoints (v3.3.0)

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/v1/users` | GET | `analyst` | `starter` | List portal users in tenant |
| `/v1/users/:id` | GET | `analyst` | `starter` | Get user details |
| `/v1/users/:id` | PATCH | `tenant_admin` | `starter` | Update user role, admin flags, team |
| `/v1/users/:id` | DELETE | `tenant_admin` | `starter` | Delete portal user |

### 3.10 Team Management Endpoints (v3.3.0)

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/v1/teams` | GET | `analyst` | `starter` | List teams in tenant |
| `/v1/teams` | POST | `tenant_admin` | `starter` | Create a new team |
| `/v1/teams/:id` | GET | `analyst` | `starter` | Get team details |
| `/v1/teams/:id` | PATCH | `tenant_admin` | `starter` | Update team name/description |
| `/v1/teams/:id` | DELETE | `tenant_admin` | `starter` | Delete team |
| `/v1/teams/:id/members` | GET | `analyst` | `starter` | List team members |
| `/v1/teams/:id/members` | POST | `tenant_admin` | `starter` | Add member to team |
| `/v1/teams/:id/members/:uid` | PATCH | `tenant_admin` | `starter` | Update member team role |
| `/v1/teams/:id/members/:uid` | DELETE | `tenant_admin` | `starter` | Remove member from team |

### 3.11 Invitation Endpoints (v3.3.0)

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/v1/invites` | GET | `analyst` | `starter` | List invitations |
| `/v1/invites` | POST | `tenant_admin` | `starter` | Create invitation |
| `/v1/invites/:id` | DELETE | `tenant_admin` | `starter` | Revoke invitation |
| `/v1/invites/:id/accept` | POST | Any (authenticated) | `starter` | Accept invitation (email must match) |

### 3.12 MSSP Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/api/mssp/tenants` | GET | `tenant_admin` | `mssp` | List managed tenants |
| `/api/mssp/provision` | POST | `tenant_admin` | `mssp` | Provision new customer tenant |
| `/api/mssp/tenants/:id/suspend` | POST | `tenant_admin` | `mssp` | Suspend customer tenant |
| `/api/mssp/tenants/:id/reactivate` | POST | `tenant_admin` | `mssp` | Reactivate customer tenant |
| `/api/mssp/usage` | GET | `analyst` | `mssp` | Cross-tenant usage metrics |
| `/api/mssp/keys` | GET | `tenant_admin` | `mssp` | Manage keys across tenants |
| `/v1/mssp/tenants` | GET | `tenant_admin` | `mssp` | Backend tenant list |
| `/v1/mssp/detection/matches` | GET | `analyst` | `mssp` | Cross-tenant detection matches |
| `/v1/mssp/enforcement/quarantine` | GET/POST | `analyst` | `mssp` | Cross-tenant quarantine |
| `/v1/mssp/aletheia/cot` | GET | `analyst` | `mssp` | Cross-tenant CoT audit |
| `/v1/mssp/aletheia/policies/push` | POST | `tenant_admin` | `mssp` | Push Aletheia policies to tenants |

### 3.13 SaaS Administration Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/v1/saas/admin/tenants` | GET | `tenant_admin` | `saas` | List all platform tenants |
| `/v1/saas/admin/tenants` | POST | `global_admin` | `saas` | Create new tenant |
| `/v1/saas/admin/stats` | GET | `tenant_admin` | `saas` | Platform-wide statistics |
| `/v1/saas/admin/hierarchy` | GET | `tenant_admin` | `saas` | Tenant hierarchy tree |
| `/v1/saas/admin/hierarchy` | POST | `global_admin` | `saas` | Manage tenant hierarchy |

### 3.14 Aletheia (AI Transparency) Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/v1/aletheia/cot-audit` | GET | `analyst` | `enterprise` | Chain-of-thought audit trail |
| `/v1/aletheia/tool-activity` | GET | `analyst` | `enterprise` | Tool invocation activity |
| `/v1/aletheia/sanitizer` | GET/POST | `analyst` | `enterprise` | Output sanitization rules |
| `/v1/aletheia/policies` | GET/POST | `tenant_admin` | `enterprise` | Aletheia policy management |

### 3.15 Settings and Configuration Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/api/session/tenant` | GET/POST | `tenant_admin` | `community` | Tenant display name |
| `/v1/settings/siem` | GET/POST | `tenant_admin` | `pro` | SIEM connector configuration |
| `/v1/settings/notifications` | GET/POST | `tenant_admin` | `starter` | Notification channels |
| `/v1/settings/sso` | GET/POST | `tenant_admin` | `pro` | SSO/OIDC IdP configuration |
| `/v1/settings/billing` | GET | `tenant_admin` | `starter` | Billing status and tier |
| `/v1/settings/branding` | GET/POST | `tenant_admin` | `enterprise` | White-label branding |

### 3.16 Support Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/api/support/tickets` | GET | `viewer` | `community` | List support tickets |
| `/api/support/tickets` | POST | `viewer` | `community` | Create support ticket |

### 3.17 Contract Management Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/api/contracts/*` | GET | `analyst` | `enterprise` | View contracts |
| `/api/contracts/*` | POST/PUT | `tenant_admin` | `enterprise` | Manage contracts |

### 3.18 Partner Endpoints

| Endpoint | Method | Minimum Role | Minimum Tier | Description |
|---|---|---|---|---|
| `/api/partner/*` | GET | `analyst` | `mssp` | View partner data |
| `/api/partner/*` | POST/PUT | `tenant_admin` | `mssp` | Manage partner config |

---

## 4. Permission Matrix Summary Table

Quick-reference: which roles can perform which operations.

| Operation | Viewer | Analyst | Tenant Admin | Global Admin |
|---|---|---|---|---|
| View dashboards | Yes | Yes | Yes | Yes |
| View audit logs | Yes | Yes | Yes | Yes |
| View detection feeds | Yes | Yes | Yes | Yes |
| Export reports | Yes | Yes | Yes | Yes |
| Create support tickets | Yes | Yes | Yes | Yes |
| Investigate incidents | No | Yes | Yes | Yes |
| Manage quarantines | No | Yes | Yes | Yes |
| Edit detection rules | No | Yes | Yes | Yes |
| Edit playbooks | No | Yes | Yes | Yes |
| Query evidence (hashes) | No | Yes | Yes | Yes |
| Query evidence (full context) | No | Yes | Yes | Yes |
| Issue/revoke SoulKeys | No | No | Yes | Yes |
| Configure SIEM | No | No | Yes | Yes |
| Configure SSO/OIDC | No | No | Yes | Yes |
| Configure rate limits | No | No | Yes | Yes |
| Configure access rules | No | No | Yes | Yes |
| Manage billing | No | No | Yes | Yes |
| Configure branding | No | No | Yes | Yes |
| Manage policies | No | No | Yes | Yes |
| Manage tenant hierarchy (`hierarchy:manage`) | No | No | Yes | Yes |
| Create tenants (`tenants:create`) | No | No | Yes | Yes |
| Provision tenants | No | No | Yes | Yes |
| View users (`users:read`) | Yes | Yes | Yes | Yes |
| Manage users (`users:create/update/delete`) | No | No | Yes | Yes |
| View teams (`teams:read`) | Yes | Yes | Yes | Yes |
| Manage teams (`teams:create/update/delete`) | No | No | Yes | Yes |
| Manage team members | No | No | Yes | Yes |
| View invitations (`invites:read`) | No | Yes | Yes | Yes |
| Manage invitations (`invites:create/delete`) | No | No | Yes | Yes |
| Accept invitation | Yes | Yes | Yes | Yes |
| Designate account admin | No | No | No | Yes |
| Designate secondary admin | No | No | Yes | Yes |
| Cross-tenant operations | No | No | No | Yes |
| Manage subscriptions | No | No | No | Yes |

---

## 5. Authentication Methods and Session Model

Tiresias supports two authentication paths, each producing a different session type:

### 5.1 SoulKey Direct Auth

- **Flow:** Client submits SoulKey to `/v1/auth/whoami` -> server validates SHA-512 hash -> `/api/session` creates HttpOnly cookie (`tiresias_session_data`)
- **Session lifetime:** Configurable, stored in cookie `expires_at` field
- **Tier resolution:** From the SoulKey's tenant record
- **Use case:** Individual developers, starter-tier tenants, API automation

### 5.2 OIDC / SSO Enterprise Auth

- **Flow:** Client initiates PKCE flow via `/api/auth/authorize` -> IdP authentication -> callback at `/api/auth/callback` -> sets `tiresias_oidc_data` cookie
- **Session lifetime:** Governed by IdP session + local cookie expiry
- **Tier resolution:** Always resolves to `enterprise` or higher
- **Priority:** OIDC sessions take priority over SoulKey sessions when both cookies are present (IdP-verified identity carries stricter guarantees)
- **Use case:** Enterprise tenants with centralized identity management

### 5.3 Cookie Priority

When both `tiresias_oidc_data` and `tiresias_session_data` cookies exist, the portal reads the OIDC cookie first. This ensures enterprise SSO sessions are not overridden by stale SoulKey cookies from prior sessions.

---

## 6. Internal Service Authentication

Backend services authenticate to each other using the `INTERNAL_API_KEY` shared secret, passed via the `X-Internal-Key` header. This key is required for:

- SoulGate -> SoulAuth token validation
- SoulWatch -> SoulAuth event consumption
- Portal API routes -> SoulAuth admin operations
- Tenant provisioning and cross-service coordination

The `INTERNAL_API_KEY` is never exposed to end users or the browser. Portal API routes inject it server-side before forwarding requests to backend services.
