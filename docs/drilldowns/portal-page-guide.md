# Portal Page-by-Page Guide

> **Tiresias Administration Guide v3.0 -- L3 Drill-Down**
> **Classification:** Customer-Facing
> **Parent chapters:** Chapter 18 (Portal Dashboard), Chapter 4 (Initial Configuration)
> **Audience:** SOC analysts, security administrators, portal users

---

## 1. Portal Architecture

The Tiresias Portal is a Next.js 14 application (App Router) that serves as the management UI for all platform operations. It runs on port 3000 and proxies API requests to backend services via Next.js rewrites.

**Layout structure:**
- **DashboardHeader** -- top bar with tenant name, tier badge, user identity, and logout
- **DashboardSidebar** -- left navigation with tier-gated sections and collapsible groups
- **ChatWidget** -- floating support chatbot visible on all dashboard pages
- **Content area** -- scrollable main content with subtle dot-grid background

**Navigation is organized into five sidebar groups:**

1. **Proxy** -- Overview, Traces, Sessions, Providers, Costs, Playground
2. **Platform** -- Dashboard, Agents, Policies, Audit Trail
3. **Detection** -- Detection Feed, PRH, SIEM Config, Rule Editor, Playbooks, Quarantine
4. **SoulWatch** -- SoulWatch, Anomalies, Rules, Quarantines, Integrations, Reports
5. **SoulGate** -- SoulGate, Upstreams, Rate Limits, Access Rules, Audit Trail
6. **MSSP** (mssp+ tier only) -- MSSP Overview, SaaS Admin, Cross-Tenant Detection, Aletheia
7. **Aletheia** (enterprise+ tier only) -- Aletheia, CoT Audit, Policies, Sanitizer, Tool Activity
8. **Other** -- Analytics, Investigation, Contracts, Partner, Settings, Support

---

## 2. Proxy Group Pages

### 2.1 Overview (`/dashboard/overview`)

**Purpose:** Primary landing view after login. Provides a single-screen operational summary.

**Data sources:**
- `/api/dash/v1/spend` -- total cost, request count, token usage (30-day)
- `/api/dash/v1/requests` -- daily request counts for sparklines and bar charts
- `/api/dash/v1/providers/health` -- per-provider UP/DOWN/DEGRADED status with error counts
- `/v1/usage/alerts` -- tier usage percentage and alert level (warning/critical)

**Widgets displayed:**
| Widget | Data | Actions |
|---|---|---|
| KPI cards | Total cost, request count, total tokens (30d) | Toggle 7d/30d |
| Request/cost bar chart | Daily request volume | Time range toggle |
| Usage widget | Tier usage percentage, alert level | Upgrade prompt if near limit |
| Provider health strip | Per-provider status badges (UP/DOWN/DEGRADED), error counts, p50 latency | Click to drill into provider |
| Recent activity stream | Last N operations | Scroll |

**Expected states:**
- **Normal:** All KPIs show values, providers show green "UP" badges
- **Degraded:** One or more providers show yellow "DEGRADED" with elevated error counts
- **Critical:** Usage widget shows red alert, providers show red "DOWN"
- **Empty (new tenant):** All counters show 0, no providers listed, usage shows "No data"

### 2.2 Traces (`/dashboard/traces`)

**Purpose:** View individual LLM request traces through the Tiresias Proxy, including request/response hashes, model, tokens, and cost.

**Data sources:** `/api/dash/v1/traces` (proxied to SoulAuth)

**Key columns:** Trace ID, timestamp, model, provider, prompt tokens, completion tokens, cost, session ID, request hash

**Actions:** Search by session ID, filter by provider/model, inspect individual trace detail

### 2.3 Sessions (`/dashboard/sessions`)

**Purpose:** View agent sessions -- grouped trace sequences representing a logical interaction.

**Data sources:** `/api/dash/v1/sessions`

**Key columns:** Session ID, agent/persona, start time, duration, request count, total cost

**Actions:** Click session to view constituent traces, filter by agent

### 2.4 Providers (`/dashboard/providers`)

**Purpose:** View registered LLM providers and their health status.

**Data sources:** `/api/dash/v1/providers/health`

