# Tiresias v3.6.1 - Pricing Quick Reference

**For Sales Team Use**

---

## Platform Pricing (Flat-Rate)

Tiresias bills per platform tier -- not per agent, not per seat.
All tiers include unlimited users. Pricing matches what is shown on https://tiresias.network/pricing.

| Tier | Monthly | Annual (save 17%) | Agents | Retention |
|---|---|---|---|---|
| **Open** | **Free** | Free | 25 agents | 7 days |
| **Starter** | **$49/mo** | $40.67/mo ($488/yr) | 50 agents | 30 days |
| **Pro** | **$199/mo** | $165.17/mo ($1,982/yr) | 250 agents | 90 days |
| **Enterprise** | **$2,499/mo** | $2,074.17/mo ($24,890/yr) | Unlimited | Custom |
| **MSSP** | $4,999/mo base + $199/tenant | Contact us | Unlimited | Per-tenant |
| **SaaS** | Custom | Custom | Unlimited | Managed |
| **Owner** | Internal only | N/A | Unlimited | Unlimited |

> **Owner tier** is reserved for Saluca platform operators and internal tooling. It is not customer-facing and carries no rate limits.

---

## Value Comparison (Per-Agent Breakdown)

*Use this section to illustrate value -- do not quote per-agent pricing to customers.*

For a team running 10 agents:

| Scenario | Tier | Effective per-agent | vs. Point Solutions |
|---|---|---|---|
| Observability only | Open | $0/agent | Free |
| Production security | Starter ($49/mo) | ~$5/agent | SoulAuth Pro alone would be $150/mo |
| Full detection + response | Pro ($199/mo) | ~$20/agent | SIEM + EDR equivalents start at $500+/mo |
| Enterprise compliance | Enterprise ($2,499/mo) | ~$250/agent | Custom SLAs, dedicated support |

---

## Tier Capabilities at a Glance

### Open (Free)
- Full observability dashboard
- PRH prompt risk scoring (read-only)
- 18-type anomaly detection (baselines)
- Self-hosted, unlimited seats, community support
- Rate limit: 60 requests/min

### Starter ($49/mo)
- Everything in Open
- Session replay + cost dashboard
- Provider health monitoring
- Basic analytics
- Team management (Team Settings tab, invitations)
- Password complexity enforcement (10+ chars, class rules, 500+ common password blocklist)
- Email support (48h)
- Rate limit: 120 requests/min

### Pro ($199/mo)
- Everything in Starter
- PRH Engine (full -- 60 patterns, 6 categories)
- Behavioral anomaly detection with alerting
- Sigma detection rules + response playbooks
- Quarantine management + prompt forensics
- Delegation + RBAC (two-layer: portal-level + team-level)
- User CRUD, team management, invitation flow (17 endpoints)
- Failed auth audit trail (login, OIDC, LDAP events)
- Priority support (24h)
- Rate limit: 300 requests/min

### Enterprise ($2,499/mo)
- Everything in Pro
- SIEM connectors (CEF/syslog/webhook)
- Policy enforcement (audit -> warn -> enforce)
- Custom detection rules
- Audit log export (tamper-evident, hash-chain integrity)
- Data export API (3 streaming endpoints: audit, keys, policies)
- Investigation token hardening (TTL-capped, rate-limited, HMAC-verified)
- OIDC hardened (PostgreSQL-backed nonce store, state secret enforcement)
- Dedicated support (8h SLA)
- Rate limit: 600 requests/min

### MSSP ($4,999/mo base + $199/tenant)
- Everything in Enterprise
- Multi-tenant hierarchy (parent-child with cycle detection, sibling guard, parent-chain walk)
- Cross-tenant detection + quarantine views
- Cross-tenant subtree expansion (keys, audit, spend, requests, latency dashboards)
- Tenant switcher UI in dashboard header
- White-label branding
- Tenant provisioning API (hierarchy-aware)
- Per-tenant pricing from $199/tenant
- Rate limit: 1,000 requests/min

---

## Enterprise Readiness (v3.6.1)

Tiresias v3.6.1 passes 32/32 items on its SaaS production readiness checklist. Key items:

- OIDC hardened (DB-backed nonce store, state secret enforcement at startup)
- Per-tenant rate limiting with tier-based limits
- Password complexity enforcement with common password blocklist
- Failed auth audit trail (3 event types)
- Audit hash chain integrity (prev_hash assertion at startup)
- Data export API (streaming, enterprise+ gated)
- Session cookie httpOnly + secure + sameSite
- Investigation token hardening (secrets.token_urlsafe, TTL cap, HMAC)
- Stripe webhook dual-mode auth
- 176 API endpoints documented via OpenAPI

---

## Deployment Options

### SaaS (Hosted)
- Fully managed on GCP Cloud Run
- Available at https://tiresias.network

### On-Premise / Self-Hosted
- Docker Hub: `salucalabs/*` images (v3.6.1)
- `docker compose pull && docker compose up -d`
- Full platform in under 15 minutes
- No external dependencies required

---

## Free Trial

- 14 days, full Pro access
- No credit card required
- After trial: subscribe or continue on Open (free forever)

---

## Annual Discount

Annual billing saves 17% (2 months free):
- Starter: $40.67/mo vs $49/mo (billed annually as $488/yr)
- Pro: $165.17/mo vs $199/mo (billed annually as $1,982/yr)
- Enterprise: $2,074.17/mo vs $2,499/mo (billed annually as $24,890/yr)

---

## Common Scenarios

| Scenario | Recommended | Monthly Cost |
|---|---|---|
| Indie dev / hobbyist | Open | Free |
| Small team, production | Starter | $49/mo |
| AI-native security team | Pro | $199/mo |
| Compliance-driven enterprise | Enterprise | $2,499/mo |
| MSSP / managed security | MSSP | $4,999/mo + $199/tenant |
| Evaluation / trial | Free Trial | $0 for 14 days |

---

## What Counts as an Agent?

An "agent" is any autonomous software entity with a Tiresias identity:
- AI agents and assistants
- Bots and automated workflows
- Microservices with agent identity

**Human users do not count** toward the agent limit. All tiers include unlimited seats.

---

*Saluca LLC | contact@saluca.com | v3.6.1*
