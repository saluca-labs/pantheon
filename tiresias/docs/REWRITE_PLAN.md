# Tiresias Portal -- Rewrite Plan

**Generated:** 2026-04-02
**Scope:** `portal/src/` (163 source files)
**Production URL:** https://tiresias.network
**Methodology:** APE/V (Assess / Plan / Execute / Verify)

---

## Executive Summary

The portal is functional and production-serving, but carries significant technical debt from the rapid build-out. The most urgent items are: (1) a hardcoded internal API key exposed as a fallback default, (2) six API routes with no session verification at all, (3) copy-pasted `verifySession` boilerplate across 11 route files, and (4) hardcoded tenant IDs scattered across 13 files. None of these are "ship-stopping" today, but they block multi-tenant scaling and present risk surface.

---

## CRITICAL -- Security Issues

### C-01: Hardcoded SoulWatch Internal Key as Fallback Default

**Status: COMPLETED in v3.1.0**

**Problem:** The string `"sw_metrics_scrape_2026"` is used as a fallback default for `SOULWATCH_INTERNAL_KEY` in 8 route files. If the env var is ever unset, every request to SoulWatch uses this predictable key. An attacker who discovers the key (it is in source) can call SoulWatch endpoints directly.

**Files (8 occurrences):**
- `src/app/api/watch/[...path]/route.ts:14`
- `src/app/api/soulwatch/dashboard/route.ts:21`
- `src/app/api/soulwatch/syslog/route.ts:15`
- `src/app/v1/enforcement/quarantine/route.ts:16`
- `src/app/v1/mssp/tenants/route.ts:19`
- `src/app/v1/mssp/enforcement/quarantine/route.ts:12`
- `src/app/v1/mssp/detection/matches/route.ts:16`
- `src/app/v1/mssp/aletheia/cot/route.ts:16`

**Fix:** Remove the fallback entirely. Fail loudly at startup if `SOULWATCH_INTERNAL_KEY` is not set. Centralize in a server config module that validates required env vars.

**Complexity:** S
**Outage required:** Yes (redeploy with env validation)

---

### C-02: Unauthenticated API Routes (Missing Session Verification)

**Status: COMPLETED in v3.1.0**

**Problem:** The following API routes perform server-side operations (fetching from internal services, writing to filesystem) but have NO session verification. Any unauthenticated request reaching these endpoints can read internal data.

**Unauthenticated routes:**
| Route | Risk |
|-------|------|
| `src/app/api/soulwatch/llm/route.ts` | Exposes LLM usage metrics |
| `src/app/api/soulwatch/dashboard/route.ts` | Exposes anomaly/detection/quarantine data |
| `src/app/api/soulwatch/agents/route.ts` | Exposes all soulkey agent data across tenants |
| `src/app/api/soulwatch/syslog/route.ts` | Can CREATE, UPDATE, DELETE syslog config |
| `src/app/api/soulgate/dashboard/route.ts` | Exposes full gateway audit data + key inventory |
| `src/app/api/soulgate/upstreams/route.ts` | Exposes all upstream/key data |
| `src/app/api/mssp/keys/route.ts` | Exposes soulkeys for any tenant_id |
| `src/app/api/mssp/usage/route.ts` | Exposes usage metrics for all tenants |
| `src/app/api/support/tickets/route.ts` | Read/write support tickets (filesystem) |
| `src/app/v1/enforcement/quarantine/route.ts` | Exposes quarantine data |
| `src/app/v1/mssp/tenants/route.ts` | Exposes all tenant data + agent counts |

**Fix:** Add `verifySession` to all routes. Better: use the shared middleware extraction (see H-01).

**Complexity:** M (11 files, but pattern is well-established)
**Outage required:** Yes (behavior change for any unauthenticated callers)

---

### C-03: Support Tickets Stored on Local Filesystem

**Problem:** `src/app/api/support/tickets/route.ts` reads/writes tickets to `data/support-tickets.json` using `fs.readFileSync`/`fs.writeFileSync`. In a containerized deployment:
- Data is lost on container restart
- No access control (any authenticated user could see all tickets)
- No tenant isolation
- Synchronous filesystem I/O blocks the event loop

**Fix:** Replace with a backend API call to SoulAuth or a dedicated ticketing service. Short-term: at minimum add session verification and tenant scoping.

**Complexity:** M
**Outage required:** Yes

---

### C-04: `catch (err: any)` in Auth Callback