**Displays:** Provider name, status (UP/DOWN/DEGRADED), p50/p95/p99 latency, consecutive errors, error rate

### 2.5 Costs (`/dashboard/costs`)

**Purpose:** Cost analytics broken down by provider, model, and time period.

**Data sources:** `/api/dash/v1/spend`, `/api/dash/v1/requests`

**Displays:** Cost breakdown charts, per-model cost comparison, daily spend trend

### 2.6 Playground (`/dashboard/playground`)

**Purpose:** Interactive LLM prompt testing interface. Send requests through the Tiresias Proxy and inspect the full security pipeline response.

**Data sources:** `/api/playground/run`

**Actions:** Select provider/model, enter prompt, execute, view response with security annotations (prompt injection score, rate limit status, token count)

---

## 3. Platform Group Pages

### 3.1 Dashboard (`/dashboard`)

**Purpose:** Customizable widget dashboard. Users can rearrange, resize, add, and remove widgets.

**Features:**
- **Edit mode** -- toggle via "Edit Layout" button; shows drag handles, resize controls (S/M/L), and remove (X) buttons
- **Widget palette** -- add new widgets from a catalog
- **Layout presets** -- one-click layout templates
- **Persistent layout** -- widget arrangement saved per user

**First-visit behavior:** If `tiresias_welcomed=1` cookie is not set, redirects to `/dashboard/welcome` for onboarding.

### 3.2 Agents (`/dashboard/agents`)

**Purpose:** Agent fleet management. View all registered agents, issue new SoulKeys, and manage agent lifecycle.

**Data sources:** `/v1/soulauth/admin/keys` (via portal proxy at `/api/soulauth/agents`)

**Agent fields displayed:**
| Field | Source | Description |
|---|---|---|
| SoulKey prefix | `sk_<first7>...` | Truncated key identifier |
| Persona | `persona_id` | Agent identity within tenant |
| Status | `active`, `trial`, `suspended`, `revoked` | Current lifecycle state |
| Tenant | `tenant_id` | Owning tenant |
| Created | `issued_at` | Issuance timestamp |
| Last active | `last_used_at` | Most recent API call |
| Capabilities | From metadata | Assigned scopes/capabilities |
| Clearance | From metadata | Security clearance level |

**Actions:**
- **Generate SoulKey** -- opens modal, generates `sk_<64-hex>`, displays raw key once with copy button
- **Suspend** -- immediately suspends the agent (prevents authentication)
- **Reactivate** -- restores a suspended agent
- **Revoke** -- permanently revokes (terminal state, cannot be undone)
- **View detail** -- expands agent row to show recent activity timeline

**Agent status transitions:**
```
active --> suspended --> active     (reactivatable)
active --> revoked                  (terminal)
suspended --> revoked               (terminal)
trial --> active                    (after verification)
trial --> revoked                   (expired trial)
```

### 3.3 Policies (`/dashboard/policies`)

**Purpose:** View and manage authorization policies (YAML policy-as-code).

**Data sources:** `/v1/pdp/policies`

**Displays:** Policy name, resource pattern, action, effect (allow/deny), priority, last modified

**Actions:** Create policy, edit YAML, delete, sync from git repository

### 3.4 Audit Trail (`/dashboard/audit`)

**Purpose:** Tamper-evident audit log viewer. All security-relevant events across the platform.

**Data sources:** `/api/soulwatch/audit`, `/api/soulgate/audit`

**Key columns:** Timestamp, event type, agent/persona, action, resource, result (allow/deny), severity, hash chain link

**Actions:** Search by agent/event type/time range, export to CSV, verify hash chain integrity

---

## 4. Detection Group Pages

### 4.1 Detection Feed (`/dashboard/detection`)

**Purpose:** Real-time feed of detection matches from Sigma rules and anomaly detectors.

**Data sources:**
- `/v1/detection/matches` -- Sigma rule matches
- `/v1/soulwatch/anomalies` -- Behavioral anomalies

