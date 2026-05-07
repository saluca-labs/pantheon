# Tiresias Platform — Current State Document
## Date: 2026-04-03

## Deployment Summary

### Cloud Run Services (SaaS)
| Service | Version | URL | Status |
|---------|---------|-----|--------|
| tiresias-portal | v3.4.4 | https://tiresias.network | Healthy |
| tiresias-soulauth | v3.4.4 | https://tiresias-soulauth-253892677982.us-central1.run.app | Healthy |
| tiresias-soulwatch | v3.4.4 | https://tiresias-soulwatch-253892677982.us-central1.run.app | Healthy |
| tiresias-soulgate | v3.4.4 | https://tiresias-soulgate-zsnoaggk6q-uc.a.run.app | Healthy |
| tiresias-proxy | v3.4.4 | https://tiresias-proxy-253892677982.us-central1.run.app | Healthy |

### Database
- Cloud SQL: `tiresias-db` (PostgreSQL 16, db-g1-small, us-central1-a)
- Connection: via Cloud SQL Auth Proxy socket

### DNS
- `tiresias.network` → Cloud Run domain mapping (Google-managed TLS cert)
- Cloudflare: A records (proxied/orange cloud) → 216.239.{32,34,36,38}.21

### Tenant
- Tiresias Public: `7f561f93-8a90-46c3-a757-dad9ce1fdb23` (tier: saas)
- Install license: saas NFR (JWT, exp 2028)
- SaaS master profile: Tiresias Public operates as the SaaS master tenant (hierarchy root)

### Tenant Hierarchy
- Tiresias Public is the root tenant (`parent_tenant_id: null`, `hierarchy_depth: 0`)
- Child tenants are provisioned via hierarchy-aware SaaS admin endpoints
- Tier-based creation matrix governs which tiers can create which child tiers
- Maximum hierarchy depth enforced per tier configuration
- MSSP provisioning now uses `/v1/saas/admin/tenants/provision` (hierarchy-aware)

---

## Portal Pages (71 total)

### Public (25 pages)
- `/` — Landing page
- `/login` — Login (local/LDAP/SSO)
- `/forgot-password`, `/reset-password` — Password reset
- `/platform`, `/platform/soulauth`, `/platform/soulwatch`, `/platform/soulgate` — Product pages
- `/use-cases`, `/pricing`, `/company`, `/security`, `/legal`, `/developers` — Marketing
- `/docs`, `/docs/user-guide`, `/docs/admin-guide`, `/docs/architecture` — Documentation
- `/trial`, `/trial/onboarding`, `/trial/verify` — Trial signup
- `/billing`, `/billing/success`, `/checkout/success` — Billing

### Dashboard (46 pages, all require auth)

#### Overview & System
- `/dashboard` — Main dashboard (customizable widget grid)
- `/dashboard/overview` — Overview summary
- `/dashboard/welcome` — First-visit onboarding
- `/dashboard/analytics` — Usage analytics
- `/dashboard/settings` — Account settings
- `/dashboard/support` — Support tickets

#### Observability (Tiresias Proxy)
- `/dashboard/traces` — Request traces
- `/dashboard/sessions` — Session management
- `/dashboard/providers` — Provider configuration
- `/dashboard/costs` — Cost tracking
- `/dashboard/playground` — LLM prompt testing

#### Agents & Policies
- `/dashboard/agents` — Agent monitoring
- `/dashboard/policies` — Policy management (read-only, git-sourced)
- `/dashboard/audit` — Audit logs

#### SoulWatch Module
- `/dashboard/soulwatch` — SoulWatch dashboard
- `/dashboard/soulwatch/anomalies` — Anomaly detection
- `/dashboard/soulwatch/rules` — Detection rules
- `/dashboard/soulwatch/quarantines` — Quarantine management
- `/dashboard/soulwatch/integrations` — SIEM integration
- `/dashboard/soulwatch/reports` — Reports (hardcoded mock)