**Status: COMPLETED in v3.1.0**

**Problem:** `src/app/api/auth/callback/route.ts:105` uses `catch (err: any)` which bypasses TypeScript's type safety. This is the OIDC callback -- a security-critical path.

**Fix:** Use `catch (err: unknown)` and narrow the type properly.

**Complexity:** S
**Outage required:** No (type-only change)

---

## HIGH -- Architectural Debt

### H-01: Duplicated `verifySession` Boilerplate (11 Copies)

**Status: COMPLETED in v3.1.0**

**Problem:** The identical `verifySession` function is copy-pasted across 11 route files. Each copy:
- Reads `tiresias_session` and `tiresias_oidc_session` cookies
- Calls `SOULAUTH_URL/v1/auth/local/session/verify`
- Returns `NextResponse` on failure or `null`/`string` on success

Two slight variants exist:
1. Returns `null` on success (investigation, partner, contracts, soulgate/audit, mssp routes)
2. Returns the session token string on success (dash, watch)

**Files:**
- `src/app/api/dash/[...path]/route.ts:19`
- `src/app/api/watch/[...path]/route.ts:19`
- `src/app/api/investigation/[...path]/route.ts:13`
- `src/app/api/partner/[...path]/route.ts:13`
- `src/app/api/contracts/[...path]/route.ts:13`
- `src/app/api/soulgate/audit/route.ts:19`
- `src/app/api/soulauth/agents/route.ts:12`
- `src/app/api/playground/run/route.ts:33`
- `src/app/api/mssp/provision/route.ts:12`
- `src/app/api/mssp/tenants/route.ts:13`
- `src/app/api/mssp/tenants/[tenantId]/suspend/route.ts:12`
- `src/app/api/mssp/tenants/[tenantId]/reactivate/route.ts:12`

**Fix:** Extract to `src/lib/server-auth.ts` with a single `verifySession(request)` that returns `{ token: string; tenantId: string }` or throws. All routes import from one place.

**Complexity:** M
**Outage required:** No (refactor, same behavior)

---

### H-02: Identical Proxy Route Pattern (4 Near-Clones)

**Status: Partially addressed in v3.1.0** -- shared `verifySession` extraction reduces duplication; full proxy factory not yet implemented.

**Problem:** `investigation/[...path]`, `partner/[...path]`, and `contracts/[...path]` are functionally identical -- only the backend path prefix differs (`/v1/investigation/`, `/v1/partner/`, `/v1/contracts/`). Each is ~130 lines of duplicated code.

**Fix:** Create a generic `createSoulAuthProxy(pathPrefix: string)` factory in `src/lib/proxy.ts` that returns `{ GET, POST, PUT, DELETE }` handlers. Each route file becomes a 3-line re-export.

**Complexity:** M
**Outage required:** No (refactor)

---

### H-03: Duplicated `resolveTenant` Helper (3 Copies)

**Status: COMPLETED in v3.1.0**

**Problem:** The `resolveTenant(request)` function that reads tenant ID from cookies is duplicated verbatim in:
- `src/app/api/soulgate/dashboard/route.ts:46`
- `src/app/api/soulgate/audit/route.ts:65`
- `src/app/api/soulgate/upstreams/route.ts:28`

**Fix:** Extract to `src/lib/server-auth.ts` alongside `verifySession`.

**Complexity:** S
**Outage required:** No

---

### H-04: Duplicated `tryFetch` Helper (5 Copies)

**Status: COMPLETED in v3.1.0**

