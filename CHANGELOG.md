# Changelog

All notable changes to the Tiresias Platform will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [3.4.4] - 2026-04-03

### Added
- SaaS launch: full platform wiring, security hardening, tenant hierarchy, team RBAC, partner revenue
- Team RBAC with 7 roles (owner, admin, operator, viewer, team_admin, analyst, member) (migration 0019)
- Partner program with Stripe Connect, commissions engine, invitations, promo codes (migration 0013)
- Contract management with hash chain verification and review workflow (migration 0014)
- SIEM connector configuration per tenant (migration 0015)
- Notification channels per tenant (migration 0016)
- Investigation tokens for forensic audit access (migration 0011)
- Local authentication (email/password with bcrypt, bootstrap admin) (migration 0006)
- LDAP/Active Directory authentication adapter (LDAPS, self-signed cert support)
- Self-service password reset flow
- Configurable login rate limiter
- Encrypted columns on audit log (migration 0018)
- License table and JWT license validation (migration 0010)
- Stripe customer ID column (migration 0012)
- Split token columns (migration 0008)
- Normalized tier defaults (migration 0009)
- Wire notification + SIEM pipelines to anomaly detection
- Settings backends: SIEM, SSO, notifications, billing
- SaaS hardening tiers 1-6, partner channel, contract automation
- Full portal wiring: demo-ready with real data across all pages
- Portal username/password login form for local + LDAP auth
- Remove all Coming Soon stubs (SSO, white-label, SIEM now live)

### Changed
- Standardized metadata column mapping (migration 0007)
- Dropped vestigial jwt_signature column (migration 0017)
- Middleware returns proper status codes instead of 500s
- IdP duplicate creation returns 409

### Fixed
- SIEM tenant scoping, IdP scopes type, RBAC header extraction
- LDAP: correct ssl import indentation, support LDAPS with self-signed certs, remove dn from search attributes
- Container health: soulgate upstream URLs, portal healthcheck
- Dashboard router Request annotation, auth verify URL, portal healthcheck
- Portal middleware auth, login page, settings tenant, dash routing
- SSO tab treats 404 as empty state instead of error
- Remove EmailStr dependency (email-validator not in image)
- Alembic dual-head 0002 migration collision resolved
- SoulAuth init_db runs unconditionally, bootstrap guarded with try/except
- Make Trivy SARIF upload non-blocking in security scan

## [Portal 2.6.0] - 2026-03-24

### Added
- GEO-optimized content: llms.txt, robots.txt, sitemap.xml, JSON-LD schema markup
- 5 blog posts on AI agent security topics

### Fixed
- Pin trivy-action to SHA instead of @master for CI supply chain safety

## [2.4.4] - 2026-03-22

### Added
- Enterprise sprint: waitlist system, portal refresh, feature gates
- OIDC SSO with Google Workspace IdP for saluca.com
- SSO/OIDC login flow, callback handler, and settings UI in portal
- SSO/OIDC backend implementation for enterprise portal auth
- Closed beta CTA and waitlist copy across portal

### Changed
- Trial CTAs replaced with "Join the Waitlist" with mailto links
- Removed "beta" from waitlist copy

### Fixed
- OIDC: static public_url for redirect_uri, work email label fix
- OIDC: 3 SSO flow bugs (domain resolution fallback, field name alignment, redirect_uri)
- OIDC: unescape template literal backticks in callback route
- OIDC: repair malformed SOULAUTH_OIDC_ENABLED env in soulauth-deployment.yaml
- Portal: SSO redirect uses NEXT_PUBLIC_APP_URL instead of container-internal address
- Stripe: wire real price IDs, fix cancellation tier, add HMAC webhook verification
- Stripe: correct STRIPE_PRICE_ENTERPRISE_ANNUAL yaml indentation
- Resolve all pre-existing test failures (699/699 passing)
- Comprehensive documentation sweep across all production code

## [2.3.2] - 2026-03-21

### Added
- README, CHANGELOG, LICENSE (BSL 1.1), CI test gate before deploy

### Fixed
- K8s enterprise readiness: HPA coverage, PDBs, RBAC bypass guard, secret hygiene

## [2.3.1] - 2026-03-21

### Fixed
- SoulWatch Dockerfile missing `src/__init__.py` COPY causing import failure
- DB connection exhaustion during rolling updates (switched to drain-then-add: maxSurge=0, maxUnavailable=1)
- SoulWatch missing SOULAUTH_DATABASE_URL env vars in k8s manifest

## [2.3.0] - 2026-03-21

### Added
- Customer lifecycle email system (triggers, templates, sender module)
- In-app support chatbot with SSE streaming and TF-IDF knowledge base
- Chat widget floating panel in dashboard layout
- Welcome wizard and first-login redirect
- Usage monitoring widget and overview page alert banner
- Usage limit middleware with tier-based enforcement
- Support ticket system with Telegram P0 notifications and Linear integration

### Changed
- All public pages migrated to Obsidian Flux design tokens (zero legacy tokens)
- Settings page wrapped in Suspense for useSearchParams compatibility

### Fixed
- SoulGate /keys 404 and missing PAGE_TITLES
- Duplicate API Keys nav entry in sidebar

## [2.2.0] - 2026-03-20

### Added
- Aletheia Chain-of-Thought extraction engine with SHA-512 hash chain
- CoT encrypted storage (AES-256-GCM) with proof-without-exposing APIs
- CoT policy enforcement at proxy layer (inject/reject/warn)
- Action Gate tool policy engine
- Response sanitizer engine with multi-pass decoder
- MSSP cross-tenant CoT audit and policy push
- Aletheia dashboard pages (5) with tier gating
- tiresias-exec Go binary for CLI tool invocation
- Billing module (portal session, tier upgrade, payment grace)
- SoulKey CRUD and usage stats module
- Trial and checkout flow (email-only, enterprise plan, 14-day trial)
- Stripe invoice handlers and trial expiry cron

## [2.1.0] - 2026-03-19

### Added
- 6-tier SKU system (community, starter, pro, enterprise, mssp, saas)
- MSSP multi-tenancy with BFS subtree isolation
- Feature gate middleware with 24 gated features
- White-label branding API per tenant

## [2.0.0] - 2026-03-18

### Added
- PRH prompt risk engine (60 patterns, 6 categories)
- 18-type anomaly detector
- SIEM connectors (CEF, syslog, webhook, Splunk, Elastic, Azure Sentinel)
- Sigma detection engine
- SoulGate API gateway with rate limiting and circuit breaker
- SoulWatch runtime behavioral monitoring

## [1.0.0] - 2026-03-15

### Added
- SoulAuth identity and zero-trust authorization engine
- SoulKey credential system with SHA-512 hashing
- Policy Decision Point (PDP) with YAML policy evaluation
- 4-tier RBAC (owner, admin, operator, viewer)
- Delegation system with TTL and scope
- Audit logging with SHA-256 hash chain
- Next.js portal with Obsidian Flux design system
- GKE deployment on tiresias-v2 cluster
