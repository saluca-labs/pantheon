# Tiresias Platform - General Availability Specification

**Status:** Ready to execute
**Target:** GA v1.0.0
**Date:** 2026-03-18
**Source:** Full codebase audit (47.7K LOC, 127 tests passing)

---

## Current State

| Component | LOC | Completion | Verdict |
|-----------|-----|------------|---------|
| SoulAuth Core | 13,214 | 85% | Production-grade engine, missing license enforcement + admin RBAC |
| SoulGate | 3,203 | 80% | Proxy/ratelimit/circuit breaker solid, prompt injection needs validation |
| SoulWatch | 5,563 | 80% | Detection/enforcement/analytics work, SIEM connectors untested against real endpoints |
| Portal | 17,615 | 40% | UI built, 11 of 14 dashboard widgets are mock data, no auth, trial form disconnected |
| SDK | 713 | 90% | Async client works, needs docs + PyPI packaging |
| Tests | 8,079 | 70% | 127 tests, no load/perf/chaos testing |
| Deployment | - | 80% | Docker works, K8s defined but unvalidated |
| Sales Materials | - | 95% | 8 docs, battlecard, playbook - ready |

**Bottom line:** The engine is real. The last mile - portal, enforcement, docs, validation - is not.

---

## GA Work Breakdown

### Track A: Portal Integration (BLOCKS DEMOS + SALES)
### Track B: License Enforcement (BLOCKS PAID TIERS)
### Track C: Security Hardening (BLOCKS ENTERPRISE)
### Track D: Validation & Docs (BLOCKS GA STAMP)

Tracks A and B are parallel. Track C starts after A. Track D runs last.

---

## Track A: Portal Integration

### A1 - Portal Authentication