#### Aletheia Module
- `/dashboard/aletheia` — Aletheia overview
- `/dashboard/aletheia/policies` — Security policies
- `/dashboard/aletheia/sanitizer` — Output sanitization
- `/dashboard/aletheia/tool-activity` — Tool monitoring
- `/dashboard/aletheia/cot-audit` — CoT audit

#### SoulGate Module
- `/dashboard/soulgate` — Gateway dashboard
- `/dashboard/soulgate/access` — Access rules
- `/dashboard/soulgate/audit` — Gateway audit log
- `/dashboard/soulgate/rate-limits` — Rate limiting
- `/dashboard/soulgate/upstreams` — Upstream management

#### Detection & Response
- `/dashboard/detection` — Detection overview
- `/dashboard/detection/playbooks` — Response playbooks
- `/dashboard/detection/prh` — Post-response handling
- `/dashboard/detection/rules` — Rule editor
- `/dashboard/detection/siem` — SIEM connector

#### Enterprise
- `/dashboard/quarantine` — Quarantine management
- `/dashboard/contracts` — Contract management
- `/dashboard/investigation` — Investigation tools

#### MSSP (requires mssp tier)
- `/dashboard/mssp` — MSSP overview
- `/dashboard/mssp/saas` — SaaS tenant management
- `/dashboard/mssp/saas/[tenantId]` — Tenant details
- `/dashboard/mssp/aletheia` — Cross-tenant Aletheia
- `/dashboard/mssp/aletheia/policies` — Cross-tenant policy push
- `/dashboard/mssp/detection` — Cross-tenant detection

#### Partner
- `/dashboard/partner` — Partner dashboard
- `/dashboard/partner/connect` — Partner onboarding
- `/dashboard/partner/promos` — Promotional tools

---

## Backend Services

### SoulAuth (Authentication & Authorization)
- 100+ API endpoints across 18 routers
- RBAC with OIDC session fallback
- Feature gate middleware (tier-based)
- Policy git sync
- License validation (JWT)
- JIT user provisioning (honors pending team invites)
- Local/LDAP/OIDC auth
- SaaS admin endpoints (`/v1/saas/admin/*`) for tenant hierarchy management
- Hierarchy-aware tenant provisioning with tier-based creation matrix
- New RBAC permissions: `hierarchy:manage`, `tenants:create`
- Team RBAC system: two-layer role model (portal-level + team-level)
- User management API (`/v1/users/*`) with CRUD operations
- Team management API (`/v1/teams/*`) with member management
- Invitation system (`/v1/invites/*`) with accept flow
- Account admin and secondary admin designations

### SoulWatch (Threat Detection & Analytics)
- Sigma detection engine with custom rules
- Behavioral baseline per agent
- Anomaly detection (statistical)
- Response playbooks with automation
- Aletheia: tool invocation audit, CoT chain verification
- SIEM forwarding (Splunk, Elastic, Syslog, Webhook)
- Dead letter queue
- WebSocket live streaming

### SoulGate (API Gateway)
- Reverse proxy with upstream management
- Rate limiting (sliding window, per-tenant/soulkey/endpoint)
- Access control (IP/geo allow/deny)
- Circuit breaker (3-state with anti-weaponization)
- Prompt injection detection (40+ OWASP patterns)
- CoT policy enforcement
- API key management
- Audit logging (batch async)

### Tiresias Proxy (LLM Observability)
- Multi-provider LLM proxy (Anthropic, OpenAI, Gemini, Groq, Ollama)
- Cascade failover routing
- Envelope encryption (AES-256-GCM)
- Session tracking
- Dashboard analytics (spend, latency, traces, sessions)
- Generic API proxy mode

---

## Current Functional Status

### Working
- OIDC login (Google SSO)
- Landing page + marketing pages
- Dashboard widget grid
- Playbooks page
- Rules page (SoulWatch)
- Rate limits page
- Access rules page
- Quarantine management
- Playground (with correct model names)
- MSSP sections (visible after re-login)
- Agents page
- API keys page
- SoulWatch dashboard (real data)
- SoulGate dashboard (real data, zeros)
- SaaS admin tenant hierarchy endpoints
- Hierarchy-aware MSSP provisioning
- Portal session verification on all routes (v3.1.0 hardening)
- Shared server-side libs with error boundaries (v3.1.0 hardening)
- Team RBAC with two-layer role model (v3.4.4)
- User CRUD, team management, invitation flow (v3.4.4)
- Team Settings tab in portal settings (starter tier+) (v3.4.4)