**Detection match fields:**
| Field | Description |
|---|---|
| `rule_title` | Name of the matching Sigma rule |
| `level` | Severity: critical, high, medium, low, informational |
| `soulkey_id` | Agent that triggered the detection |
| `persona_id` | Agent persona (if resolved) |
| `matched_fields` | Specific fields that matched the rule condition |
| `event_data` | Full event payload |
| `description` | Human-readable detection description |
| `response_playbook` | Associated automated response (if configured) |
| `created_at` | Detection timestamp |

**Anomaly types displayed:**
| Type | Icon | Description |
|---|---|---|
| `rate_spike` | TrendingUp | Request rate significantly above baseline |
| `unusual_resources` | Cpu | Accessing resources outside normal pattern |
| `off_hours` | Clock | Activity outside established working hours |
| `geo_anomaly` | MapPin | Requests from unusual geographic location |
| `scope_escalation` | ShieldAlert | Attempting to access higher-privilege resources |

**Actions:** Filter by severity, filter by anomaly type, click to expand event detail, export detections

### 4.2 PRH -- Prompt Risk Heatmap (`/dashboard/detection/prh`)

**Purpose:** Visual heatmap showing prompt injection risk scores across agents and time.

**Data sources:** `/v1/detection/prh`

**Displays:** Grid of agents vs. time buckets, color-coded by risk score (green=safe, yellow=elevated, red=high)

### 4.3 SIEM Config (`/dashboard/detection/siem`)

**Purpose:** Configure SIEM forwarding destinations.

**Data sources:** `/v1/settings/siem`

**Supported integrations:**
| SIEM | Protocol | Configuration |
|---|---|---|
| Splunk | HEC (HTTP Event Collector) | URL, HEC token, index, source type |
| Elasticsearch | REST API | URL, index pattern, authentication |
| Azure Sentinel | Log Analytics API | Workspace ID, shared key |
| Syslog | RFC 5424 / RFC 3164 | Server address, port, protocol (TCP/UDP/TLS), facility |

**Actions:** Add connector, test connectivity, enable/disable forwarding, configure event filters

### 4.4 Rule Editor (`/dashboard/detection/rules`)

**Purpose:** Create, edit, and manage Sigma detection rules.

**Data sources:** `/v1/detection/rules`

**Features:**
- YAML editor with syntax highlighting
- Rule validation (checks Sigma format compliance)
- Backtest against historical events
- Enable/disable individual rules
- Severity level assignment

**Minimum tier:** `pro`

### 4.5 Playbooks (`/dashboard/detection/playbooks`)

**Purpose:** Configure automated response playbooks that execute when detection rules match.

**Data sources:** `/v1/detection/playbooks`

**Playbook actions available:**
- Suspend SoulKey
- Revoke tokens
- Force re-authentication
- Rate limit agent
- Quarantine agent
- Send notification (email, Slack, webhook, PagerDuty)
- Create incident

**Configuration fields:** Trigger rule, severity threshold, cooldown period, action chain, notification targets

**Minimum tier:** `pro`

### 4.6 Quarantine (`/dashboard/quarantine`)

**Purpose:** View and manage quarantined agents.

**Data sources:** `/v1/enforcement/quarantine`

**Quarantine entry fields:**
| Field | Description |
|---|---|
| `soulkey_id` | Quarantined agent |
| `status` | `active`, `released`, `expired`, `pending_approval` |
| `triggered_by_type` | What caused the quarantine (rule match, anomaly, manual) |
| `actions_taken` | List of enforcement actions applied |
| `reason` | Human-readable quarantine reason |
| `quarantined_at` | When quarantine began |
| `auto_release_at` | Scheduled automatic release time (if configured) |

**Actions:** Release quarantine, extend quarantine duration, add manual quarantine entry

---

## 5. SoulWatch Group Pages

### 5.1 SoulWatch Overview (`/dashboard/soulwatch`)

**Purpose:** Central detection engine dashboard showing anomaly metrics, alert summary, and agent risk scores.

**Data sources:** `/api/soulwatch/dashboard`

**Widgets:**
- Detection match count and trend
- Anomaly breakdown by type
- Active quarantine count
- Top risky agents table (persona, risk score, trend, anomaly count, status: critical/warning/healthy)

**Actions:** Click agent to drill into detail, click detection to see full match, navigate to sub-pages

