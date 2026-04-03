# Troubleshooting Flowcharts

> **Tiresias Administration Guide v3.0 -- L3 Drill-Down**
> **Classification:** Customer-Facing
> **Parent chapters:** Chapter 30 (Troubleshooting), Chapter 5 (SoulAuth), Chapter 15 (SoulGate)
> **Audience:** SOC analysts, platform operators, support engineers

---

## 1. Authentication Failure Decision Tree

Use this when an agent or user cannot authenticate.

```
Agent receives 401 or 403
|
+-- Is the SoulKey format valid? (starts with "sk_", 64+ hex chars)
|   |
|   +-- NO --> Fix the key format. SoulKeys must match: sk_agent_<tenant>_<persona>_<hex64>
|   |
|   +-- YES
|       |
|       +-- Call GET /v1/auth/whoami with the key
|           |
|           +-- Returns 401 "Invalid SoulKey"
|           |   |
|           |   +-- Key was never issued, or was issued to a different environment
|           |   +-- ACTION: Re-issue a new SoulKey via the Agents page or admin API
|           |
|           +-- Returns 200 with status: "revoked"
|           |   |
|           |   +-- Key was permanently revoked. Cannot be reactivated.
|           |   +-- ACTION: Issue a new SoulKey for this agent
|           |
|           +-- Returns 200 with status: "suspended"
|           |   |
|           |   +-- Key was suspended (manually or by quarantine playbook)
|           |   +-- ACTION: Reactivate via Settings > API Keys or release quarantine
|           |
|           +-- Returns 200 with status: "active"
|               |
|               +-- Key is valid. Problem is elsewhere.
|               |
|               +-- Is the Authorization header correct?
|               |   Format: "Authorization: Bearer <soulkey>"
|               |   Also needs: "X-SoulKey: <soulkey>"
|               |   |
|               |   +-- NO --> Fix header format
|               |   +-- YES
|               |       |
|               |       +-- Check clock skew
|               |       |   Server and client clocks must be within 30 seconds
|               |       |   |
|               |       |   +-- Skew > 30s --> Sync NTP on the client
|               |       |   +-- Skew OK
|               |       |       |
|               |       |       +-- Check capability token (if using PDP)
|               |       |           |
|               |       |           +-- Token expired (TTL 300-900s)
|               |       |           |   ACTION: Refresh the capability token
|               |       |           |
|               |       |           +-- Token scope mismatch
|               |       |           |   ACTION: Request token with correct resource:action:scope
|               |       |           |
|               |       |           +-- Token revoked (JTI in blocklist)
|               |       |               ACTION: Request a new token
```

### Common Authentication Errors

| Error | HTTP Code | Cause | Resolution |
|---|---|---|---|
| `Invalid SoulKey` | 401 | Key not found in database (SHA-512 hash mismatch) | Re-issue key |
| `SoulKey is revoked` | 403 | Permanently revoked | Issue new key |
| `SoulKey is suspended` | 403 | Temporarily suspended | Reactivate or release quarantine |
| `Token expired` | 401 | Capability token past TTL | Refresh token |
| `Insufficient scope` | 403 | Token does not grant required resource:action | Request broader scope |
| `Clock skew detected` | 401 | Client clock drift > 30s | Sync NTP |
| `Missing X-SoulKey header` | 401 | Request missing required header | Add `X-SoulKey` header |

---

## 2. Portal Login Failure Decision Tree

Use this when a user cannot log into the portal.