### No Data Yet (Expected)
- Traces, Sessions, Providers, Costs (no LLM traffic through SaaS proxy)
- Audit Trail, Detection Feed, PRH, SIEM Config
- Aletheia (all sub-pages)
- Upstreams, Audit Log (SoulGate)
- Analytics (no events yet)

### Known Issues
- Policy Status: "No cached policy found" (needs git sync config)
- Reports: hardcoded mock data (no backend API)
- DLQ: hardcoded mock numbers
- Partner: 404 (no partner record for tenant)
- Support: local JSON storage (backend router not wired)
- SoulWatch/SoulGate show 0s when no data instead of mock (by design now)

---

## Release History

### v3.4.4 (Current)
- Team RBAC system with two-layer role model: portal-level (owner/admin/operator/viewer) + team-level (team_admin/analyst/member)
- 3 new database tables: `_soul_teams`, `_soul_team_members`, `_soul_user_invites`
- 3 new SoulUser fields: `is_account_admin`, `is_secondary_admin`, `primary_team_id`
- 17 new API endpoints: `/v1/users` (CRUD), `/v1/teams` (CRUD), `/v1/teams/{id}/members` (CRUD), `/v1/invites` (CRUD + accept)
- Account admin and secondary admin designations for elevated tenant-wide operations
- JIT provisioning updated to honor pending invites (pre-assigned team and role on first login)
- Team Settings tab in portal settings (visible starter tier+)
- New RBAC permissions: `users:*`, `teams:*`, `invites:*`

### v3.2.0
- Tenant hierarchy system: `parent_tenant_id`, `hierarchy_depth`, tier-based creation matrix
- SaaS master profile concept (Tiresias Public as hierarchy root)
- New SaaS admin endpoints (`/v1/saas/admin/*`) for tenant lifecycle
- MSSP provisioning migrated to hierarchy-aware endpoint
- Tier upgraded from `mssp` to `saas` for Tiresias Public tenant
- New RBAC permissions: `hierarchy:manage`, `tenants:create`

### v3.1.0
- Portal security hardening: shared server-side libs, session verification on all routes, error boundaries
- Code rewrite phases: DRY refactors, security fixes, functional improvements

### v3.0.x
- Initial SaaS deployment on GCP Cloud Run
- Full portal wiring (71 pages)
- Settings backends (SIEM, Notifications, SSO, Billing)
- SaaS hardening (License PDP/PEP, Stripe tiers, partner rev share)

---

## Architecture

### Auth Flow
1. Browser → Portal (Next.js) → OIDC callback → SoulAuth → Google IdP
2. Session stored in HttpOnly cookies (tiresias_oidc_session + tiresias_oidc_data)
3. Portal middleware injects X-SoulKey for /v1/* and /dash/* paths
4. API routes verify session, forward to backends with appropriate auth headers

### Service Communication
- Portal → SoulAuth: SOULAUTH_INTERNAL_URL (Cloud Run service-to-service)
- Portal → SoulWatch: SOULWATCH_INTERNAL_URL with X-Internal-Key
- Portal → SoulGate: SOULGATE_INTERNAL_URL
- Portal → Proxy: TIRESIAS_PROXY_URL with X-SoulKey
- Proxy → SoulAuth: SOULAUTH_URL for SoulKey verification
- SoulWatch → SoulAuth: polls audit table (sidecar mode)
- SoulGate → SoulAuth: token validation

### Database
- Shared PostgreSQL (Cloud SQL) across all services
- 46 tables (soul_*, soulwatch_*, soulgate_*, tiresias_*, aletheia_*)
- Alembic migrations for schema management
