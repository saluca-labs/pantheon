# Changelog

All notable changes to the Tiresias Platform will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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

### Added
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