```
User cannot log in to portal at /login
|
+-- Which auth method?
    |
    +-- SoulKey login
    |   |
    |   +-- Is the SoulKey valid? (paste into /v1/auth/whoami via curl)
    |   |   |
    |   |   +-- NO --> See Authentication Failure tree (Section 1)
    |   |   +-- YES
    |   |       |
    |   |       +-- Does /api/session POST succeed?
    |   |           |
    |   |           +-- NO --> Check browser console for errors
    |   |           |   |
    |   |           |   +-- CORS error
    |   |           |   |   ACTION: Portal and API must be same origin or CORS configured
    |   |           |   |
    |   |           |   +-- Network error / connection refused
    |   |           |   |   ACTION: Verify portal can reach soulauth (check next.config.ts rewrites)
    |   |           |   |
    |   |           |   +-- 500 from session route
    |   |           |       ACTION: Check portal server logs (docker compose logs portal)
    |   |           |
    |   |           +-- YES --> Session created but dashboard not loading
    |   |               |
    |   |               +-- Check for tiresias_session_data cookie in browser
    |   |               |   |
    |   |               |   +-- Cookie missing --> Check if HttpOnly flag is correct, check domain
    |   |               |   +-- Cookie present --> Check if expired (compare expires_at to current time)
    |   |               |
    |   |               +-- Redirecting to /dashboard/welcome in a loop?
    |   |                   |
    |   |                   +-- tiresias_welcomed=1 cookie not being set
    |   |                       ACTION: Clear cookies, complete welcome flow, check for JS errors
    |
    +-- OIDC / SSO login
        |
        +-- Does the OIDC flow start? (click SSO login)
        |   |
        |   +-- NO --> Check if OIDC is configured: Settings > SSO tab
        |   |   |
        |   |   +-- SSO tab shows "Coming Soon" or upgrade prompt
        |   |       Tenant tier is below pro. OIDC requires pro+ tier.
        |   |
        |   +-- YES --> Redirects to IdP
        |       |
        |       +-- IdP login succeeds but callback fails
        |       |   |
        |       |   +-- Check /api/auth/callback logs
        |       |   |   |
        |       |   |   +-- "Invalid state" --> PKCE state mismatch
        |       |   |   |   ACTION: Clear cookies, retry. Check for multiple redirect URIs.
        |       |   |   |
        |       |   |   +-- "Token exchange failed" --> IdP rejected the code
        |       |   |   |   ACTION: Check client_id, client_secret, redirect_uri match IdP config
        |       |   |   |
        |       |   |   +-- "Email not found in claims" --> IdP not sending email claim
        |       |   |       ACTION: Configure IdP to include email in the ID token claims
        |       |   |
        |       |   +-- Callback succeeds but tiresias_oidc_data cookie not set
        |       |       ACTION: Check domain/path/secure flags on cookie. Must match portal URL.
        |       |
        |       +-- IdP login fails
        |           ACTION: This is an IdP-side issue. Check IdP logs, user account status, MFA.
```

---

## 3. Gateway 502 / 503 Decision Tree

Use this when SoulGate returns 502 Bad Gateway or 503 Service Unavailable.

```
SoulGate returns 502 or 503
|
+-- Check SoulGate health: curl http://soulgate:8002/health
|   |
|   +-- Health check fails (connection refused)
|   |   |
|   |   +-- SoulGate container is down
|   |   |   ACTION: docker compose up -d soulgate; check logs for crash reason
|   |   |
|   |   +-- SoulGate in crash loop
|   |       |
|   |       +-- Check logs: docker compose logs soulgate --tail 50
|   |           |
|   |           +-- "Database connection failed"
|   |           |   ACTION: Verify SOULGATE_DATABASE_URL, check postgres is healthy
|   |           |
|   |           +-- "SoulAuth unreachable"
|   |           |   ACTION: Verify SOULGATE_SOULAUTH_URL, check soulauth is healthy
|   |           |
|   |           +-- OOM killed
|   |               ACTION: Increase memory limit in docker-compose.yml
|   |
|   +-- Health check passes (200 OK)
|       |
|       +-- Is the upstream registered? Check /dashboard/soulgate/upstreams
|       |   |
|       |   +-- NO upstream registered
|       |   |   ACTION: Register the upstream service via Upstreams page or API
|       |   |
|       |   +-- Upstream registered but status is "down"
|       |       |
|       |       +-- Is the upstream service actually running?
|       |       |   |
|       |       |   +-- NO --> Start the upstream service
|       |       |   +-- YES
|       |       |       |
|       |       |       +-- Can SoulGate reach the upstream URL?
|       |       |       |   (check DNS resolution, network connectivity, TLS)
|       |       |       |   |
|       |       |       |   +-- DNS failure --> Fix upstream URL or DNS config
|       |       |       |   +-- Connection refused --> Upstream not listening on expected port
|       |       |       |   +-- TLS error --> Check certificate validity, CA trust
|       |       |       |   +-- Connection timeout --> Increase timeout_ms, check network
|       |       |       |
|       |       |       +-- Is the circuit breaker open?
|       |       |           |
|       |       |           +-- YES --> Circuit breaker tripped
|       |       |           |   |
|       |       |           |   +-- Recent failure rate exceeded threshold
|       |       |           |   |   ACTION: Wait for half-open recovery, or manually reset
|       |       |           |   |
|       |       |           |   +-- Admin lock is active
|       |       |           |       ACTION: Remove admin lock via SoulGate dashboard
|       |       |           |
|       |       |           +-- NO --> Check SoulGate logs for specific error
```