**Problem:** Portal has zero auth. Anyone can access /platform/* dashboards.

**Files:**
- `portal/src/lib/auth.ts` (new)
- `portal/src/middleware.ts` (new)
- `portal/src/app/login/page.tsx` (new)
- `portal/src/app/platform/layout.tsx` (modify)
- `portal/src/components/layout/Navbar.tsx` (modify)

**Changes:**

Create auth context that validates against SoulAuth backend:

```typescript
// lib/auth.ts
interface AuthSession {
  soulkey: string;
  tenant_id: string;
  persona_id: string;
  tier: string;
  expires_at: number;
}

// Login: POST soulkey to /v1/auth/whoami, store session
// Middleware: check session on /platform/* routes, redirect to /login if missing
// Navbar: show tenant name + logout button when authenticated
```

Login page:
- Input: SoulKey (paste or enter)
- Validates against `/v1/auth/whoami`
- On success: stores session in httpOnly cookie, redirects to /platform
- On failure: shows error with link to /trial

Session management:
- Cookie-based, httpOnly, secure, SameSite=Strict
- TTL: 24 hours, refresh on activity
- Logout: clear cookie, redirect to /

**Tests:**
- Login with valid soulkey succeeds
- Login with revoked/suspended soulkey fails
- Unauthenticated access to /platform/* redirects to /login
- Session expiry forces re-login
- Logout clears session

---

### A2 - Dashboard Widget API Integration

**Problem:** 11 of 14 dashboard widgets display hardcoded mock data. Three (SigmaMatches, AlertFeed, AuditStream) already query the backend.

**Files to modify** (all in `portal/src/components/dashboard/widgets/`):

| Widget | Backend Endpoint | Data |
|--------|-----------------|------|
| TenantHealth | GET /health?detail=true | Component status, uptime |
| EvaluationTrends | GET /v1/soulauth/admin/audit?event_type=access_evaluated | Grant/deny counts over time |
| ThreatMap | GET /v1/analytics/anomalies | Anomaly locations/types |
| QuarantineStatus | GET /v1/enforcement/quarantine | Active quarantines |
| TopAgents | GET /v1/soulauth/admin/soulkeys + audit aggregation | Most active agents |
| PolicyStatus | GET /v1/soulauth/admin/policies/{tenant} | Policy sync state |
| AgentFleetMap | GET /v1/soulauth/admin/soulkeys | All agents with status |
| KeyLifecycle | GET /v1/soulauth/admin/soulkeys | Issued/suspended/revoked counts |
| UsageMetrics | GET /metrics (parse Prometheus) | Request counts, latency |
| QuickActions | N/A - links to admin operations | Wire to real admin endpoints |
| AnomalyChart | GET /v1/analytics/anomalies | Time-series anomaly data |

**Pattern for each widget:**

```typescript
// Replace hardcoded data with:
const [data, setData] = useState<WidgetData | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE}/<endpoint>`, {
        headers: { 'X-Tenant-ID': session.tenant_id, 'Authorization': `Bearer ${session.soulkey}` }
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  fetchData();
  const interval = setInterval(fetchData, 30000); // 30s refresh
  return () => clearInterval(interval);
}, []);

// Add loading skeleton + error state to render
```

**New shared files:**
- `portal/src/lib/api.ts` - API client with auth headers, base URL, error handling
- `portal/src/lib/config.ts` - `NEXT_PUBLIC_SOULAUTH_API_URL` env var

**Tests:**
- Each widget renders loading state
- Each widget renders data from API response
- Each widget renders error state on API failure
- Auto-refresh fires at correct interval

---

### A3 - Trial Registration Flow (Portal to Backend)

**Problem:** Trial form exists in portal UI. Backend POST /v1/trial/register works. They're not connected.

**Files:**
- `portal/src/app/trial/page.tsx` (modify)
- `portal/src/lib/api.ts` (extend)

**Changes:**

Wire the trial form submission:

```typescript
// On form submit:
const res = await api.post('/v1/trial/register', {
  contact_name: formData.name,      // "Cristian" only, no last name (per feedback)
  contact_email: formData.email,
  company_name: formData.company,
  company_domain: extractDomain(formData.email),
  use_case: formData.useCase,
});

// On success: show "Check your email" confirmation page
// On 409 (duplicate): show "Trial already exists" with support link
// On 429 (rate limit): show "Too many attempts" with cooldown timer
```

Add verification landing page:
- `portal/src/app/trial/verify/page.tsx` (new)
- Reads `trial_id` and `token` from URL params
- Calls GET /trial/verify?trial_id=...&token=...
- On success: shows activated soulkey (copy button, shown once warning)
- On failure: shows error with support link

Add post-activation onboarding:
- `portal/src/app/trial/onboarding/page.tsx` (new)
- Step 1: Copy your SoulKey (if just activated)
- Step 2: Install SDK (`pip install tiresias-sdk`)
- Step 3: Quick test (curl command to /v1/auth/whoami)
- Step 4: Link to docs

**Tests:**
- Form submission calls correct endpoint
- Success shows confirmation
- Duplicate email shows 409 error
- Rate limit shows cooldown
- Verification page activates trial
- Onboarding displays correct soulkey

---

### A4 - Portal Deployment Configuration

**Problem:** Portal has no build/deploy config. Can't ship it.

**Files:**
- `portal/Dockerfile` (new)
- `portal/.env.example` (new)
- `portal/next.config.js` (modify if needed)
- `docker-compose.yml` (extend)

**Changes:**

Portal Dockerfile:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
```

Add to docker-compose.yml:
```yaml
portal:
  build: ./portal
  ports:
    - "3000:3000"
  environment:
    - NEXT_PUBLIC_SOULAUTH_API_URL=http://soulauth:8000
  depends_on:
    soulauth:
      condition: service_healthy
```

Add to K8s manifests:
- Portal Deployment (2 replicas)
- Portal Service (ClusterIP, port 3000)
- Update Ingress: tiresias.saluca.com/ -> portal, tiresias.saluca.com/v1/ -> soulauth

**Tests:**
- Docker build succeeds
- Portal starts and serves /
- Portal can reach SoulAuth API
- Health check passes

---

## Track B: License Enforcement + Paid Tiers

### B1 - License JWT Validation at Bootstrap

(Per tiresias-enforcement SPEC.md Issue 1)

**Files:** `src/config.py`, `src/main.py` (lifespan)

**Changes:**

Add to settings:
```python
license_key: str = Field(default="", env="TIRESIAS_LICENSE_KEY")
license_grace_hours: float = Field(default=72.0)
license_required: bool = Field(default=True)
```

In lifespan, after DB init:
- Read TIRESIAS_LICENSE_KEY
- Call LicenseValidator.validate_with_grace()
- VALID: extract tier, features, is_nfr, partner_id. Update DB tier.
- GRACE: log warning, continue degraded
- INVALID + license_required: SystemExit(2)
- Store LicenseToken in app.state.license

**Tests:**
- Valid license proceeds, tier updated in DB
- Expired within grace continues with warning
- Expired past grace exits with code 2
- Missing key with license_required=False proceeds
- Tampered JWT rejected

---

### B2 - Feature Gate Middleware

(Per tiresias-enforcement SPEC.md Issue 3)

**File:** `src/middleware/feature_gate.py` (new)
**File:** `src/main.py` (register middleware)

**Feature-to-tier mapping:**
```python
FEATURE_TIERS = {
    # Starter (all tiers)
    "auth_identity":     ["starter", "pro", "enterprise"],
    "auth_evaluate":     ["starter", "pro", "enterprise"],
    "trial":             ["starter", "pro", "enterprise"],
    "health":            ["starter", "pro", "enterprise"],
    # Pro
    "analytics":         ["pro", "enterprise"],
    "detection_rules":   ["pro", "enterprise"],
    "delegation":        ["pro", "enterprise"],
    "policy_git_sync":   ["pro", "enterprise"],
    # Enterprise
    "enforcement":       ["enterprise"],
    "siem_forwarding":   ["enterprise"],
    "audit_export":      ["enterprise"],
    "multi_tenant":      ["enterprise"],
    "custom_detection":  ["enterprise"],
}

ROUTE_FEATURES = {
    "/v1/analytics":       "analytics",
    "/v1/detection":       "detection_rules",
    "/v1/enforcement":     "enforcement",
    "/v1/integrations":    "siem_forwarding",
}
```

Middleware returns 402 with:
```json
{
  "error": "feature_not_licensed",
  "feature": "enforcement",
  "tier_required": "enterprise",
  "tier_current": "starter",
  "upgrade_url": "https://tiresias.saluca.com/pricing"
}
```

**Tests:**
- Free/no license: only auth + trial endpoints work
- Starter: auth + evaluate work, analytics returns 402
- Pro: analytics + detection work, enforcement returns 402
- Enterprise: all features work
- NFR enterprise: all features work
- 402 response includes correct upgrade_url

---

### B3 - License Relay (Non-NFR Phone Home)

(Per tiresias-enforcement SPEC.md Issue 4)

**File:** `src/license/relay.py` (new or extend if exists)

Non-NFR licenses phone home on startup:
- POST to license server /v1/relay/renew
- Success: update expiry
- Failure: log warning, run on grace period (72h)
- NFR licenses skip entirely

**Tests:**
- NFR skips relay
- Non-NFR with offline relay logs warning, continues
- Successful renewal updates expiry

---

### B4 - Stripe Billing Integration

**Problem:** Pricing page exists but there's no way to actually pay.

**Files:**
- `portal/src/app/pricing/page.tsx` (modify - add checkout buttons)
- `portal/src/app/api/billing/checkout/route.ts` (new - Stripe session creation)
- `portal/src/app/api/billing/webhook/route.ts` (new - Stripe webhook handler)
- `portal/src/app/billing/success/page.tsx` (new)
- `portal/src/app/billing/page.tsx` (new - billing portal)
- `src/billing/` (new backend module - optional, or handle in portal API routes)

**Changes:**

Stripe Checkout integration:
```typescript
// POST /api/billing/checkout
// Creates Stripe Checkout Session for selected plan
// line_items mapped from PRICING_PLANS constant
// success_url: /billing/success?session_id={CHECKOUT_SESSION_ID}
// cancel_url: /pricing

// Webhook /api/billing/webhook
// checkout.session.completed -> activate subscription, issue license JWT
// customer.subscription.updated -> update tier
// customer.subscription.deleted -> downgrade to free
// invoice.payment_failed -> send warning email
```

Pricing plans (matching sales/05-pricing-reference.md):
```typescript
const PLANS = {
  soulauth_starter:   { price_monthly: 0,    stripe_price_id: 'price_...' },
  soulauth_pro:       { price_monthly: 1500, stripe_price_id: 'price_...' },  // $15/agent
  soulwatch_starter:  { price_monthly: 1000, stripe_price_id: 'price_...' },  // $10/agent
  soulwatch_pro:      { price_monthly: 2000, stripe_price_id: 'price_...' },  // $20/agent
  soulgate_starter:   { price_monthly: 1000, stripe_price_id: 'price_...' },  // $10/agent
  soulgate_pro:       { price_monthly: 2000, stripe_price_id: 'price_...' },  // $20/agent
  bundle_starter:     { price_monthly: 2900, stripe_price_id: 'price_...' },  // $29/agent
  bundle_pro:         { price_monthly: 4500, stripe_price_id: 'price_...' },  // $45/agent
};
```

Billing management page:
- Current plan display
- Usage (agent count)
- Upgrade/downgrade buttons
- Invoice history (Stripe Customer Portal link)
- Cancel subscription

**Tests:**
- Checkout creates valid Stripe session
- Webhook activates subscription on payment
- Webhook downgrades on cancellation
- Billing page shows current plan
- Upgrade flow changes tier in SoulAuth DB

---

### B5 - Admin RBAC

**Problem:** Admin API has zero access control. Any authenticated user can create/delete tenants, revoke keys, sync policies.

**Files:**
- `src/auth/rbac.py` (new)
- `src/middleware/rbac.py` (new)
- `src/admin/router.py` (modify - add dependency)
- `src/database/models.py` (modify - add role to tenant members)

**Changes:**

Role model:
```python
class AdminRole(str, Enum):
    OWNER = "owner"         # Full access, billing, delete tenant
    ADMIN = "admin"         # Key management, policy, audit
    OPERATOR = "operator"   # View dashboards, trigger sync, view audit
    VIEWER = "viewer"       # Read-only dashboard access

ROLE_PERMISSIONS = {
    "owner":    ["*"],
    "admin":    ["keys:*", "policy:*", "audit:read", "tenants:read", "detection:*", "enforcement:*"],
    "operator": ["keys:read", "policy:sync", "audit:read", "tenants:read", "detection:read", "enforcement:read"],
    "viewer":   ["audit:read", "tenants:read", "detection:read"],
}
```

RBAC middleware/dependency:
```python
def require_permission(permission: str):
    async def check(request: Request, db: AsyncSession = Depends(get_db)):
        soulkey = request.headers.get("X-SoulKey")
        # Resolve soulkey -> persona -> role
        # Check role has permission
        # Deny with 403 if not
    return Depends(check)

# Usage in admin router:
@router.post("/keys", dependencies=[Depends(require_permission("keys:create"))])
```

**Tests:**
- Owner can do everything
- Admin can manage keys but not delete tenant
- Operator can view but not modify
- Viewer gets 403 on write operations
- Unknown role gets 403

---

## Track C: Security Hardening

### C1 - SoulGate Prompt Injection Validation

**Problem:** Marketing claims "36 detection patterns" for prompt injection. Code has a regex-based detector. Need to validate it's real and effective, or fix it.

**Files:**
- `soulGate/src/detection/injection.py` (audit + extend)
- `soulGate/tests/test_injection.py` (new)

**Changes:**

Audit existing patterns against OWASP LLM Top 10:
- Category 1: Prompt injection (direct + indirect)
- Category 2: Insecure output handling
- Category 3: Training data poisoning (out of scope)

Minimum pattern coverage:
```python
INJECTION_PATTERNS = [
    # Direct injection
    r"ignore\s+(previous|above|all)\s+(instructions|prompts|rules)",
    r"disregard\s+(your|the|all)\s+(instructions|guidelines|rules)",
    r"forget\s+(everything|your|all)\s+(instructions|training|rules)",
    r"you\s+are\s+now\s+(?:a|an|the)\s+",
    r"new\s+instructions?\s*:",
    r"system\s*:\s*",
    r"<\|(?:system|im_start|endoftext)\|>",
    # Indirect injection
    r"when\s+the\s+(?:user|human|person)\s+(?:asks|says|types)",
    r"if\s+(?:asked|prompted|questioned)\s+about",
    # Jailbreak
    r"DAN\s+mode",
    r"developer\s+mode",
    r"(?:do|can)\s+anything\s+now",
    r"pretend\s+(?:you|that)\s+(?:are|have|can)",
    # Encoding evasion
    r"base64\s*(?:decode|encode)",
    r"\\x[0-9a-fA-F]{2}",
    r"&#\d+;",
    # Data exfiltration
    r"(?:send|post|fetch|curl|wget)\s+(?:to|from)\s+(?:https?://|ftp://)",
    r"(?:api[_-]?key|password|secret|token)\s*[:=]",
    # ... extend to 36+ validated patterns
]
```

Scoring model:
- Each pattern match adds to risk score
- Threshold: 0.3 = warn (log), 0.7 = block (403)
- Configurable per tenant

**Tests (test matrix):**
- 20+ known injection prompts -> detected
- 20+ benign prompts -> not flagged (false positive check)
- Encoding evasion attempts -> detected
- Score threshold enforcement
- Performance: <5ms per check on 10KB payload

---

### C2 - Rate Limiting on Trial Registration

**Problem:** Anti-abuse exists per domain/email, but no IP-level rate limiting. Attacker can burn through registrations with varied emails.

**Files:**
- `src/trial/router.py` (modify)
- `src/middleware/rate_limit.py` (new)

**Changes:**

Add IP-based rate limiting to trial endpoints:
```python
# Per IP: max 3 registrations per hour, max 10 per day
# Implementation: in-memory sliding window (acceptable for single instance)
# For multi-instance: use Redis or PostgreSQL advisory locks

@router.post("/register", dependencies=[Depends(rate_limit("trial_register", per_hour=3, per_day=10))])
```

Add email domain validation:
- Block disposable email domains (mailinator, guerrillamail, etc.)
- Configurable blocklist in settings
- Warn on free email providers (gmail, yahoo) but allow

**Tests:**
- 4th registration from same IP within 1 hour -> 429
- 11th registration from same IP within 1 day -> 429
- Disposable email domain -> 400 with clear message
- Different IPs -> independent limits

---

### C3 - Security Audit Checklist

**Problem:** No formal security review has been done.

**Scope:**

1. **Crypto review:**
   - SHA-512 soulkey hashing - verify no timing attacks in comparison
   - ES256 JWT signing - verify key rotation support
   - Token expiry enforcement - verify no clock skew exploits
   - Verify constant-time comparison for all secrets

2. **Injection review:**
   - Policy YAML loader - verify no arbitrary code execution
   - Sigma rule loader - verify sandboxed evaluation
   - Admin API inputs - verify parameterized queries (SQLAlchemy handles this)
   - Portal inputs - verify XSS prevention (React handles this)

3. **AuthZ review:**
   - PEP middleware coverage - verify no unprotected routes
   - Tenant isolation - verify no cross-tenant data access
   - Delegation scope - verify no privilege escalation via delegation chains
   - Admin API - verify RBAC enforcement (after B5)

4. **Infrastructure review:**
   - Docker image - verify no secrets baked in
   - K8s manifests - verify securityContext, no privileged containers
   - CORS policy - tighten from allow-all to specific origins
   - Rate limiting on all public endpoints

**Deliverable:** Security findings doc with severity ratings. All Critical/High must be fixed before GA.

**Files to modify (CORS tightening):**
- `src/main.py` - change `allow_origins=["*"]` to explicit list:
```python
ALLOWED_ORIGINS = [
    "https://tiresias.saluca.com",
    "http://localhost:3000",  # dev only, behind env flag
]
```

---

### C4 - Quarantine Policy Configuration API

**Problem:** Quarantine thresholds are hardcoded in DEFAULT_QUARANTINE_POLICIES. Per feedback_quarantine_policy.md, these must be policy-owner configurable.

**Files:**
- `src/enforcement/quarantine.py` (modify)
- `src/enforcement/router.py` (modify - expose config endpoints)
- `src/database/models.py` (add QuarantinePolicy table if not exists)

**Changes:**

Make quarantine policies per-tenant configurable:
```python
# Database model
class QuarantinePolicy(Base):
    __tablename__ = "_soulauth_quarantine_policies"
    id: UUID
    tenant_id: UUID (FK)
    trigger_type: str  # anomaly_score, denial_rate, rate_spike
    threshold: float
    action: str  # suspend_key, quarantine, alert_only
    cooldown_minutes: int
    auto_release_hours: float
    enabled: bool

# API
GET    /v1/enforcement/policies              -> list policies for tenant
POST   /v1/enforcement/policies              -> create policy
PATCH  /v1/enforcement/policies/{id}         -> update policy
DELETE /v1/enforcement/policies/{id}         -> delete policy
```

Enforcement engine reads from DB instead of hardcoded defaults. Seed defaults on tenant creation.

**Tests:**
- Custom thresholds respected
- Disabled policies skipped
- Default policies seeded for new tenants
- Policy CRUD operations work
- Auto-release timing respects policy config

---

## Track D: Validation & Documentation

### D1 - SIEM Connector Validation

**Problem:** Splunk, Elastic, Sentinel connectors exist in code but have never been tested against real endpoints.

**Files:**
- `src/integrations/siem/` (audit + fix)
- `tests/test_integrations/test_siem_live.py` (new)

**Validation plan:**

1. **Splunk HEC:**
   - Stand up Splunk Free (Docker: splunk/splunk:latest)
   - Configure HEC token
   - Send 1000 events via SoulAuth forwarder
   - Verify events appear in Splunk search
   - Verify CEF format parses correctly
   - Measure throughput (events/sec)

2. **Elasticsearch:**
   - Stand up Elasticsearch (Docker: elasticsearch:8.x)
   - Configure index template
   - Send 1000 events
   - Verify events in Kibana
   - Verify field mapping

3. **Azure Sentinel:**
   - Use Log Analytics workspace (GCP service account or test workspace)
   - Send 100 events via REST API
   - Verify events in Sentinel
   - (Can defer to post-GA if no Azure account available)

4. **Syslog:**
   - Stand up rsyslog container
   - Send 1000 events
   - Verify format + delivery

5. **Webhook:**
   - Use webhook.site or local receiver
   - Verify payload format
   - Verify retry on failure

**Deliverable:** Test report with throughput numbers. Fix any connector bugs found.

Add to docker-compose.yml (dev profile):
```yaml
# docker-compose.dev.yml
splunk:
  image: splunk/splunk:latest
  ports: ["8088:8088", "8089:8089"]
  environment:
    SPLUNK_START_ARGS: "--accept-license"
    SPLUNK_HEC_TOKEN: "test-token"

elasticsearch:
  image: elasticsearch:8.12.0
  ports: ["9200:9200"]
  environment:
    discovery.type: single-node
    xpack.security.enabled: "false"
```

---

### D2 - Load Testing

**Problem:** Zero performance baselines. Enterprise customers will ask "what's the p99 latency?" and we can't answer.

**Files:**
- `tests/load/locustfile.py` (new)
- `tests/load/scenarios.py` (new)

**Tool:** Locust (Python-native, fits our stack)

**Scenarios:**

```python
class SoulAuthUser(HttpUser):
    wait_time = between(0.1, 0.5)

    @task(10)
    def evaluate_access(self):
        """PDP evaluation - the hot path"""
        self.client.post("/v1/auth/evaluate", json={
            "resource": "memory", "action": "read", "scope": "*"
        }, headers={"X-SoulKey": self.soulkey})

    @task(5)
    def resolve_identity(self):
        self.client.get("/v1/auth/identity",
            headers={"X-SoulKey": self.soulkey})

    @task(2)
    def whoami(self):
        self.client.get("/v1/auth/whoami",
            headers={"X-SoulKey": self.soulkey})

    @task(1)
    def health_check(self):
        self.client.get("/health")
```

**Targets:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| PDP evaluation p50 | <20ms | Locust stats |
| PDP evaluation p99 | <100ms | Locust stats |
| Identity resolution p99 | <50ms | Locust stats |
| Sustained throughput | 1000 req/s | 10 min run |
| Error rate under load | <0.1% | Locust stats |
| Memory under load | <512MB | Docker stats |
| DB connections | <50 | pg_stat_activity |

**Run plan:**
1. Single instance, 100 concurrent users, 5 min warmup + 10 min sustained
2. Scale to 500 concurrent users, measure degradation
3. 3-replica K8s, 1000 concurrent users, 10 min sustained
4. Identify bottleneck (DB? CPU? memory?)

**Deliverable:** Performance report with graphs. Publish SLA targets based on results.

---

### D3 - API Documentation

**Problem:** No customer-facing API docs. Engineers can't integrate without reading source code.

**Files:**
- `src/main.py` (modify - enable OpenAPI schema with descriptions)
- `portal/src/app/docs/page.tsx` (new)
- `portal/src/app/docs/[section]/page.tsx` (new)

**Changes:**

1. **OpenAPI/Swagger enhancement:**
   - Add `description`, `summary`, `response_model`, `responses` to every endpoint
   - Add request/response examples
   - Group endpoints with tags (Auth, Admin, Trial, Detection, Enforcement, Analytics)
   - Enable Swagger UI at /docs and ReDoc at /redoc

2. **Portal docs pages:**
   - Quickstart (5-minute guide)
   - Authentication (soulkey concept, how to get one)
   - Authorization (PDP evaluation, capability tokens)
   - Policy-as-Code (YAML format, git sync setup)
   - Detection & Response (Sigma rules, playbooks, quarantine)
   - SIEM Integration (connector setup per destination)
   - SDK Reference (Python client usage)
   - API Reference (embedded Swagger/ReDoc)

3. **Integration examples:**
   - Python: basic auth flow (5 lines)
   - Python: policy evaluation with delegation
   - curl: all major endpoints
   - Docker Compose: full stack setup

**Deliverable:** Docs accessible at tiresias.saluca.com/docs

---

### D4 - SDK Packaging & Distribution

**Problem:** SDK exists but isn't installable via pip.

**Files:**
- `sdk/` (new top-level directory, extracted from src/sdk/)
- `sdk/pyproject.toml` (new)
- `sdk/README.md` (new)
- `sdk/tiresias/__init__.py` (new)
- `sdk/tiresias/client.py` (from src/sdk/client.py)
- `sdk/tiresias/models.py` (from src/sdk/models.py)
- `sdk/tiresias/exceptions.py` (from src/sdk/exceptions.py)

**pyproject.toml:**
```toml
[project]
name = "tiresias-sdk"
version = "1.0.0"
description = "Python SDK for Tiresias - Zero-trust agent security"
requires-python = ">=3.10"
dependencies = ["httpx>=0.25.0", "pydantic>=2.0.0"]

[project.urls]
Homepage = "https://tiresias.saluca.com"
Documentation = "https://tiresias.saluca.com/docs"
```

**Distribution:**
- Publish to PyPI as `tiresias-sdk`
- Include in docs quickstart: `pip install tiresias-sdk`

---

### D5 - End-to-End Integration Tests

**Problem:** 127 unit/integration tests exist but no test covers the full customer journey.

**File:** `tests/test_e2e/test_customer_journey.py` (new)

**Test scenarios:**

```python
class TestCustomerJourney:
    """Full lifecycle: trial signup -> activation -> usage -> enforcement -> billing"""

    async def test_trial_to_production(self):
        # 1. Register trial
        trial = await client.post("/v1/trial/register", json={...})
        assert trial.status_code == 201

        # 2. Verify email
        activation = await client.get(f"/trial/verify?trial_id={trial_id}&token={token}")
        assert activation.status_code == 200
        soulkey = activation.json()["soulkey"]

        # 3. Resolve identity
        identity = await client.get("/v1/auth/identity", headers={"X-SoulKey": soulkey})
        assert identity.json()["persona_id"] == "trial_admin"

        # 4. Evaluate access
        result = await client.post("/v1/auth/evaluate", json={
            "resource": "memory", "action": "read", "scope": "*"
        }, headers={"X-SoulKey": soulkey})
        assert result.json()["decision"] == "GRANT"

        # 5. Check feature gates (trial = starter tier)
        analytics = await client.get("/v1/analytics/anomalies",
            headers={"X-SoulKey": soulkey})
        assert analytics.status_code == 402  # Not on pro tier

        # 6. Verify audit trail
        audit = await client.get("/v1/soulauth/admin/audit",
            headers={"X-Tenant-ID": tenant_id})
        assert len(audit.json()["events"]) >= 3

    async def test_threat_detection_to_quarantine(self):
        # 1. Create agent
        # 2. Generate suspicious behavior (rapid-fire requests)
        # 3. Verify anomaly detected
        # 4. Verify quarantine triggered
        # 5. Verify agent access blocked
        # 6. Verify alert sent (mock notification sink)
        # 7. Release quarantine
        # 8. Verify agent access restored

    async def test_multi_tenant_isolation(self):
        # 1. Create tenant A and tenant B
        # 2. Issue keys for both
        # 3. Tenant A cannot see tenant B's keys/audit/policies
        # 4. Tenant A cannot evaluate access for tenant B's resources

    async def test_delegation_flow(self):
        # 1. Agent A has access to resource X
        # 2. Agent B does not
        # 3. Agent A delegates to Agent B
        # 4. Agent B can now access resource X
        # 5. Delegation expires
        # 6. Agent B access revoked
```

---

### D6 - Docker Compose Full Stack

**Problem:** Current docker-compose only runs SoulAuth + Postgres + Prometheus. GA needs all services.

**File:** `docker-compose.yml` (rewrite)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: tiresias
      POSTGRES_USER: tiresias
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tiresias"]
      interval: 5s
      retries: 5

  soulauth:
    build: .
    ports:
      - "8000:8000"
    environment:
      SOULAUTH_DATABASE_URL: postgresql+asyncpg://tiresias:${POSTGRES_PASSWORD}@postgres/tiresias
      SOULAUTH_DATABASE_URL_SYNC: postgresql://tiresias:${POSTGRES_PASSWORD}@postgres/tiresias
      SOULAUTH_MODE: enterprise
      SOULAUTH_JWT_PRIVATE_KEY_PATH: /run/secrets/jwt_private_key
      SOULAUTH_JWT_PUBLIC_KEY_PATH: /run/secrets/jwt_public_key
      SOULAUTH_POLICY_REPO_PATH: /app/policies
      SOULAUTH_RESEND_API_KEY: ${RESEND_API_KEY}
      SOULAUTH_TRIAL_VERIFY_BASE_URL: https://tiresias.saluca.com
      TIRESIAS_LICENSE_KEY: ${TIRESIAS_LICENSE_KEY}
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      retries: 3

  soulgate:
    build: ./soulGate
    ports:
      - "8001:8001"
    environment:
      SOULGATE_DATABASE_URL: postgresql+asyncpg://tiresias:${POSTGRES_PASSWORD}@postgres/tiresias
      SOULGATE_SOULAUTH_URL: http://soulauth:8000
    depends_on:
      soulauth:
        condition: service_healthy

  soulwatch:
    build: ./soulWatch
    ports:
      - "8002:8002"
    environment:
      SOULWATCH_DATABASE_URL: postgresql+asyncpg://tiresias:${POSTGRES_PASSWORD}@postgres/tiresias
      SOULWATCH_MODE: sidecar
      SOULWATCH_SOULAUTH_URL: http://soulauth:8000
    depends_on:
      soulauth:
        condition: service_healthy

  portal:
    build: ./portal
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_SOULAUTH_API_URL: http://soulauth:8000
      NEXT_PUBLIC_SOULWATCH_API_URL: http://soulwatch:8002
      NEXT_PUBLIC_SOULGATE_API_URL: http://soulgate:8001
    depends_on:
      soulauth:
        condition: service_healthy

  prometheus:
    image: prom/prometheus:v2.51.0
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./monitoring/alert_rules.yml:/etc/prometheus/alert_rules.yml
      - promdata:/prometheus
    depends_on:
      - soulauth
      - soulgate
      - soulwatch

volumes:
  pgdata:
  promdata:
```

Add Dockerfiles for SoulGate and SoulWatch (same pattern as SoulAuth).

---

## Execution Plan

```
Week 1 (Mar 18-24):
├── A1: Portal auth                     [2 days]
├── A2: Dashboard widget integration    [3 days]  ← critical path
├── B1: License validation at bootstrap [1 day]
├── B2: Feature gate middleware         [1 day]
└── B5: Admin RBAC                      [2 days]

Week 2 (Mar 25-31):
├── A3: Trial flow E2E                  [2 days]
├── A4: Portal deployment config        [1 day]
├── B3: License relay                   [1 day]
├── B4: Stripe billing integration      [3 days]  ← critical path
├── C2: Trial rate limiting             [1 day]
└── C4: Quarantine policy config API    [1 day]

Week 3 (Apr 1-7):
├── C1: Prompt injection validation     [2 days]
├── C3: Security audit                  [2 days]  ← critical path
├── D1: SIEM connector validation       [3 days]
├── D4: SDK packaging (PyPI)            [1 day]
└── D6: Docker Compose full stack       [1 day]

Week 4 (Apr 8-14):
├── D2: Load testing                    [2 days]
├── D3: API documentation               [3 days]  ← critical path
├── D5: E2E integration tests           [2 days]
├── Fix: Security audit findings        [2 days]
└── Fix: Load test bottlenecks          [1 day]

Week 5 (Apr 15-18): GA Release
├── Final QA pass
├── Version bump to v1.0.0
├── Deploy to tiresias.saluca.com
├── DNS + TLS verification
└── Announce
```

---

## Parallel Execution Map

```
         Week 1          Week 2          Week 3          Week 4       Week 5
Track A: [A1][A2--------][A3][A4]
Track B: [B1][B2][B5-----][B3][B4-------]
Track C:                  [C2][C4]      [C1---][C3-----][fixes--]
Track D:                                [D1---][D4][D6] [D2][D3--][D5] [GA]
```

---

## Definition of Done (GA Checklist)

### Must-have (blocks GA):
- [ ] Portal authenticates users via SoulKey
- [ ] All 14 dashboard widgets show real data
- [ ] Trial registration -> email verification -> activation -> onboarding works E2E
- [ ] License JWT validation enforces tiers at startup
- [ ] Feature gate middleware returns 402 for unlicensed features
- [ ] Admin RBAC prevents unauthorized management operations
- [ ] Stripe checkout creates subscriptions, webhook updates tiers
- [ ] CORS tightened to production domains
- [ ] Trial registration rate-limited per IP
- [ ] Quarantine thresholds configurable per tenant
- [ ] Prompt injection detection validated (36+ patterns, false positive rate <5%)
- [ ] At least Splunk + Elastic SIEM connectors validated against real instances
- [ ] Load test passes: 1000 req/s sustained, p99 <100ms
- [ ] API docs published at /docs
- [ ] SDK on PyPI as tiresias-sdk
- [ ] Full docker-compose stack (all 5 services) works
- [ ] E2E tests cover trial->usage->enforcement->billing journey
- [ ] Security audit complete, all Critical/High findings fixed
- [ ] No hardcoded secrets in repo or Docker images

### Nice-to-have (post-GA):
- [ ] Azure Sentinel connector validated
- [ ] WebSocket live feed connected to portal
- [ ] Grafana dashboards pre-built
- [ ] SOC2 Type II audit scheduled
- [ ] Multi-region deployment guide
- [ ] Mobile quarantine management app
- [ ] AI-powered policy recommendations

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stripe integration takes longer than 3 days | Medium | High (blocks billing) | Start with Stripe Checkout (simplest), defer Customer Portal to post-GA |
| SIEM connectors have breaking bugs | Medium | Medium | Prioritize Splunk (most common), defer Sentinel |
| Load testing reveals DB bottleneck | High | Medium | Add connection pooling, read replicas, or caching layer |
| Security audit finds critical issue | Medium | High | Reserve 2 days in Week 4 for fixes |
| Portal auth UX is confusing (soulkey paste) | Low | Medium | Add "What's a SoulKey?" tooltip + link to trial |
| Resend email delivery unreliable | Low | High | Add fallback SMTP provider, test thoroughly |

---

## Files Touch Map (Complete)

| File | Track | Change |
|------|-------|--------|
| `portal/src/lib/auth.ts` | A1 | New - auth context |
| `portal/src/middleware.ts` | A1 | New - route protection |
| `portal/src/app/login/page.tsx` | A1 | New - login page |
| `portal/src/app/platform/layout.tsx` | A1 | Modify - auth check |
| `portal/src/components/layout/Navbar.tsx` | A1 | Modify - auth state |
| `portal/src/lib/api.ts` | A2 | New - API client |
| `portal/src/lib/config.ts` | A2 | New - env config |
| `portal/src/components/dashboard/widgets/*.tsx` | A2 | Modify - 11 widgets |
| `portal/src/app/trial/page.tsx` | A3 | Modify - wire form |
| `portal/src/app/trial/verify/page.tsx` | A3 | New - verification landing |
| `portal/src/app/trial/onboarding/page.tsx` | A3 | New - post-activation guide |
| `portal/Dockerfile` | A4 | New |
| `portal/.env.example` | A4 | New |
| `src/config.py` | B1 | Modify - license settings |
| `src/main.py` | B1,B2 | Modify - lifespan + middleware |
| `src/middleware/feature_gate.py` | B2 | New |
| `src/license/relay.py` | B3 | New/extend |
| `portal/src/app/api/billing/*.ts` | B4 | New - Stripe routes |
| `portal/src/app/billing/*.tsx` | B4 | New - billing pages |
| `portal/src/app/pricing/page.tsx` | B4 | Modify - checkout buttons |
| `src/auth/rbac.py` | B5 | New - role definitions |
| `src/middleware/rbac.py` | B5 | New - permission check |
| `src/admin/router.py` | B5 | Modify - add RBAC deps |
| `src/database/models.py` | B5,C4 | Modify - role + quarantine policy |
| `soulGate/src/detection/injection.py` | C1 | Modify - validate patterns |
| `soulGate/tests/test_injection.py` | C1 | New |
| `src/trial/router.py` | C2 | Modify - rate limit |
| `src/middleware/rate_limit.py` | C2 | New |
| `src/enforcement/quarantine.py` | C4 | Modify - DB-backed policies |
| `src/enforcement/router.py` | C4 | Modify - policy CRUD |
| `src/integrations/siem/` | D1 | Audit + fix |
| `tests/test_integrations/test_siem_live.py` | D1 | New |
| `tests/load/locustfile.py` | D2 | New |
| `portal/src/app/docs/**` | D3 | New - docs pages |
| `sdk/` | D4 | New top-level package |
| `tests/test_e2e/test_customer_journey.py` | D5 | New |
| `docker-compose.yml` | D6 | Rewrite - full stack |
| `soulGate/Dockerfile` | D6 | New |
| `soulWatch/Dockerfile` | D6 | New |

---

*Spec written: 2026-03-18*
*Target GA: 2026-04-18 (5 weeks)*
*Based on: Full codebase audit, 47.7K LOC, 127 tests passing*