**Problem:** A `tryFetch(url)` wrapper that returns `null` on failure is duplicated across 5 files with minor variations (some accept headers, some don't):
- `src/app/api/soulwatch/llm/route.ts:16`
- `src/app/api/soulwatch/dashboard/route.ts:23`
- `src/app/api/soulgate/upstreams/route.ts:15`
- `src/app/api/soulgate/dashboard/route.ts:29`
- `src/app/api/soulgate/audit/route.ts:52`

**Fix:** Extract to `src/lib/server-fetch.ts`.

**Complexity:** S
**Outage required:** No

---

### H-05: Duplicated `timeAgo` Helper (7 Copies)

**Status: COMPLETED in v3.1.0**

**Problem:** The `timeAgo(iso: string): string` utility is reimplemented 7 times across both server routes and client components:
- `src/app/api/soulgate/upstreams/route.ts:146`
- `src/app/dashboard/agents/page.tsx:69`
- `src/app/dashboard/soulwatch/anomalies/page.tsx:62`
- `src/app/dashboard/sessions/page.tsx:53`
- `src/app/dashboard/soulwatch/page.tsx:112`
- `src/app/dashboard/soulgate/page.tsx:88`
- `src/components/dashboard/widgets/SigmaMatches.tsx:31`

**Fix:** Extract to `src/lib/display.ts` (which already exists and has display helpers).

**Complexity:** S
**Outage required:** No

---

### H-06: Inconsistent Backend URL Fallback Strategy

**Status: COMPLETED in v3.1.0**

**Problem:** The same backend services are referenced with different fallback hostnames depending on the route file:

| Service | Fallback variants |
|---------|-------------------|
| SoulAuth | `http://soulauth:8000`, `http://soulauth-mssp:8000`, `http://soulauth.tiresias.svc.cluster.local`, `http://localhost:8000` |
| SoulWatch | `http://localhost:8001`, `http://soulwatch-mssp:8001` |
| SoulGate | `http://localhost:8002` |
| Tiresias Proxy | `http://tiresias-proxy:8080` |

Some routes use `process.env.VAR || process.env.VAR` (same var twice -- a copy-paste bug):
- `src/app/api/soulgate/dashboard/route.ts:15-16` (SOULAUTH duplicated)
- `src/app/api/soulgate/audit/route.ts:15-16` (SOULAUTH duplicated)
- `src/app/api/soulgate/upstreams/route.ts:11-12` (SOULAUTH duplicated)
- `src/app/api/soulwatch/llm/route.ts:12-13` (SOULWATCH duplicated)
- `src/app/api/soulwatch/dashboard/route.ts:16-17` (SOULWATCH duplicated)

**Fix:** Create `src/lib/server-config.ts` that centralizes ALL backend URLs with a single validated fallback per service. All route files import from there.

**Complexity:** M
**Outage required:** No (but deploy with env vars verified)

---

### H-07: No Error Boundaries in React Component Tree

**Status: COMPLETED in v3.1.0**

**Problem:** The portal has zero `error.tsx` files and no `ErrorBoundary` components. A runtime error in any dashboard page will crash the entire layout with an unrecoverable white screen.

**Fix:** Add `error.tsx` at `src/app/dashboard/error.tsx` (catches all dashboard errors) and per-section error boundaries for soulgate, soulwatch, etc.

**Complexity:** M
**Outage required:** No (additive)

---

## MEDIUM -- Code Quality and Performance

### M-01: Hardcoded Tenant IDs Across 13 Files

**Status: COMPLETED in v3.1.0**

**Problem:** Internal tenant UUIDs are scattered as string literals:
- `0c2515c2-1612-4a1a-bf72-47e760ccca51` ("Alfred Local") -- 8 files
- `00000001-0000-4000-a000-000000000001` ("Bootstrap Admin") -- 8 files
- `00000001-0000-4000-a001-000000000001` ("Twin Alpha") -- 6 files
- `00000001-0000-4000-a002-000000000001` ("Twin Ivory") -- 4 files

Some routes hardcode arrays of "all known tenants" to query across (soulwatch/agents, soulwatch/audit, soulgate/dashboard, soulgate/audit, soulgate/upstreams).

**Fix:** Move to `src/lib/server-config.ts` as named constants or fetch tenant list dynamically from SoulAuth admin API.

**Complexity:** M
**Outage required:** No

---

### M-02: Mock Data Fallback Pattern in Dashboard Pages

**Status: COMPLETED in v3.1.0**

**Problem:** Several dashboard pages define inline mock/fallback data arrays that activate when the real API returns empty. This means:
- Users see fake data mixed with real data (confusing)
- Mock arrays use `Math.random()` so they change on every render
- Two pages are 100% mock with no backend wiring at all

**Pages with mock fallback:**
- `src/app/dashboard/soulgate/page.tsx` -- `MOCK_HOURLY_REQUESTS`, `MOCK_BLOCK_REASONS`, `MOCK_TOP_BLOCKED_AGENTS`, `MOCK_UPSTREAMS`
- `src/app/dashboard/soulwatch/page.tsx` -- `MOCK_HOURLY_ANOMALIES`, `MOCK_TOP_AGENTS`, `MOCK_RECENT_DETECTIONS`

**Pages that are 100% mock:**
- `src/app/dashboard/soulwatch/reports/page.tsx` -- "Uses hardcoded mock data"
- `src/app/dashboard/policies/page.tsx` -- "Uses hardcoded mock data"

**Fix:** Replace mock fallback with explicit "no data" empty states. Mark 100% mock pages with a visible "Coming Soon" indicator rather than fake data.

**Complexity:** M
**Outage required:** No (UI improvement)

---

### M-03: Synthetic Latency Values (`Math.random()`) in API Routes

**Problem:** Two server-side API routes return random latency values to the frontend:
- `src/app/api/soulgate/dashboard/route.ts:198` -- `Math.floor(Math.random() * 80) + 10`
- `src/app/api/soulgate/upstreams/route.ts:118` -- same pattern

This means every page refresh shows different latency numbers for the same upstreams. Users may think the system is unstable.

**Fix:** Return `null` for latency until real latency tracking is implemented. The frontend should show "N/A" for null latency.

**Complexity:** S
**Outage required:** No

---

### M-04: N+1 Query Pattern in MSSP Tenants Route

**Problem:** `src/app/v1/mssp/tenants/route.ts` fetches all tenants, then for EACH tenant fetches keys individually in a `Promise.all` loop (line 66-78). With 50 tenants, this makes 52 HTTP requests (1 for tenants + 1 per tenant for keys + 2 for watch counts).

**Fix:** Request a batch endpoint from SoulAuth admin API that returns key counts per tenant in one call. Short-term: cache tenant key counts with a TTL.

**Complexity:** L (requires backend API change for full fix)
**Outage required:** No for caching fix; Yes for backend API change

---

### M-05: Cross-Tenant Data Leakage in Dashboard Aggregation

**Problem:** Several routes hardcode arrays of tenant IDs and query data across ALL of them, then merge results. This means any logged-in user sees aggregated data from tenants they don't own:
- `src/app/api/soulgate/dashboard/route.ts:101-104` -- queries 3 hardcoded tenant IDs
- `src/app/api/soulgate/audit/route.ts:110-114` -- same
- `src/app/api/soulwatch/agents/route.ts:22-27` -- queries 4 hardcoded tenant IDs
- `src/app/api/soulwatch/audit/route.ts:14-18` -- same

**Fix:** Remove hardcoded cross-tenant queries. Each user should only see data for their authenticated tenant. For MSSP admin views, fetch child tenant list from SoulAuth hierarchy API.

**Complexity:** M
**Outage required:** Yes (data visibility change)

---

### M-06: Widget Mock Data in Components

**Problem:** Dashboard widgets use `Math.random()` to generate sparkline and chart data:
- `src/components/dashboard/widgets/UsageMetrics.tsx:53` -- random daily counts
- `src/components/dashboard/widgets/TopAgents.tsx:39` -- random sparklines

**Fix:** Connect to real backend data or show "no data" state.

**Complexity:** M
**Outage required:** No

---

### M-07: Duplicated `process.env.VAR || process.env.VAR` (Copy-Paste Bug)

**Problem:** Five files reference the same env var twice in the fallback chain (e.g., `process.env.SOULAUTH_INTERNAL_URL || process.env.SOULAUTH_INTERNAL_URL`). This is a harmless no-op but indicates sloppy copy-paste and could mask a missing secondary env var.

**Files:**
- `src/app/api/soulgate/dashboard/route.ts:15-16`
- `src/app/api/soulgate/audit/route.ts:15-16`
- `src/app/api/soulgate/upstreams/route.ts:11-12`
- `src/app/api/soulwatch/llm/route.ts:12-13`
- `src/app/api/soulwatch/dashboard/route.ts:16-17`

**Fix:** Remove the duplicate. If a secondary fallback is intended, use the correct env var name.

**Complexity:** S
**Outage required:** No

---

### M-08: `console.log` Statements in Production Webhook Handler

**Problem:** `src/app/api/billing/webhook/route.ts` has 13 `console.log`/`console.error`/`console.warn` calls. In production, these go to stdout and may leak sensitive metadata (tenant IDs, subscription IDs, amounts) to container logs.

**Fix:** Replace with a structured logger that can be configured per environment. Redact sensitive fields.

**Complexity:** M
**Outage required:** No

---

## LOW -- Cosmetic / Nice-to-Have

### L-01: `any` Type Usage

**Problem:** Two locations use `any`:
- `src/app/api/auth/callback/route.ts:105` -- `catch (err: any)`
- `src/app/api/soulwatch/audit/route.ts:41` -- `allEvents.sort((a: any, b: any) =>`

**Fix:** Replace with proper types.

**Complexity:** S
**Outage required:** No

---

### L-02: Unused Import in `auth.ts`

**Problem:** `src/lib/auth.ts:30` has `// eslint-disable-next-line @typescript-eslint/no-unused-vars` for `config`.

**Fix:** Remove the unused import and the eslint-disable comment.

**Complexity:** S
**Outage required:** No

---

### L-03: Duplicate JSDoc Comment Blocks in `auth.ts`

**Problem:** `src/lib/auth.ts` has doubled-up JSDoc comments at lines 118-129 (`getSessionFromCookies`) and lines 193-205 (`oidcLogout`). The second comment in each pair is a more detailed version of the first.

**Fix:** Keep only the detailed version.

**Complexity:** S
**Outage required:** No

---

### L-04: Hardcoded `localhost:3000` Fallback in Auth Routes

**Problem:** `src/app/api/auth/callback/route.ts:19` and `src/app/api/auth/authorize/route.ts:10` fall back to `localhost:3000` for the host header. Harmless in production (headers are always present) but could cause redirect loops in edge cases.

**Fix:** Fail explicitly if no host header is present rather than falling back to localhost.

**Complexity:** S
**Outage required:** No

---

### L-05: `ChatWidget.tsx` Uses `Math.random()` for IDs

**Problem:** `src/components/dashboard/ChatWidget.tsx:56` generates message IDs with `Math.random().toString(36)`. Not a security issue (client-side only) but `crypto.randomUUID()` is available in all modern browsers.

**Fix:** Replace with `crypto.randomUUID()`.

**Complexity:** S
**Outage required:** No

---

### L-06: Agents Page UUID Generation Uses Math.random

**Problem:** `src/app/dashboard/agents/page.tsx:31` generates UUIDs via hex digits from `Math.random()`. This is for display-only mock data but is a bad pattern to have in the codebase.

**Fix:** Use `crypto.randomUUID()` or remove if mock-only.

**Complexity:** S
**Outage required:** No

---

## Recommended Execution Order

Phase 1 (pre-outage, safe refactors -- no behavior change):
1. H-01: Extract shared `verifySession` to `lib/server-auth.ts`
2. H-03: Extract shared `resolveTenant` to `lib/server-auth.ts`
3. H-04: Extract shared `tryFetch` to `lib/server-fetch.ts`
4. H-05: Extract shared `timeAgo` to `lib/display.ts`
5. H-06: Create `lib/server-config.ts` for all backend URLs
6. H-02: Create generic proxy factory for identical routes
7. M-07: Fix duplicate env var references
8. L-01 through L-06: Type fixes, unused imports, doc cleanup

Phase 2 (planned outage -- security fixes):
1. C-01: Remove hardcoded `sw_metrics_scrape_2026` fallback
2. C-02: Add session verification to all 11 unprotected routes
3. M-05: Remove cross-tenant data aggregation (data visibility change)
4. H-07: Add error boundaries

Phase 3 (follow-up -- functional improvements):
1. C-03: Replace filesystem ticket storage with backend API
2. M-01: Centralize tenant ID constants
3. M-02: Replace mock data with empty states
4. M-03: Replace synthetic latency with null/N/A
5. M-04: Add batch endpoint for tenant key counts
6. M-06: Connect widgets to real data
7. M-08: Replace console.log with structured logger

---

## Metrics

| Priority | Count | Estimated effort |
|----------|-------|-----------------|
| Critical | 4 | 2-3 days |
| High | 7 | 3-4 days |
| Medium | 8 | 4-5 days |
| Low | 6 | 1 day |
| **Total** | **25** | **10-13 days** |

---

## Verification Checklist

After each phase:
- [ ] All routes require session verification (grep for `export async function` without preceding `verifySession`)
- [ ] No hardcoded API keys in source (grep for `sw_metrics_scrape`)
- [ ] No hardcoded tenant UUIDs outside `server-config.ts` (grep for UUID patterns)
- [ ] No `process.env.X || process.env.X` duplicates
- [ ] `error.tsx` exists at dashboard level
- [ ] `npm run build` succeeds with zero TypeScript errors
- [ ] Smoke test: login, dashboard loads, soulwatch/soulgate pages render
- [ ] Portal Docker rebuild with `--build-arg` for NEXT_PUBLIC_* vars
- [ ] Run `smoke-test.sh` after each rebuild
