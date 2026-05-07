# Tiresias / SoulAuth — Session Backup
## Date: 2026-03-18T00:55:00Z
## Session: Full product build + deployment

### What Happened This Session

1. **Assessed SoulAuth** — Found Phase 1-5 complete (133 tests), identified gaps from 95% status report
2. **Strategic pivot** — Positioned SoulAuth as universal CLAW auth sidecar ("one sidecar to secure them all")
3. **Built 4 parallel streams** (sidecar adapter, infra, SDK+CLI, health monitoring) → 199 tests
4. **Fixed PDP bug** — minute overflow in `_count_active_capabilities` (timedelta vs replace)
5. **Pushed to GitHub** — github.com/cristianxruvalcaba-coder/soulauth (private)

6. **Named the brand: TIRESIAS** — Platform with 3 product lines:
   - SoulAuth (flagship, built) — Agent Identity & Zero-Trust Auth
   - SoulWatch (planned) — AI Runtime Security Monitoring
   - SoulGate (planned) — API Security Gateway

7. **Built sales package** (15 docs, 3 parallel agents):
   - Positioning, 15-slide pitch deck, talk track
   - 3 one-pagers, 4 battle cards, 2 demo scripts
   - Pricing ($15/agent/mo), 4 buyer personas, GTM strategy, 40-question FAQ

8. **Built enterprise features** (4 parallel agents):
   - SIEM forwarding: Splunk HEC, Elastic, Syslog/CEF, Azure Sentinel, Webhook (32 tests)
   - Anomaly detection: 8 types, behavioral baselines, analytics API (24 tests)
   - Enterprise notifications: PagerDuty, Slack, Teams, OpsGenie, email, SNS (16 tests)
   - Quarantine engine: 7 actions, auto-release, policy-owner thresholds (14 tests)
   - User-Agent ABAC: clearance hierarchy, relationship-based data scoping (17 tests)

9. **Built Sigma rule engine** — custom detection rules, 6 starters, 3 response playbooks (69 tests)

10. **Built SoulAuth ID tier** — local-first mode for indie devs:
    - SQLite backend, `soulauth init`, `soulauth dev`, `soulauth playground` (25 tests)
    - Pricing: Free → Pro ($15/agent/mo) → Enterprise (custom)

11. **Deployed to production**:
    - **URL**: https://tiresias.saluca.com (LIVE, all components healthy)
    - **Stack**: staging-tiresias → Caddy → SoulAuth → staging-infra Postgres
    - **Tunnel**: Cloudflare tunnel → cloudflared → localhost:8080
    - **DB**: Postgres 16 on staging-infra (user: saluca, db: soulauth)
    - **JWT**: ES256 keys at /home/cris/soulauth/keys/

### Final Numbers
- **396 tests passing**
- **~14K lines of code**
- **96 Python files**
- **35+ API endpoints**
- **16 sales documents**
- **9 Sigma rules + playbooks**
- **3 Git commits on main branch**

### Key Design Decisions
- Quarantine thresholds = policy-owner configurable, NOT hardcoded defaults
- Sigma rules for detection (SOC-team compatible, YAML-based)
- Sidecar pattern for universal CLAW compatibility
- "ID" = double meaning: Independent Developer + Identity
- Local-first (SQLite) for developer adoption funnel (PLG)

### Infrastructure
- GitHub: github.com/cristianxruvalcaba-coder/soulauth (private)
- Live: https://tiresias.saluca.com
- Node: staging-tiresias (100.116.160.125)
- DB: staging-infra (100.101.95.99:5432, user=saluca, db=soulauth)
- Tunnel: Cloudflare tunnel (cloudflared systemd service)
- Code on node: /home/cris/soulauth/
- Docker compose: docker-compose.prod.yml
- Keys: /home/cris/soulauth/keys/private.pem, public.pem

### Next Up (not started)
- **Customer portal (Next.js)**: Landing page + authenticated dashboard
  - Landing: product marketing, pricing, trial CTA
  - Dashboard: agents, policies, audit, anomalies, quarantine, settings
- Sync this backup to Supabase soul memory (soul-mcp not available this session)