### Gateway Error Quick Reference

| Code | Meaning | Most Common Cause | First Check |
|---|---|---|---|
| 401 | Unauthorized | Missing or invalid SoulKey | `Authorization` and `X-SoulKey` headers |
| 403 | Forbidden | Key suspended/revoked, scope insufficient, IP blocked | Agent status, access rules |
| 429 | Rate Limited | Request rate exceeds configured limit | Rate limit config, per-agent overrides |
| 502 | Bad Gateway | Upstream unreachable or returned invalid response | Upstream service health |
| 503 | Service Unavailable | Circuit breaker open, or SoulGate overloaded | Circuit breaker state |
| 504 | Gateway Timeout | Upstream response exceeded timeout_ms | Upstream latency, timeout config |

---

## 4. Mock Data / Demo Data Decision Tree

Use this when portal pages show demo data instead of live data.

```
Portal page shows "Demo Data" badge or placeholder data
|
+-- Is this a new deployment with no agents registered?
|   |
|   +-- YES --> Expected behavior. Register agents and generate traffic first.
|   |
|   +-- NO --> Agents exist but data is not loading
|       |
|       +-- Check browser network tab for API calls
|           |
|           +-- API calls return 401 or 403
|           |   |
|           |   +-- Session expired
|           |   |   ACTION: Log out and log back in
|           |   |
|           |   +-- Tier insufficient for this feature
|           |       ACTION: Check TierGate. Upgrade tier or use a feature within your tier.
|           |
|           +-- API calls return 500
|           |   |
|           |   +-- Check backend service logs
|           |   |   docker compose logs soulauth --tail 50
|           |   |   docker compose logs soulwatch --tail 50
|           |   |
|           |   +-- Common causes:
|           |       - Database connection pool exhausted
|           |       - Missing database table (run alembic upgrade head)
|           |       - INTERNAL_API_KEY mismatch between services
|           |
|           +-- API calls return 404
|           |   |
|           |   +-- Portal rewrites misconfigured
|           |   |   ACTION: Verify next.config.ts rewrites. Check NEXT_PUBLIC_SOULAUTH_API_URL.
|           |   |
|           |   +-- Backend route does not exist
|           |       ACTION: Verify service version matches portal version
|           |
|           +-- API calls hang (no response)
|           |   |
|           |   +-- Backend service is unhealthy
|           |       ACTION: docker compose ps -- check for unhealthy services
|           |
|           +-- API calls succeed (200) but return empty data
|               |
|               +-- Data exists in database?
|               |   |
|               |   +-- NO --> No data generated yet. Expected for quiet tenants.
|               |   +-- YES
|               |       |
|               |       +-- Check tenant_id filter
|               |           API may be querying wrong tenant
|               |           ACTION: Verify session tenant matches data tenant
|               |
|               +-- Page falls back to mock data on empty responses
|                   This is by design -- the useWidgetData hook returns mock
|                   data when the API returns empty results for a better UX.
```

---

## 5. Tier Gating Issues Decision Tree

Use this when features appear locked or show upgrade prompts unexpectedly.