### 5.2 Anomalies (`/dashboard/soulwatch/anomalies`)

**Purpose:** Dedicated anomaly feed with detailed filtering and investigation tools.

**Data sources:** `/v1/soulwatch/anomalies`

**Displays:** Anomaly list with type, severity, agent, description, evidence payload, timestamp

### 5.3 Rules (`/dashboard/soulwatch/rules`)

**Purpose:** SoulWatch-specific rule management (behavioral rules, distinct from Sigma detection rules).

**Data sources:** `/v1/soulwatch/rules`

### 5.4 Quarantines (`/dashboard/soulwatch/quarantines`)

**Purpose:** SoulWatch-initiated quarantine management. Same data as `/dashboard/quarantine` but filtered to SoulWatch-triggered entries.

### 5.5 Integrations (`/dashboard/soulwatch/integrations`)

**Purpose:** Configure SoulWatch integrations with external systems (SIEM, ticketing, notification).

### 5.6 Reports (`/dashboard/soulwatch/reports`)

**Purpose:** Generate and download security reports (PDF, CSV). Scheduled report configuration.

---

## 6. SoulGate Group Pages

### 6.1 SoulGate Overview (`/dashboard/soulgate`)

**Purpose:** API gateway metrics and operational dashboard.

**Data sources:** `/api/soulgate/dashboard`

**Metrics displayed:**
| Metric | Description |
|---|---|
| `requests_per_min` | Current request throughput |
| `blocked_24h` | Total blocked requests in last 24 hours |
| `active_upstreams` | Number of registered upstream services |
| `circuit_breakers_open` | Count of open circuit breakers |
| `hourly_requests` | Per-hour request and block volume chart |
| `block_reasons` | Breakdown of block reasons with percentages |

**Sub-sections:**
- Upstream service health table (name, status, latency, circuit breaker state)
- Recent blocks table (agent, reason, count, timestamp)
- Hourly request/block volume chart

### 6.2 Upstreams (`/dashboard/soulgate/upstreams`)

**Purpose:** Register and manage upstream services that SoulGate protects.

**Data sources:** `/api/soulgate/upstreams`

**Upstream fields:**
| Field | Description |
|---|---|
| `name` | Service identifier |
| `base_url` | Backend service URL |
| `status` | `healthy`, `degraded`, `down` |
| `timeout_ms` | Request timeout |
| `circuit_breaker_enabled` | Whether circuit breaker is active |
| `latency` | Current latency measurement |
| `circuitBreaker` | Current state: `closed`, `open`, `half_open` |

**Actions:** Add upstream, edit configuration, remove upstream, toggle circuit breaker

### 6.3 Rate Limits (`/dashboard/soulgate/rate-limits`)

**Purpose:** Configure per-agent, per-route, and global rate limits.

**Data sources:** `/v1/soulgate/rate-limits`

**Configuration options:** Requests per minute/hour, burst allowance, per-agent overrides, rate limit response code (429)

### 6.4 Access Rules (`/dashboard/soulgate/access`)

**Purpose:** Configure IP allowlists/blocklists and geographic access restrictions.

**Data sources:** `/v1/soulgate/access-rules`

**Rule types:** IP allowlist, IP blocklist, country allowlist, country blocklist, CIDR range rules

### 6.5 Audit Trail (`/dashboard/soulgate/audit`)

**Purpose:** SoulGate-specific audit log showing every gateway decision.

**Data sources:** `/api/soulgate/audit`

**Key columns:** Timestamp, source IP, agent, route, method, decision (allow/block), reason, latency

---

## 7. MSSP Group Pages (mssp+ tier only)

All MSSP pages are wrapped in `TierGate` with `requiredTier="mssp"`. Lower-tier tenants see an upgrade prompt.

### 7.1 MSSP Overview (`/dashboard/mssp`)

**Purpose:** Multi-customer management dashboard for MSSPs.

**Displays:** Customer tenant list with status, agent count, alert count, SLA metrics

**Actions:** Provision new tenant, suspend/reactivate tenant, navigate to tenant detail

### 7.2 SaaS Admin (`/dashboard/mssp/saas`)