```
Feature shows "Upgrade Required" or lock icon
|
+-- Check current tier: look at Settings > Billing tab, or session.tier in browser cookies
|   |
|   +-- Tier is correct and should have access
|   |   |
|   |   +-- Is this a portal-side TierGate or backend-side gate?
|   |       |
|   |       +-- Portal TierGate (lock icon with upgrade message in the UI)
|   |       |   |
|   |       |   +-- Check session cookie: tiresias_session_data or tiresias_oidc_data
|   |       |   |   Parse the cookie and check the "tier" field
|   |       |   |   |
|   |       |   |   +-- Cookie tier is wrong (e.g., "community" instead of "enterprise")
|   |       |   |   |   |
|   |       |   |   |   +-- SoulKey login: /v1/auth/whoami returns wrong tier
|   |       |   |   |   |   ACTION: Check tenant record in database. Tier may not have updated.
|   |       |   |   |   |
|   |       |   |   |   +-- OIDC login: tier defaults to "enterprise"
|   |       |   |   |       If showing wrong tier, check OIDC callback tier assignment logic.
|   |       |   |   |
|   |       |   |   +-- Cookie tier is correct
|   |       |   |       ACTION: Check TierGate component. The requiredTier may be set higher
|   |       |   |       than expected. File a bug if the tier requirement is wrong.
|   |       |   |
|   |       |   +-- Cookie missing
|   |       |       ACTION: Session expired. Log in again.
|   |       |
|   |       +-- Backend gate (API returns 403 with tier message)
|   |           |
|   |           +-- Backend checks: TIER_RANK in tier_validator.py
|   |           |   community=0, starter=1, pro=2, enterprise=3, mssp=4, saas=5
|   |           |
|   |           +-- Check the feature_gate decorator on the backend endpoint
|   |           |   ACTION: Verify the endpoint's required tier matches documentation
|   |           |
|   |           +-- License key overrides tier ceiling
|   |               effective_tier = min(license_tier, subscription_tier)
|   |               ACTION: Check TIRESIAS_LICENSE_KEY JWT claims for tier cap
|   |
|   +-- Tier is lower than expected
|       |
|       +-- Subscription not active
|       |   ACTION: Check Settings > Billing. Complete Stripe checkout if needed.
|       |
|       +-- Subscription downgraded
|       |   ACTION: Contact billing support. Check Stripe dashboard.
|       |
|       +-- License key expired
|       |   ACTION: Renew license. Check TIRESIAS_LICENSE_KEY JWT expiry.
|       |
|       +-- Tenant created with wrong tier
|           ACTION: Update tenant tier via admin API:
|           curl -X PATCH /v1/soulauth/admin/tenants/<id> -d '{"tier":"enterprise"}'
```

---

## 6. Service Health Check Decision Tree

Use this for systematic health verification of the entire stack.

```
Checking platform health
|
+-- Step 1: Database
|   curl http://localhost:8000/health (includes database status)
|   |
|   +-- database: "connected" --> OK
|   +-- database: "disconnected" or timeout
|       |
|       +-- Is postgres container running?
|       |   docker compose ps postgres
|       |   |
|       |   +-- Not running --> docker compose up -d postgres
|       |   +-- Running but unhealthy
|       |       |
|       |       +-- Check logs: docker compose logs postgres --tail 20
|       |       +-- Common issues:
|       |           - Disk full (pgdata volume)
|       |           - Too many connections (increase max_connections)
|       |           - Corrupted data (restore from backup)
|       |
|       +-- Can soulauth reach postgres?
|           docker compose exec soulauth python -c "import asyncpg"
|           Check SOULAUTH_DATABASE_URL format
|
+-- Step 2: SoulAuth
|   curl http://localhost:8000/health
|   |
|   +-- 200 OK --> Healthy
|   +-- Connection refused --> Container down, check logs
|   +-- 500 --> Internal error, check logs for traceback
|
+-- Step 3: SoulGate
|   docker compose exec soulgate python -c "import httpx; print(httpx.get('http://localhost:8002/health').status_code)"
|   (No host port -- must exec into container or use network)
|   |
|   +-- 200 --> Healthy
|   +-- Cannot connect to SoulAuth
|       ACTION: Check SOULGATE_SOULAUTH_URL (should be http://soulauth:8000)
|
+-- Step 4: SoulWatch
|   docker compose exec soulwatch python -c "import httpx; print(httpx.get('http://localhost:8001/health').status_code)"
|   |
|   +-- 200 --> Healthy
|   +-- Cannot connect to SoulAuth
|       ACTION: Check SOULWATCH_SOULAUTH_URL
|
+-- Step 5: Portal
|   curl http://localhost:3000/
|   |
|   +-- 200 --> Healthy
|   +-- Connection refused --> Container down, check logs
|   +-- 500 --> Next.js build error
|       |
|       +-- NEXT_PUBLIC_SOULAUTH_API_URL was undefined at build time
|       |   ACTION: Rebuild portal with --build-arg
|       |
|       +-- Missing dependencies
|           ACTION: Rebuild from clean (docker compose build --no-cache portal)
|
+-- Step 6: Prometheus
|   docker compose exec prometheus wget -qO- http://localhost:9090/-/healthy
|   |
|   +-- "Prometheus Server is Healthy" --> OK
|   +-- Cannot scrape targets
|       ACTION: Check monitoring/prometheus.yml targets match service names
|
+-- Step 7: End-to-End
    Use a valid SoulKey to test the full pipeline:
    curl -H "Authorization: Bearer <key>" -H "X-SoulKey: <key>" \
      http://localhost:3000/v1/auth/whoami
    |
    +-- 200 with correct tenant data --> Full stack healthy
    +-- Any error --> Trace through steps 1-6 to find the broken link
```