**Purpose:** Platform-level SaaS administration. Manage all tenants, subscriptions, and billing.

**Sub-page:** `/dashboard/mssp/saas/[tenantId]` -- per-tenant detail view with configuration, usage, and billing

### 7.3 Platform Admin (`/dashboard/mssp/master`)

**Purpose:** SaaS master administration page. Full platform-level view of all tenants, subscriptions, usage, and operational statistics. Intended for Tiresias platform operators (not MSSP customers).

**Data sources:**
- `/v1/saas/admin/tenants` -- complete tenant list with subscription tier, status, agent counts
- `/v1/saas/admin/stats` -- platform-wide aggregate statistics (total tenants, total agents, revenue, usage)

**Tier gate:** `saas` (wrapped in `TierGate` with `requiredTier="saas"`)

**Displays:**
- Platform KPI summary (total tenants, active agents, MRR, request volume)
- Full tenant table with tier, status, agent count, last activity, subscription details
- Platform health and operational metrics

**Actions:** View tenant detail, manage subscriptions, platform-level configuration

### 7.4 Cross-Tenant Detection (`/dashboard/mssp/detection`)

**Purpose:** Aggregated detection feed across all managed tenants. Identify coordinated attacks spanning multiple customers.

### 7.5 Aletheia (MSSP) (`/dashboard/mssp/aletheia`)

**Purpose:** Cross-tenant AI transparency monitoring.

**Sub-page:** `/dashboard/mssp/aletheia/policies` -- push Aletheia policies to managed tenants

---

## 8. Aletheia Group Pages (enterprise+ tier only)

### 8.1 Aletheia Overview (`/dashboard/aletheia`)

**Purpose:** AI transparency and accountability dashboard. Monitor chain-of-thought integrity and tool usage patterns.

### 8.2 CoT Audit (`/dashboard/aletheia/cot-audit`)

**Purpose:** View chain-of-thought audit trails. Verify that agent reasoning steps are recorded and untampered.

### 8.3 Policies (`/dashboard/aletheia/policies`)

**Purpose:** Manage Aletheia transparency policies (what must be logged, what must be sanitized, retention rules).

### 8.4 Sanitizer (`/dashboard/aletheia/sanitizer`)

**Purpose:** Configure output sanitization rules. Define patterns that must be redacted from agent outputs before storage or forwarding.

### 8.5 Tool Activity (`/dashboard/aletheia/tool-activity`)

**Purpose:** Monitor tool/function call activity across agents. Track which tools agents invoke, frequency, and anomalous patterns.

---

## 9. Other Pages

### 9.1 Analytics (`/dashboard/analytics`)

**Purpose:** Advanced analytics with custom queries and visualizations.

### 9.2 Investigation (`/dashboard/investigation`)

**Purpose:** Forensic investigation tool for security incidents. Query evidence by tenant, time range, and detail level.

**Two investigation levels:**
| Level | Data Returned | Minimum Tier |
|---|---|---|
| **Hashes** | record_id, request_hash, response_hash, model, created_at | `pro` |
| **Context** | All hash fields + provider, prompt_tokens, completion_tokens, cost_usd, session_id | `enterprise` |

**Actions:** Enter tenant ID, select time range, choose detail level (hashes or context), execute search, inspect results

### 9.3 Contracts (`/dashboard/contracts`)

**Purpose:** Enterprise contract management. View and manage service agreements.

**Minimum tier:** `enterprise`

### 9.4 Partner (`/dashboard/partner`)

**Purpose:** Partner program management for MSSPs.

**Sub-pages:**
- `/dashboard/partner/connect` -- partner onboarding and connection
- `/dashboard/partner/promos` -- promotional codes and partner marketing tools

**Minimum tier:** `mssp`

### 9.5 Settings (`/dashboard/settings`)

**Purpose:** Tenant and platform configuration with 9 tabs.

**Tabs:**
| Tab | Query Param | Purpose | Minimum Tier |
|---|---|---|---|
| General | `?tab=general` | Tenant display name | `community` |
| API Keys | `?tab=api-keys` | SoulKey lifecycle management (create, revoke, suspend, view usage) | `starter` |
| Teams | `?tab=teams` | Team management, member administration, and invitation management (v3.3.0) | `starter` |
| SIEM | `?tab=siem` | SIEM destination configuration (Splunk, Elastic) | `pro` |
| Notifications | `?tab=notifications` | Channel toggles (Slack, PagerDuty, email, webhook) | `starter` |
| Billing | `?tab=billing` | Tier display, grace period, upgrade/manage subscription | `starter` |
| White Label | `?tab=white-label` | Company name, logo URL, favicon, accent color, custom domain | `enterprise` |
| SSO | `?tab=sso` | Enterprise SSO/OIDC IdP management | `pro` |
| Preferences | `?tab=preferences` | User-level display preferences, sidebar sections | `community` |

#### Teams Tab Detail (v3.3.0)

**Data sources:**
- `/v1/teams` -- list teams in the tenant
- `/v1/teams/{id}/members` -- list members of a team
- `/v1/users` -- list users for member selection
- `/v1/invites` -- list pending invitations

**Sections:**

| Section | Purpose | Actions |
|---|---|---|
| Team List | Display all teams with member count and description | Create team, edit team, delete team |
| Team Detail | Show members of the selected team with their team roles | Add member, change role, remove member |
| Invitations | Show pending, accepted, and expired invitations | Create invite, revoke invite |
| Account Admins | Display account admin and secondary admin designations | Designate/revoke admin status (account admin only) |

**Tier gating:** The Teams tab is visible for `starter` tier and above. The `TierGate` component wraps the tab content and shows an upgrade prompt for `community` tier tenants.

**Role restrictions:**
- Viewers and operators can view teams and members (read-only).
- Admins and owners can create/edit/delete teams, manage members, and manage invitations.
- Only account admins can designate or revoke secondary admin status.
- Only owners can designate or revoke account admin status.

**Billing tab visibility rules:**
- Hidden entirely for `nda` tier
- Shows expiration info (no Stripe) for `enterprise` and `mssp` tiers (license-based)
- Shows Stripe integration for `starter` and `pro` tiers

### 9.6 Support (`/dashboard/support`)

**Purpose:** Submit and track support tickets.

### 9.7 Welcome (`/dashboard/welcome`)

**Purpose:** First-run onboarding wizard. Sets `tiresias_welcomed=1` cookie on completion. The dashboard redirects here on first visit.

---

## 10. Data Loading Pattern

All dashboard pages follow a consistent data loading pattern using the `useWidgetData` hook:

1. **Primary fetch** -- calls the configured API endpoint
2. **Loading state** -- shows skeleton/shimmer placeholders
3. **Success** -- renders live data
4. **Error with fallback** -- if the API returns an error, many pages fall back to mock/demo data (indicated by a "Demo Data" badge)
5. **Empty state** -- if the API returns empty results, shows appropriate empty state message

**Mock data indicator:** When a page displays mock data (API unreachable or empty tenant), a subtle indicator appears. This is normal for new deployments before agents begin generating traffic.

---

## 11. Portal Proxy Architecture

The portal does not make direct browser-to-backend calls for sensitive operations. Instead:

1. **Browser** calls Next.js API routes (`/api/*`)
2. **Next.js API route** injects server-side credentials (`INTERNAL_API_KEY`, session data)
3. **API route** forwards to the appropriate backend service (SoulAuth, SoulWatch, SoulGate)
4. **Response** is returned to the browser without exposing internal service URLs or API keys

For non-sensitive reads, Next.js rewrites (configured in `next.config.ts`) proxy `/v1/*` directly to SoulAuth, with the browser's session cookie providing authentication.

```
Browser ──> /api/soulauth/agents ──> [Next.js injects INTERNAL_API_KEY] ──> soulauth:8000/v1/soulauth/admin/keys
Browser ──> /v1/auth/whoami ──────> [Next.js rewrite] ──────────────────> soulauth:8000/v1/auth/whoami
Browser ──> /health ──────────────> [Next.js rewrite] ──────────────────> soulauth:8000/health
Browser ──> /metrics ─────────────> [Next.js rewrite] ──────────────────> soulauth:8000/metrics
```