---

## 7. INTERNAL_API_KEY Mismatch Decision Tree

This is one of the most common deployment issues.

```
Services returning 401/403 to each other
|
+-- Check INTERNAL_API_KEY is set in .env
|   |
|   +-- Not set or empty
|   |   ACTION: Generate a strong random key and set it in .env
|   |
|   +-- Set
|       |
|       +-- Is the SAME key used by all services?
|           |
|           +-- docker compose config | grep INTERNAL_API_KEY
|               (should show the same value for soulgate, soulwatch, and portal routes)
|           |
|           +-- Values differ
|           |   ACTION: Ensure all services read from the same .env file variable
|           |
|           +-- Values match
|               |
|               +-- Was the key changed after containers started?
|               |   ACTION: Restart all services: docker compose restart
|               |
|               +-- Check portal API routes inject the key correctly
|                   Look for X-Internal-Key header in /api/* routes
```

---

## 8. Portal Build Failure Decision Tree

```
Portal container fails to start or shows build errors
|
+-- docker compose logs portal --tail 50
|   |
|   +-- "NEXT_PUBLIC_SOULAUTH_API_URL is not defined"
|   |   ACTION: Rebuild with build-arg:
|   |   docker compose build --build-arg NEXT_PUBLIC_SOULAUTH_API_URL=http://soulauth:8000 portal
|   |
|   +-- "Module not found" or dependency errors
|   |   ACTION: Rebuild without cache:
|   |   docker compose build --no-cache portal
|   |
|   +-- "ENOSPC: no space left on device"
|   |   ACTION: Clean Docker: docker system prune -a
|   |
|   +-- Build succeeds but portal shows blank page
|   |   |
|   |   +-- Check browser console for JavaScript errors
|   |   |   |
|   |   |   +-- "hydration mismatch" --> Usually CSS/rendering issue, clear cache
|   |   |   +-- "fetch failed" --> API URLs wrong, check NEXT_PUBLIC_* vars
|   |   |   +-- No errors but blank --> Check if main.js loaded (network tab)
|   |   |
|   |   +-- Portal shows white screen with no errors
|   |       ACTION: Check if the standalone output exists in the container:
|   |       docker compose exec portal ls /app/.next/standalone/
|   |
|   +-- "read-only file system"
|       ACTION: This is expected (security hardening). Writable paths are /tmp only.
|       If the app needs to write elsewhere, check tmpfs mounts.
```

---

## 9. Quick Diagnostic Commands

Copy-paste these for rapid triage:

```bash
# Full stack health check (one command)
echo "=== Stack Status ===" && \
docker compose ps && \
echo -e "\n=== SoulAuth ===" && \
curl -sf http://localhost:8000/health | python -m json.tool 2>/dev/null || echo "FAIL" && \
echo -e "\n=== Portal ===" && \
curl -sf -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/ || echo "FAIL" && \
echo -e "\n=== Database ===" && \
docker compose exec -T postgres pg_isready -U ${POSTGRES_USER:-tiresias} 2>/dev/null || echo "FAIL"

# Check all service logs for errors in the last 5 minutes
docker compose logs --since 5m 2>&1 | grep -iE "error|exception|traceback|fail"

# Verify INTERNAL_API_KEY consistency
docker compose config 2>/dev/null | grep -A1 INTERNAL_API_KEY

# Check portal build-arg was applied
docker compose exec portal env | grep NEXT_PUBLIC

# Test full auth pipeline
SOULKEY="<your-key>"
curl -sf http://localhost:3000/v1/auth/whoami \
  -H "Authorization: Bearer ${SOULKEY}" \
  -H "X-SoulKey: ${SOULKEY}" | python -m json.tool

# Database connection test
docker compose exec postgres psql -U ${POSTGRES_USER:-tiresias} -d ${POSTGRES_DB:-tiresias} -c "SELECT count(*) FROM _soulauth_tenants;"
```
