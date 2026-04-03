# Part VI: Observability and Analytics

> **Tiresias Administration Guide v3.0**
> **Classification:** Customer-Facing
> **Audience:** Security administrators, SOC managers, MSSPs, platform operators

---

## Chapter 18: Portal Dashboard

The Tiresias Portal is the primary management interface for administrators, analysts, and SOC operators. Built on Next.js 14 with the App Router architecture, the Portal provides a customizable widget-based dashboard, role-scoped navigation, and real-time data visualization across all Tiresias subsystems.

This chapter covers the Portal layout, widget system, layout presets, customization workflows, and tier-gated feature access.

### 18.1 Navigate the Portal

#### Layout Structure

The Portal renders a three-region layout on every dashboard page:

| Region | Component | Description |
|--------|-----------|-------------|
| **Header** | `DashboardHeader` | Top bar with tenant selector, user menu, notification bell, and global search |
| **Sidebar** | `DashboardSidebar` | Left navigation rail with collapsible sections for all dashboard areas |
| **Content Area** | `<main>` | Scrollable content region where page-specific views render |

A floating `ChatWidget` overlay is visible on all dashboard pages, providing in-context support and natural-language query capability.

#### Navigation Hierarchy

The sidebar organizes the Portal into the following sections:

| Section | Pages | Description |
|---------|-------|-------------|
| **Overview** | Dashboard | Customizable widget grid with layout presets |
| **Agents** | Agent inventory, registration, lifecycle | Fleet management and agent health |
| **Policies** | Authorization policies, Sigma rules | Policy authoring and status |
| **Detection** | SoulWatch events, anomalies, quarantine | Security event monitoring |
| **Investigation** | Incident dashboard, event correlation | Triage and forensics |
| **Traces** | Request trace explorer | Individual LLM request inspection |
| **Sessions** | Session explorer and replay | Session-level cost and turn analysis |
| **Costs** | Spend analytics and budgets | Financial observability |
| **Providers** | Provider health and cascade status | Upstream LLM provider monitoring |
| **Analytics** | Unified analytics dashboard | Combined LLM and API telemetry |
| **Aletheia** | CoT audit, tool activity, sanitizer | AI transparency and chain-of-thought integrity |
| **SoulGate** | Gateway configuration and metrics | API gateway management |
| **Settings** | SIEM, notifications, SSO, billing | Platform configuration |

#### Role-Based View Restrictions

The Portal filters sidebar entries and widget availability based on the authenticated user's role. The RBAC model defines four predefined roles: Global Admin, Tenant Admin, Analyst, and Viewer. Each role has a permission matrix that controls which pages are accessible.

The `TierGate` component provides an additional access control layer based on subscription tier. When a user navigates to a page that requires a higher tier than their tenant's active subscription, the Portal displays an upgrade prompt instead of the page content.

**Tier hierarchy (lowest to highest):**

| Index | Tier | Slug |
|-------|------|------|
| 0 | Community | `community` |
| 1 | Starter | `starter` |
| 2 | Professional | `pro` |
| 3 | Enterprise | `enterprise` |
| 4 | MSSP | `mssp` |
| 5 | SaaS | `saas` |

The `tierMeets()` function compares the tenant's actual tier against the required tier. A tier at index N includes all features of tiers below it. For example, an Enterprise tenant (index 3) has access to all Community, Starter, and Professional features.

#### First-Visit Welcome Flow

On initial login, the Portal checks for a `tiresias_welcomed=1` cookie. If the cookie is absent, the Portal redirects to `/dashboard/welcome` where the user completes an onboarding wizard. After completion, the cookie is set and subsequent visits proceed directly to the main dashboard.

### 18.2 Configure the Executive Dashboard

#### The Widget System

The Portal dashboard is built on a widget grid architecture managed by the `DashboardProvider` context. The provider maintains the following state:

| State Property | Type | Description |
|----------------|------|-------------|
| `currentLayout` | `WidgetConfig[]` | Ordered list of active widgets with position and size |
| `activePreset` | `PresetKey` | Currently active layout preset (`soc`, `admin`, `hybrid`, or `custom`) |
| `isEditMode` | `boolean` | Whether the dashboard is in edit mode |

Each widget in the layout is defined by a `WidgetConfig` object:

```typescript
interface WidgetConfig {
  id: string;       // Unique instance identifier
  type: string;     // Widget type from registry (e.g., "AlertFeed")
  colSpan: number;  // Grid column span: 3, 4, 6, or 12
  order: number;    // Display order in the grid
}
```

#### Widget Registry

The Portal ships with 15 built-in widgets organized into three categories:

**Security Widgets**

| Widget Type | Name | Default Size | Description |
|-------------|------|-------------|-------------|
| `AlertFeed` | Alert Feed | Large (6 cols) | Live security alerts and incidents |
| `AnomalyChart` | Anomaly Chart | Medium (4 cols) | Real-time anomaly detection trends |
| `SigmaMatches` | Sigma Matches | Medium (4 cols) | Sigma rule match results |
| `QuarantineStatus` | Quarantine Status | Medium (4 cols) | Quarantined agents and entities |
| `ThreatMap` | Threat Map | Large (6 cols) | Geographic threat visualization |

**Management Widgets**

| Widget Type | Name | Default Size | Description |
|-------------|------|-------------|-------------|
| `AgentOverview` | Agent Overview | Large (6 cols) | Fleet status and agent health |
| `PolicyStatus` | Policy Status | Medium (4 cols) | Active policies and compliance |
| `KeyLifecycle` | Key Lifecycle | Medium (4 cols) | SoulKey rotation and expiry |
| `TenantHealth` | Tenant Health | Medium (4 cols) | Multi-tenant health overview |
| `QuickActions` | Quick Actions | Small (3 cols) | Common admin shortcuts |

**Analytics Widgets**

| Widget Type | Name | Default Size | Description |
|-------------|------|-------------|-------------|
| `UsageMetrics` | Usage Metrics | Medium (4 cols) | API calls, tokens, and throughput |
| `AuditStream` | Audit Stream | Medium (4 cols) | Live audit event log |
| `AgentFleetMap` | Agent Fleet Map | Large (6 cols) | Agent deployment topology |
| `EvaluationTrends` | Evaluation Trends | Medium (4 cols) | Policy evaluation analytics |
| `TopAgents` | Top Agents | Medium (4 cols) | Most active agents ranking |

#### Widget Sizing

Widgets support three sizes mapped to CSS grid column spans on a 12-column grid:

| Size Label | Column Span | Approximate Width |
|------------|-------------|-------------------|
| Small (S) | 3 columns | 25% of grid width |
| Medium (M) | 4 columns | 33% of grid width |
| Large (L) | 6 columns | 50% of grid width |

The `sizeToColSpan()` and `colSpanToSize()` utility functions convert between the human-readable size labels and numeric column spans.

#### KPI Display

The executive dashboard KPIs are provided by the Tiresias Proxy dashboard API. The following endpoints power the default KPI widgets:

| KPI | API Endpoint | Refresh Default |
|-----|-------------|----------------|
| Monthly spend | `GET /dash/v1/spend` | 30 seconds |
| Request volume | `GET /dash/v1/requests` | 30 seconds |
| Latency percentiles | `GET /dash/v1/latency` | 30 seconds |
| Error rates | `GET /dash/v1/errors` | 30 seconds |
| Provider health | `GET /dash/v1/providers/health` | 30 seconds |
| Top sessions | `GET /dash/v1/sessions/top` | 30 seconds |

All dashboard endpoints accept optional `start` and `end` query parameters in ISO-8601 format. When omitted, the default time window is the trailing 30 days.

### 18.3 Use the Agent Activity View

The Agent Activity View is accessible from the sidebar under **Agents**. It provides per-agent request history, behavioral trends, and anomaly indicators.

Key capabilities:

- **Agent inventory table** with searchable, sortable columns for agent ID, persona, status, last active time, and total request count.
- **Per-agent drill-down** showing request timeline, token usage, cost accumulation, and latency distribution.
- **Anomaly indicators** that highlight agents with active behavioral deviations flagged by SoulWatch.
- **Status badges** reflecting agent lifecycle state: Active (green), Suspended (amber), Quarantined (red), Decommissioned (gray).

### 18.4 Use the Threat Overview

The Threat Overview page aggregates threat metrics across all agents in the tenant. It surfaces:

- **Active alert count** by severity tier (critical, high, medium, low, informational).
- **Top attack types** ranked by frequency over the selected time window.
- **Trending detections** showing detection rule matches with increasing frequency.
- **Sigma rule match summary** with counts per rule and matched event examples.
- **Quarantine queue** showing agents currently under automated response actions.

### 18.5 Create Custom Dashboard Views

#### Layout Presets

The Portal ships with three built-in layout presets, each optimized for a specific operational role:

**SOC View** (`soc`)

Optimized for security operations centers. Prioritizes alert visibility, anomaly detection, and quarantine status.

| Position | Widget | Size |
|----------|--------|------|
| 1 | Alert Feed | Large (6 cols) |
| 2 | Anomaly Chart | Medium (4 cols) |
| 3 | Quarantine Status | Medium (4 cols) |
| 4 | Sigma Matches | Medium (4 cols) |
| 5 | Agent Fleet Map | Large (6 cols) |
| 6 | Audit Stream | Medium (4 cols) |

**Admin Console** (`admin`)

Optimized for platform management. Prioritizes fleet health, policy status, and operational shortcuts.

| Position | Widget | Size |
|----------|--------|------|
| 1 | Agent Overview | Large (6 cols) |
| 2 | Policy Status | Medium (4 cols) |
| 3 | Tenant Health | Medium (4 cols) |
| 4 | Key Lifecycle | Medium (4 cols) |
| 5 | Usage Metrics | Medium (4 cols) |
| 6 | Quick Actions | Small (3 cols) |

**Hybrid** (`hybrid`)

Balanced view combining security monitoring and management. This is the default preset for new users.

| Position | Widget | Size |
|----------|--------|------|
| 1 | Agent Overview | Medium (4 cols) |
| 2 | Alert Feed | Medium (4 cols) |
| 3 | Anomaly Chart | Medium (4 cols) |
| 4 | Policy Status | Medium (4 cols) |
| 5 | Audit Stream | Medium (4 cols) |
| 6 | Quarantine Status | Small (3 cols) |
| 7 | Usage Metrics | Small (3 cols) |
| 8 | Quick Actions | Small (3 cols) |

To switch presets, click the preset selector bar at the top of the dashboard. The active preset shows a checkmark badge. When you modify a preset layout (add, remove, resize, or reorder any widget), the preset automatically transitions to **Custom**.

#### Entering Edit Mode

To customize the dashboard layout:

**Step 1.** Click **Edit Layout** in the top-right toolbar. The button highlights and the edit-mode banner appears: "Edit mode active -- drag handles appear on each widget."

**Step 2.** The dashboard grid enters edit mode. Each widget displays:
- A drag handle for reordering via drag-and-drop
- Size controls (S / M / L) to resize
- A remove (X) button to delete the widget from the layout

**Step 3.** Click **Done Editing** to exit edit mode.

#### Adding Widgets

**Step 1.** Enter edit mode.

**Step 2.** Click **Add Widget** in the toolbar. The Widget Palette slides in from the right side of the screen.

**Step 3.** The palette organizes widgets by category (Security, Management, Analytics). Use the search field to filter by name or description.

**Step 4.** Select a size (S / M / L) using the segmented control on the widget card.

**Step 5.** Click **Add** to place the widget at the end of the grid. Widgets already present in the layout appear dimmed with a checkmark.

**Step 6.** Close the palette and drag the widget to the desired position.

#### Removing Widgets

In edit mode, click the **X** button on any widget card to remove it from the layout. The remaining widgets re-index automatically.

#### Reordering Widgets

In edit mode, drag a widget by its handle and drop it at the desired position. The grid reflows and all widget `order` values update.

#### Layout Persistence

All layout changes persist to `localStorage` under the key `tiresias-dashboard-layout`. The stored state includes the current widget array and active preset identifier. Layouts survive page reloads and browser restarts.

The Portal uses deferred hydration (via `setTimeout(0)`) to load the stored layout after the initial SSR render completes, preventing hydration mismatch warnings.

> **Note:** Layout state is per-browser, per-device. To share a layout across team members, select a standard preset or coordinate custom layouts through your organization's operational procedures.

### 18.6 Export Reports

#### Available Export Formats

The Portal supports the following export formats for dashboard data:

| Format | Use Case |
|--------|----------|
| **PDF** | Executive briefings and compliance reviews |
| **CSV** | Data import into spreadsheets and external analytics tools |
| **Scheduled Email** | Recurring delivery to distribution lists |

#### Generating a Report

**Step 1.** Navigate to the relevant dashboard page (Costs, Traces, Sessions, or Analytics).

**Step 2.** Select the time range using the date picker controls.

**Step 3.** Click the **Export** button and select the desired format.

**Step 4.** For CSV exports, the browser downloads the file immediately. For PDF exports, the Portal generates a rendered document and initiates the download.

#### Budget Alert Configuration

On the Costs page, click **Set Budget Alert** to open the budget alert modal.

| Field | Description | Default |
|-------|-------------|---------|
| Monthly Budget ($) | Dollar threshold for the monthly billing period | Calculated from projected EOM spend |
| Alert at (%) | Percentage of budget at which to trigger a notification | 80% |

> **Note:** In v3.0, budget alert configuration is stored in the Portal UI. Backend alert delivery via notification channels (email, Slack, webhook) is scheduled for a future release.

### 18.7 Tier-Gated Widgets and Features

Certain Portal features are restricted to specific subscription tiers using the `TierGate` component. When a user on a lower tier navigates to a gated page, the Portal displays a centered upgrade prompt panel containing:

- A lock icon indicating the feature requires a higher tier
- The feature name and the required tier label
- The user's current tier for comparison
- A link to the Tiresias pricing page

The following features are tier-gated:

| Feature | Required Tier | Portal Path |
|---------|---------------|-------------|
| Aletheia Overview | Enterprise | `/dashboard/aletheia` |
| CoT Audit | Enterprise | `/dashboard/aletheia/cot-audit` |
| Tool Activity | Enterprise | `/dashboard/aletheia/tool-activity` |
| Sanitizer Dashboard | Enterprise | `/dashboard/aletheia/sanitizer` |
| MSSP Dashboard | MSSP | `/dashboard/mssp` |
| Partner Management | MSSP | `/dashboard/partner` |

> **Important:** The `TierGate` component reads the tier from the authenticated session object (`session.tier`). If no session exists, the effective tier defaults to `community`. Ensure the authentication provider correctly populates the tier claim in the session token.

### 18.8 Data Refresh Intervals

Portal widgets fetch data from backend APIs using the `useWidgetData` hook, which supports configurable polling intervals. The following table lists default refresh intervals by data type:

| Data Source | Endpoint | Default Interval | Rationale |
|-------------|----------|-----------------|-----------|
| Spend summary | `/dash/v1/spend` | 30 seconds | Financial data changes with each request |
| Request volume | `/dash/v1/requests` | 30 seconds | Request counts are write-heavy |
| Provider health | `/dash/v1/providers/health` | 30 seconds | Provider state transitions are time-sensitive |
| CoT chain entries | `/watch/v1/aletheia/cot/chain` | 30 seconds | Chain entries arrive with each LLM request |
| Tool invocations | `/watch/v1/aletheia/tools/invocations` | 30 seconds | Invocations arrive in near real-time |
| Tool summary stats | `/watch/v1/aletheia/tools/summary` | 60 seconds | Aggregate statistics tolerate higher latency |
| Trace list | `/dash/v1/traces` | On-demand | Users paginate manually through traces |
| Session replay | `/dash/v1/sessions/{id}/replay` | On-demand | Loaded when user selects a session |

To override refresh behavior, pass a custom `refreshInterval` value (in milliseconds) to the `useWidgetData` hook. Set `refreshInterval: 0` to disable polling entirely.

---

## Chapter 19: LLM Observability

Tiresias Proxy provides comprehensive observability for all LLM traffic passing through the platform. Every request and response is intercepted, metered, encrypted, and recorded in a tamper-evident audit log. This chapter covers trace inspection, session tracking, spend analytics, provider health monitoring, envelope encryption, and session replay.

### 19.1 Tiresias Proxy Architecture

#### Request Lifecycle

When an LLM request arrives at the Tiresias Proxy `/v1/chat/completions` endpoint, the following processing pipeline executes:

```
Client Request
      |
      v
+-----+------+
| Parse Body |  Extract model, stream flag, session ID, metadata
+-----+------+
      |
      v
+-----+------+
| Provider   |  Route to provider via cascade (ProviderRouter)
| Resolution |  or direct upstream URL
+-----+------+
      |
      v
+-----+------+
| Upstream   |  Forward to OpenAI, Anthropic, Gemini, Groq,
| Dispatch   |  Bedrock, or OpenRouter
+-----+------+
      |
      v
+-----+------+
| Response   |  For streaming: assemble SSE chunks into unified response
| Assembly   |  For non-streaming: parse JSON response directly
+-----+------+
      |
      v
+-----+------+
| Record     |  Encrypt prompt/completion, compute hashes,
| Turn       |  calculate cost, write audit log row
+-----+------+
      |
      v
+-----+------+
| Usage      |  Upsert hourly usage bucket (tokens, cost, errors)
| Bucket     |
+-----+------+
      |
      v
+-----+---------+
| Tool Call     |  Extract tool invocations from response,
| Extraction    |  fire-and-forget POST to SoulWatch
+-----+---------+
      |
      v
  Client Response
```

#### Provider Cascade

The Proxy supports multi-provider routing through the `ProviderRouter`. Providers are configured via the `TIRESIAS_PROVIDERS` environment variable as a comma-separated ordered list (e.g., `anthropic,openai,groq`). The router attempts each provider in cascade order, advancing to the next provider when the current one returns an error or is marked unhealthy by the `HealthTracker`.

The `HealthTracker` maintains per-provider health state:

| State | Condition | Behavior |
|-------|-----------|----------|
| **UP** | `is_healthy = true` | Provider receives traffic |
| **DEGRADED** | `is_healthy = false`, `consecutive_errors < 3` | Provider receives traffic with elevated monitoring |
| **DOWN** | `consecutive_errors >= 3` | Provider is skipped in the cascade |

Provider health status is exposed via the `GET /dash/v1/providers/health` endpoint.

#### Model-Prefix Routing

When a model name contains a provider prefix separated by a forward slash (e.g., `ollama/llama3.1:8b`), the Proxy bypasses the cascade and routes directly to the matching provider's API endpoint. This allows clients to target specific providers regardless of cascade order.

#### Streaming Support

The Proxy supports both streaming and non-streaming LLM requests:

- **Non-streaming:** The Proxy forwards the request, waits for the complete response, records the turn, and returns the response to the client.
- **Streaming:** The Proxy opens a streaming connection to the upstream provider, passes SSE chunks to the client in real time, accumulates all chunks in memory, and assembles the complete response after the stream completes. The assembled response is then recorded as a single audit log entry.

The SSE assembler (`_assemble_sse_response`) extracts:
- Content delta blocks from each chunk
- Finish reason from the final chunk
- Usage statistics (prompt tokens, completion tokens) from the usage block
- If no usage block is present, the Proxy estimates completion tokens using `count_tokens_from_string()`

### 19.2 Trace Explorer

The Trace Explorer (`/dashboard/traces`) provides a paginated, filterable view of individual LLM request audit log entries.

#### Accessing the Trace Explorer

Navigate to **Traces** in the sidebar. The trace table loads automatically with the 20 most recent traces.

#### Trace Table Columns

| Column | Field | Description |
|--------|-------|-------------|
| Timestamp | `created_at` | UTC timestamp of the request |
| Session | `session_id` | Session identifier (if provided by the client) |
| Model | `model` | LLM model name (e.g., `gpt-4o`, `claude-sonnet-4-20250514`) |
| Provider | `provider` | Upstream provider name |
| Tokens | `token_count` | Total token count (prompt + completion) |
| Cost | `cost_usd` | Calculated cost in USD |
| Latency | `latency_ms` | Round-trip latency in milliseconds |
| Status | Derived | `success`, `error`, or `timeout` |

Status is derived from the `metadata_json` field:
- `success`: No error flag and status code < 400
- `error`: Error flag is true or status code >= 400
- `timeout`: Timeout flag is true in metadata

Latency values are color-coded:
- Green: < 500ms
- Amber: 500ms -- 2000ms
- Red: > 2000ms

#### Filtering Traces

The filter bar supports four filter dimensions:

| Filter | Type | Options |
|--------|------|---------|
| Search | Text input | Searches against `session_id` (debounced 400ms) |
| Provider | Dropdown | All Providers, OpenAI, Anthropic, Bedrock, OpenRouter |
| Model | Dropdown | All Models, gpt-4o, claude-sonnet, claude-opus, sonnet, llama |
| Status | Dropdown | All Statuses, Success, Error, Timeout |

Filters are applied server-side. Changing any filter resets the page to 1. Click **Clear filters** to remove all active filters.

#### Trace Detail Expansion

Click any trace row to expand the detail panel. The expanded view shows:

| Field | Description |
|-------|-------------|
| **Trace ID** | Unique audit log row identifier (UUID) |
| **Token Breakdown** | Prompt tokens and completion tokens displayed separately |
| **Request Hash** | SHA-256 hash of the serialized request body |
| **Response Hash** | SHA-256 hash of the serialized response body |
| **Prompt** | Decrypted prompt text (if decryption is authorized and successful) |
| **Completion** | Decrypted completion text (if decryption is authorized and successful) |

> **Important:** Request and response hashes provide content integrity verification without exposing the plaintext. The SHA-256 hash is computed over `json.dumps(body, sort_keys=True)` to ensure deterministic hashing regardless of key order.

#### Pagination

The trace list paginates at 20 items per page. The pagination controls at the bottom of the table display the current range (e.g., "1--20 of 1,423 traces") and provide Previous/Next buttons. Buttons are disabled when at the first or last page respectively.

#### Trace API Reference

The trace data is served by the following backend endpoint:

```
GET /dash/v1/traces
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `start` | ISO-8601 | 30 days ago | Start of time window |
| `end` | ISO-8601 | Now | End of time window |
| `page` | Integer (>= 1) | 1 | Page number |
| `limit` | Integer (1--100) | 20 | Items per page |
| `provider` | String | None | Filter by provider name |
| `model` | String | None | Filter by model (partial match, case-insensitive) |
| `status` | String | None | Filter by derived status (`success`, `error`, `timeout`) |
| `date` | YYYY-MM-DD | None | Filter to a specific UTC date |
| `search` | String | None | Search session_id (partial match, case-insensitive) |

**Response Schema:**

```json
{
  "items": [
    {
      "id": "uuid",
      "timestamp": "ISO-8601",
      "session_id": "string | null",
      "model": "string",
      "provider": "string",
      "tokens": 0,
      "prompt_tokens": 0,
      "completion_tokens": 0,
      "cost": 0.0,
      "latency_ms": 0,
      "status": "success | error | timeout",
      "request_hash": "sha256-hex",
      "response_hash": "sha256-hex"
    }
  ],
  "total": 0,
  "page": 1,
  "limit": 20
}
```

### 19.3 Session Tracking

#### Session Identification

Sessions are identified by the `X-Tiresias-Session-Id` header on incoming requests. The `parse_session_id()` function extracts and validates the header value. When the header is absent, the audit log records `session_id = NULL` and the request is not associated with any session.

To enable session tracking, clients must include the session header on every request:

```
POST /v1/chat/completions HTTP/1.1
X-Tiresias-Session-Id: my-session-abc123
Content-Type: application/json
```

#### Session Explorer

The Session Explorer (`/dashboard/sessions`) provides a two-panel layout:

**Left Panel -- Session List**

- Displays the top sessions by total cost, loaded from `GET /dash/v1/sessions/top`
- Each session card shows: session ID (truncated), total cost, turn count, and relative time since last activity
- Searchable by session ID with a text filter
- Click a session to load its detail in the right panel

**Right Panel -- Session Detail**

When a session is selected, the detail panel loads the session replay from `GET /dash/v1/sessions/{session_id}/replay` and displays:

**Session KPI Cards:**

| KPI | Source | Description |
|-----|--------|-------------|
| Total Cost | Sum of all turn costs | Aggregate USD cost for the session |
| Turns | Count of replay turns | Number of LLM request/response pairs |
| Total Tokens | Sum of all turn tokens | Aggregate token consumption |
| Duration | `last_at - first_at` | Wall-clock duration from first to last request |

**Turn-by-Turn Timeline:**

Each turn renders as a card with:
- Turn number badge
- Model and provider labels
- Token count and cost
- Latency (color-coded)
- Link to open the turn in the Playground (`/dashboard/playground?session={id}&turn={n}`)

**Prompt and Completion Display:**

The session replay page defaults to showing content hashes rather than plaintext. Each prompt and completion section displays:
1. The SHA-256 content hash (request_hash or response_hash from the audit log)
2. A lock icon with the message: "Content hidden -- viewing requires audit role with MFA verification"
3. A disabled "Request Viewing Access" button

This default behavior ensures that sensitive LLM content is not exposed to users without explicit audit authorization, even when the data is decrypted server-side.

#### Session Tagging

The Proxy exposes a session tagging endpoint for attaching metadata to sessions after they are created:

```
POST /v1/sessions/{session_id}/tag
Content-Type: application/json

{
  "label": "customer-onboarding",
  "department": "sales",
  "priority": "high"
}
```

Tags are stored as JSON metadata and can be used for filtering and reporting.

#### Session Statistics

To retrieve aggregate statistics for a session without loading the full replay:

```
GET /v1/sessions/{session_id}
```

Returns total cost, token counts, request count, first and last timestamps, and any attached tags.

### 19.4 Spend Analytics

The Costs page (`/dashboard/costs`) provides financial observability across all LLM usage within the tenant.

#### KPI Row

Three primary KPIs are displayed at the top of the page:

| KPI | Calculation | Description |
|-----|-------------|-------------|
| **Monthly Spend** | `SUM(cost_usd)` over trailing 30 days | Total LLM spend in the current billing window |
| **Projected (EOM)** | `(monthly_spend / current_day) * 30` | Extrapolated end-of-month spend based on current burn rate |
| **Budget Remaining** | `budget - monthly_spend` | Remaining budget with a circular gauge showing percent consumed |

The budget gauge color changes based on consumption:
- Green: < 70% consumed
- Amber: 70--90% consumed
- Red: > 90% consumed

#### Cost by Provider Chart

A stacked bar chart displays daily cost broken down by provider over the trailing 30-day window. Each bar represents one UTC day. Hovering over a bar shows the exact cost for that day.

#### Cost by Model Donut

A donut chart shows cost distribution across models or providers. The chart renders segments proportional to each model's share of total spend, with a legend showing percentage breakdowns.

#### Top Sessions by Cost

A table ranks sessions by total cost in descending order. Columns include:

| Column | Description |
|--------|-------------|
| Session | Session ID (truncated, monospace) |
| Cost | Total USD cost |
| Requests | Number of LLM requests in the session |
| Tokens | Total token count |
| Model | Primary model used |
| Provider | Primary provider used |
| Last Active | Timestamp of most recent activity |

The table loads data from `GET /dash/v1/sessions/top` with a configurable `limit` parameter (default 20, maximum 100).

#### Spend Summary API

```
GET /dash/v1/spend?start={ISO-8601}&end={ISO-8601}
```

**Response:**

```json
{
  "total_cost": 42.15,
  "total_tokens": 1250000,
  "total_prompt_tokens": 875000,
  "total_completion_tokens": 375000,
  "request_count": 3200,
  "start": "2026-03-01T00:00:00+00:00",
  "end": "2026-03-31T23:59:59+00:00"
}
```

### 19.5 Provider Health

The Provider Health view (`/dashboard/providers`) displays the real-time status of all configured upstream LLM providers.

#### Health Status Derivation

Provider health is computed by the `HealthTracker` based on consecutive error counts:

```python
if is_healthy:
    status = "UP"
elif consecutive_errors >= 3:
    status = "DOWN"
else:
    status = "DEGRADED"
```

#### Provider Health API

```
GET /dash/v1/providers/health
```

**Response:**

```json
{
  "cascade": ["anthropic", "openai", "groq"],
  "providers": [
    {
      "name": "anthropic",
      "is_healthy": true,
      "consecutive_errors": 0,
      "last_success": "2026-04-02T14:30:00Z",
      "last_error": null,
      "status": "UP"
    },
    {
      "name": "openai",
      "is_healthy": true,
      "consecutive_errors": 1,
      "last_success": "2026-04-02T14:29:55Z",
      "last_error": "2026-04-02T14:28:12Z",
      "status": "UP"
    }
  ]
}
```

The `cascade` array reflects the configured provider order from `TIRESIAS_PROVIDERS`. The `providers` array contains per-provider health telemetry.

#### Latency Percentiles API

The latency percentiles endpoint returns p50, p95, and p99 latency for each provider over the specified time window:

```
GET /dash/v1/latency?start={ISO-8601}&end={ISO-8601}
```

**Response:**

```json
{
  "providers": [
    {
      "name": "anthropic",
      "sample_count": 1200,
      "p50": 245.50,
      "p95": 890.25,
      "p99": 1450.00
    }
  ]
}
```

Latency values are extracted from the `metadata_json.latency_ms` field in audit log rows. The percentile calculation uses sorted array indexing: `index = min(floor(len * pct / 100), len - 1)`.

#### Error Rates API

The error rates endpoint returns error counts and rates per provider:

```
GET /dash/v1/errors?start={ISO-8601}&end={ISO-8601}
```

**Response:**

```json
{
  "providers": [
    {
      "name": "openai",
      "total_requests": 5000,
      "error_count": 23,
      "error_rate": 0.0046,
      "status_codes": [
        {"code": 429, "count": 18},
        {"code": 500, "count": 5}
      ]
    }
  ]
}
```

Errors are identified by `status_code >= 400` or the presence of an `error` flag in `metadata_json`.

### 19.6 Envelope Encryption

All LLM prompt and completion content is encrypted at rest using envelope encryption before being written to the audit log. This ensures that even with database access, an attacker cannot read sensitive LLM conversation content without the encryption keys.

#### Encryption Architecture

Tiresias implements a two-layer key hierarchy:

```
+------------------+
| KEK (Key         |     Wraps / unwraps DEK
| Encryption Key)  |     Stored externally (env var, KMS, Vault)
+--------+---------+
         |
         v
+--------+---------+
| DEK (Data        |     Encrypts / decrypts field data
| Encryption Key)  |     Stored in DB as wrapped blob
+--------+---------+
         |
         v
+--------+---------+
| Plaintext Fields |     prompt, completion
| (AES-256-GCM)    |
+------------------+
```

**Data Encryption Key (DEK):**
- Generated using `os.urandom(32)` (256-bit cryptographically random)
- One DEK per tenant
- Stored in the `tiresias_licenses` table as `wrapped_dek` (encrypted by the KEK)
- Cached in process memory for the container lifetime to avoid repeated unwrap operations

**Key Encryption Key (KEK):**
- External key used to wrap and unwrap the DEK
- Providers: `LocalKEKProvider` (development), cloud KMS (production)
- Never stored in the database
- Never logged

#### KEK Providers

Tiresias supports pluggable KEK providers through the `KEKProvider` abstract base class:

**`LocalKEKProvider`** (for development and single-node deployments):

| Factory Method | Input | Key Derivation |
|----------------|-------|----------------|
| `from_explicit_value(hex_or_base64)` | 32-byte key as hex (64 chars) or base64 | Direct use, no derivation |
| `from_api_key(api_key)` | Arbitrary API key string | HKDF-SHA256 with salt `tiresias-kek-v1` |

For production deployments, use a cloud KMS provider (AWS KMS, GCP Cloud KMS, HashiCorp Vault) that stores the KEK in a hardware security module.

#### Field-Level Encryption

The `encrypt_field()` function encrypts a plaintext string using AES-256-GCM:

1. Generate a 12-byte (96-bit) random nonce
2. Encrypt the plaintext with AES-256-GCM using the DEK and nonce
3. Return: `nonce (12 bytes) || ciphertext + authentication tag`

The `decrypt_field()` function reverses the process:

1. Split the blob at byte 12: `nonce = blob[:12]`, `ciphertext = blob[12:]`
2. Decrypt using AES-256-GCM with the DEK and nonce
3. Return the plaintext string

AES-GCM provides both confidentiality and integrity. Any modification to the ciphertext or nonce causes decryption to fail with an authentication error.

#### Encrypted Audit Log Fields

The following fields in the `tiresias_audit_log` table are stored encrypted:

| Column | Content | Encryption |
|--------|---------|------------|
| `encrypted_prompt` | Full JSON-serialized message array | AES-256-GCM with tenant DEK |
| `encrypted_completion` | Extracted completion text from LLM response | AES-256-GCM with tenant DEK |

All other audit log fields (model, provider, token counts, cost, timestamps, hashes, metadata) are stored in plaintext for query performance.

#### DEK Rotation

To rotate the DEK wrapping without re-encrypting existing data, use the `rotate_dek()` method:

```python
await envelope.rotate_dek(
    tenant_id="tenant-uuid",
    old_provider=old_kek_provider,
    new_provider=new_kek_provider,
    session=db_session,
)
```

This operation:
1. Unwraps the existing DEK using the old KEK provider
2. Re-wraps the same DEK using the new KEK provider
3. Updates the `wrapped_dek` and `kek_provider` columns in `tiresias_licenses`
4. Updates the in-memory DEK cache

> **Important:** DEK rotation changes only the wrapping. The underlying DEK bytes remain identical, so all previously encrypted audit log entries remain readable without re-encryption. This is a key advantage of envelope encryption.

### 19.7 Session Replay

Session replay provides a complete, decrypted reconstruction of every turn in an LLM session, enabling forensic investigation of agent behavior.

#### Replay Endpoint

```
GET /dash/v1/sessions/{session_id}/replay
```

**Response:**

```json
{
  "turns": [
    {
      "turn": 1,
      "id": "audit-log-row-uuid",
      "model": "claude-sonnet-4-20250514",
      "provider": "anthropic",
      "tokens": 1250,
      "cost": 0.0037,
      "prompt_tokens": 800,
      "completion_tokens": 450,
      "timestamp": "2026-04-02T14:30:00Z",
      "latency_ms": 340,
      "prompt": "[decrypted prompt text or null]",
      "completion": "[decrypted completion text or null]",
      "metadata": {}
    }
  ],
  "total_cost": 0.0254,
  "total_tokens": 8500,
  "duration_ms": 45200
}
```

#### Decryption Process

The replay endpoint performs the following steps:

1. Query all `tiresias_audit_log` rows matching the `tenant_id` and `session_id`, ordered by `created_at` ascending.
2. Resolve the tenant DEK by calling `envelope.get_or_create_dek(tenant_id, session)`. The DEK is resolved once and reused for all rows in the replay.
3. For each row, decrypt `encrypted_prompt` and `encrypted_completion` using the DEK.
4. If decryption fails for any field (key mismatch, corrupted data), the field value is set to `[decryption failed]`.
5. If the `EnvelopeEncryption` instance is not available (e.g., KEK provider not configured), prompt and completion fields return `null`.

#### Duration Calculation

Session duration is computed as the elapsed time between the first and last audit log entries:

```python
duration_ms = int((last_row.created_at - first_row.created_at).total_seconds() * 1000)
```

This measures wall-clock time, not cumulative latency. Gaps between turns (user think time, agent processing) are included.

### 19.8 Generic API Proxy Observability

In addition to LLM request tracing, the Tiresias Proxy provides observability for generic API traffic routed through the `/api/{path}` catch-all endpoint.

#### Path Normalization

The Proxy normalizes URL paths by replacing ID-like segments with `{id}` placeholders. This groups requests to the same logical endpoint regardless of specific resource IDs:

| Raw Path | Normalized Pattern |
|----------|--------------------|
| `/v1/customers/cus_abc123/subscriptions` | `/v1/customers/{id}/subscriptions` |
| `/v1/charges/ch_1AbCdE2fGhI3jK` | `/v1/charges/{id}` |
| `/users/550e8400-e29b-41d4-a716-446655440000` | `/users/{id}` |

The normalizer recognizes the following ID patterns:
- UUIDs (8-4-4-4-12 hex format)
- Pure numeric values
- Stripe/Twilio-style prefixed IDs (e.g., `ch_xxx`, `cus_xxx`, `AC...`)
- Long hex strings (24+ characters, MongoDB-style)

#### API Telemetry Recording

Each generic proxy request records the following telemetry:

| Field | Source | Description |
|-------|--------|-------------|
| `method` | Request | HTTP method (GET, POST, PUT, DELETE, PATCH) |
| `path` | Request | Raw URL path |
| `path_pattern` | Derived | Normalized path with `{id}` placeholders |
| `status_code` | Response | Upstream HTTP status code |
| `latency_ms` | Measured | Round-trip time to upstream in milliseconds |
| `request_size` | Request | Size of the request body in bytes |
| `response_size` | Response | Size of the response body in bytes |
| `cost_usd` | Calculated | Per-call cost based on API service pricing |

Telemetry is persisted to the `tiresias_api_log` table and aggregated into hourly buckets in the `tiresias_api_endpoint_bucket` table.

#### Unified Analytics

The `GET /v1/analytics/unified` endpoint merges LLM telemetry and API telemetry into a single-pane view, providing combined cost, latency, and error rate metrics across all proxied traffic.

---

## Chapter 20: Aletheia -- AI Transparency

Aletheia is the AI transparency subsystem of Tiresias, providing chain-of-thought (CoT) integrity auditing, tool invocation tracking, output sanitization monitoring, and policy violation forensics. All Aletheia features are gated to the Enterprise tier and above.

The name references the ancient Greek concept of disclosure and truth -- the function of Aletheia is to make AI agent reasoning and actions observable, verifiable, and auditable.

### 20.1 Aletheia Architecture

Aletheia consists of three subsystems within SoulWatch:

| Subsystem | API Prefix | Database Models | Function |
|-----------|-----------|----------------|----------|
| **CoT Chain** | `/watch/v1/aletheia/cot` | `AletheiaCotChain`, `AletheiaCotContent` | Tamper-evident hash chain of chain-of-thought records |
| **Tool Invocations** | `/watch/v1/aletheia/tools` | `AletheiaToolInvocation` | Per-invocation telemetry for agent tool use |
| **Sanitizer** | (via tool invocations) | `AletheiaToolInvocation` (sanitizer fields) | Output sanitization verdicts and pattern matching |

All Aletheia API endpoints require the `aletheia:read` permission, enforced by the RBAC middleware via `require_permission("aletheia:read")`.

#### Portal Integration

The Portal exposes Aletheia through four pages:

| Page | Path | Description |
|------|------|-------------|
| **Overview** | `/dashboard/aletheia` | Combined CoT health, tool timeline, sanitizer verdicts, policy violations |
| **CoT Audit** | `/dashboard/aletheia/cot-audit` | Detailed chain entry inspection with verification and proof export |
| **Tool Activity** | `/dashboard/aletheia/tool-activity` | Tool invocation timeline, command frequency, agent ranking |
| **Sanitizer** | `/dashboard/aletheia/sanitizer` | Verdict distribution, pattern match frequency, blocked response details |

### 20.2 Chain-of-Thought Hash Chain

The CoT hash chain provides tamper-evident auditing of every chain-of-thought reasoning block produced by LLM agents. Each chain entry is linked to the previous entry via a cryptographic hash, forming an append-only chain that detects any insertion, deletion, or modification of entries.

#### Chain Entry Schema

Each entry in the `AletheiaCotChain` table contains:

| Field | Type | Description |
|-------|------|-------------|
| `request_id` | UUID | Unique identifier for the originating LLM request |
| `chain_id` | UUID | Identifier for the hash chain this entry belongs to |
| `entry_index` | Integer | Sequential position in the chain (0-based) |
| `model` | String | LLM model that produced the chain-of-thought |
| `provider` | String | Provider that served the request |
| `agent_id` | String | Agent that initiated the request |
| `cot_hash` | String | SHA-256 hash of the raw chain-of-thought content |
| `cot_token_count` | Integer | Token count of the chain-of-thought block |
| `cot_byte_count` | Integer | Byte size of the chain-of-thought content |
| `content_stored` | Boolean | Whether the full CoT content was stored (encrypted) |
| `prev_hash` | String | `entry_hash` of the preceding chain entry |
| `entry_hash` | String | Hash of the current entry (includes `prev_hash` for chaining) |
| `timestamp` | DateTime | UTC timestamp of entry creation |

#### Chain Integrity Model

The hash chain provides the following integrity guarantee:

```
entry[0].entry_hash = H(entry[0].fields)
entry[0].prev_hash  = NULL (genesis entry)

entry[n].prev_hash   = entry[n-1].entry_hash
entry[n].entry_hash  = H(entry[n].fields || entry[n].prev_hash)
```

Where `H` is SHA-256. Any modification to a prior entry changes its `entry_hash`, which breaks the `prev_hash` linkage of all subsequent entries.

#### Listing Chain Entries

```
GET /watch/v1/aletheia/cot/chain
    ?tenant_id={uuid}
    &limit=50
    &offset=0
    &since={ISO-8601}
    &until={ISO-8601}
```

**Response:**

```json
{
  "entries": [
    {
      "request_id": "uuid",
      "model": "claude-sonnet-4-20250514",
      "provider": "anthropic",
      "cot_token_count": 1250,
      "timestamp": "2026-04-02T14:30:00Z",
      "chain_hash": "sha256-hex",
      "prev_hash": "sha256-hex",
      "agent_id": "agent-alfred",
      "entry_index": 42,
      "chain_id": "uuid"
    }
  ],
  "total": 1250
}
```

Entries are returned in descending timestamp order (newest first) with pagination via `limit` and `offset`.

#### Retrieving CoT Content

```
GET /watch/v1/aletheia/cot/chain/{request_id}/content
```

**Response:**

```json
{
  "content": null,
  "encrypted": true
}
```

CoT content is encrypted at rest using the tenant DEK. The content endpoint currently returns `encrypted: true` with `content: null` when the decryption key management is not yet wired for the requesting session. Full content access requires:

1. The tenant DEK must be provisioned and accessible
2. The requesting user must hold the `aletheia:read` permission
3. The requesting session must satisfy MFA verification requirements (when configured)

### 20.3 Chain Integrity Verification

#### On-Demand Verification

The Portal CoT Audit page (`/dashboard/aletheia/cot-audit`) provides a **Verify Chain** button that triggers a full integrity check.

**Procedure:**

**Step 1.** Navigate to **Aletheia > CoT Audit**.

**Step 2.** Click **Verify Chain**. The button shows "Verifying..." during the operation.

**Step 3.** The result appears as a badge next to the button:
- **Green badge:** "Chain Valid (N entries)" -- all `prev_hash` linkages verified
- **Red badge:** "Broken at entry N" -- integrity violation detected at the specified entry index

#### Verification API

```
POST /watch/v1/aletheia/cot/chain/verify
    ?tenant_id={uuid}
Content-Type: application/json

{
  "start_index": 0,
  "end_index": -1
}
```

Set `end_index` to `-1` to verify the entire chain. To verify a specific range, provide both `start_index` and `end_index`.

**Response (valid chain):**

```json
{
  "valid": true,
  "broken_at": null,
  "checked_entries": 1250
}
```

**Response (broken chain):**

```json
{
  "valid": false,
  "broken_at": 847,
  "checked_entries": 848
}
```

The verification algorithm walks the chain in ascending `entry_index` order and checks that each entry's `prev_hash` matches the preceding entry's `entry_hash`. The first mismatch terminates the walk.

#### Proof Document Export

For compliance and external audit purposes, the Portal supports exporting a complete proof document of the CoT hash chain.

**Step 1.** On the CoT Audit page, click **Export Proof**.

**Step 2.** The Portal requests a proof document from the API and downloads it as a JSON file named `cot-proof-{date}.json`.

**Proof Document API:**

```
POST /watch/v1/aletheia/cot/chain/proof
    ?tenant_id={uuid}
Content-Type: application/json

{
  "format": "json"
}
```

**Response:**

```json
{
  "tenant_id": "uuid",
  "generated_at": "2026-04-02T15:00:00Z",
  "total_entries": 1250,
  "chain_valid": true,
  "broken_at": null,
  "first_entry_hash": "sha256-hex",
  "last_entry_hash": "sha256-hex",
  "entries": [
    {
      "entry_index": 0,
      "request_id": "uuid",
      "chain_id": "uuid",
      "timestamp": "2026-03-01T00:00:00Z",
      "model": "claude-sonnet-4-20250514",
      "provider": "anthropic",
      "agent_id": "agent-alfred",
      "cot_hash": "sha256-hex",
      "cot_token_count": 1250,
      "cot_byte_count": 5120,
      "prev_hash": null,
      "entry_hash": "sha256-hex",
      "content_stored": true
    }
  ]
}
```

The proof document includes inline chain verification. The `chain_valid` and `broken_at` fields reflect the result of walking the chain at export time. External auditors can independently verify the chain by recomputing hashes over the exported entries.

### 20.4 Tool Invocation Tracking

Aletheia captures every tool invocation made by AI agents during LLM sessions. Tool invocations are extracted from LLM responses by the Tiresias Proxy interceptor and forwarded to SoulWatch as fire-and-forget events.

#### Tool Call Extraction

The Proxy's `_extract_tool_calls()` function recognizes two tool call formats:

**Anthropic/Claude format:**

```json
{
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_abc123",
      "name": "bash",
      "input": {"command": "ls -la"}
    }
  ]
}
```

**OpenAI format:**

```json
{
  "choices": [{
    "message": {
      "tool_calls": [{
        "id": "call_abc123",
        "function": {
          "name": "bash",
          "arguments": "{\"command\": \"ls -la\"}"
        }
      }]
    }
  }]
}
```

Both formats are normalized to a common structure and forwarded to SoulWatch:

```json
{
  "event_type": "tool_invocation",
  "version": "1.0",
  "timestamp": "2026-04-02T14:30:00Z",
  "agent_id": "session-id-or-unknown",
  "tenant_id": "tenant-uuid",
  "invocation_id": "inv_abc123def456",
  "command": "bash",
  "args": "{\"command\": \"ls -la\"}",
  "full_command": "bash({\"command\": \"ls -la\"})",
  "execution": {
    "exit_code": 0,
    "duration_ms": 0,
    "stdout_bytes": 0,
    "stderr_bytes": 0
  },
  "policy": {"evaluated": false, "verdict": "skipped"},
  "sanitizer": {"mode": "passthrough", "verdict": "skipped"}
}
```

#### Invocation Record Schema

Each tool invocation stored in the `AletheiaToolInvocation` table contains:

| Field | Type | Description |
|-------|------|-------------|
| `invocation_id` | String | Unique invocation identifier (`inv_{hex12}`) |
| `agent_id` | String | Agent or session that initiated the tool call |
| `tenant_id` | UUID | Tenant scope |
| `command` | String | Tool/function name |
| `args` | String | Serialized arguments |
| `full_command` | String | Combined command string (first 200 chars of args) |
| `working_directory` | String | Working directory at invocation time (if available) |
| `exit_code` | Integer | Execution exit code (0 = success) |
| `duration_ms` | Integer | Execution duration in milliseconds |
| `stdout_bytes` | Integer | Bytes of standard output produced |
| `stderr_bytes` | Integer | Bytes of standard error produced |
| `stdout_hash` | String | SHA-256 hash of stdout content |
| `stderr_hash` | String | SHA-256 hash of stderr content |
| `policy_verdict` | String | Policy evaluation result: `allow`, `deny`, or `skipped` |
| `policy_rule_matched` | String | Name of the policy rule that matched (if any) |
| `sanitizer_mode` | String | Sanitizer operating mode: `passthrough`, `warn`, `enforce` |
| `sanitizer_verdict` | String | Sanitizer result: `pass`, `warn`, or `block` |
| `patterns_matched` | String[] | List of sanitizer pattern names that matched |
| `environment_hash` | String | Hash of the execution environment snapshot |
| `timestamp` | DateTime | UTC timestamp of the invocation |

#### Listing Invocations

```
GET /watch/v1/aletheia/tools/invocations
    ?tenant_id={uuid}
    &agent_id={string}
    &command={prefix}
    &exit_code={int}
    &policy_verdict={allow|deny}
    &sanitizer_verdict={pass|warn|block}
    &since={ISO-8601}
    &until={ISO-8601}
    &limit=50
    &offset=0
```

All filter parameters are optional. When `since` and `until` are omitted, the default time window is the trailing 24 hours. The `command` parameter uses prefix matching.

**Response:**

```json
{
  "invocations": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "invocation_id": "inv_abc123",
      "agent_id": "agent-alfred",
      "timestamp": "2026-04-02T14:30:00Z",
      "command": "bash",
      "args": "{\"command\": \"ls -la\"}",
      "full_command": "bash({\"command\": \"ls -la\"})",
      "exit_code": 0,
      "duration_ms": 120,
      "policy_verdict": "allow",
      "sanitizer_verdict": "pass",
      "patterns_matched": []
    }
  ],
  "total": 5000,
  "limit": 50,
  "offset": 0
}
```

#### Invocation Detail

```
GET /watch/v1/aletheia/tools/invocations/{invocation_id}
```

Returns the complete record for a single invocation, including all fields from the schema table above.

#### Tool Activity Portal Page

The Tool Activity page (`/dashboard/aletheia/tool-activity`) provides four panels:

**Invocation Timeline (top-left):**

Displays tool invocations grouped by hour, with each entry showing:
- Command name (monospace)
- Exit code badge (green for 0, red for non-zero)
- Agent ID
- Duration in milliseconds
- Relative timestamp

Click any invocation to expand its detail panel showing command, agent, duration, exit code, policy verdict, sanitizer verdict, working directory, matched policy rules, matched patterns, and arguments.

**Command Frequency (top-right):**

Horizontal bar chart ranking the top 10 tool commands by invocation count. Click any command bar to filter the timeline to only that command. Click again to clear the filter.

**Agent Activity (bottom-left):**

Horizontal bar chart ranking agents by tool invocation count. Click any agent bar to filter the timeline. Cross-filtering with command frequency is supported (both filters apply simultaneously).

**Deny/Block Log (bottom-right):**

Lists all invocations where `policy_verdict = "deny"` or `sanitizer_verdict = "block"`. Each entry shows:
- Command name
- Deny or block badge
- Agent ID
- Matched policy rule or "sanitizer"
- Relative timestamp

Click any entry to expand full details including the matched patterns and execution metadata.

### 20.5 Tool Invocation Summary and Timeline

#### Aggregate Summary

```
GET /watch/v1/aletheia/tools/summary
    ?tenant_id={uuid}
    &agent_id={string}
    &since={ISO-8601}
    &until={ISO-8601}
```

**Response:**

```json
{
  "total_invocations": 5000,
  "unique_commands": 42,
  "unique_agents": 8,
  "avg_duration_ms": 145.3,
  "total_denied": 12,
  "total_sanitizer_blocks": 3,
  "top_commands": [
    {"command": "bash", "count": 1200},
    {"command": "Read", "count": 980}
  ],
  "top_agents": [
    {"agent_id": "agent-alfred", "count": 2500}
  ],
  "error_rate": 0.0024,
  "time_range": {
    "since": "2026-04-01T00:00:00Z",
    "until": "2026-04-02T00:00:00Z"
  }
}
```

The summary endpoint computes aggregates in a single SQL query, including:
- `total_denied`: Count of invocations where `policy_verdict = "deny"`
- `total_sanitizer_blocks`: Count of invocations where `sanitizer_verdict = "block"`
- `error_rate`: Ratio of invocations with `exit_code > 0` to total invocations

#### Time-Bucketed Timeline

```
GET /watch/v1/aletheia/tools/timeline
    ?tenant_id={uuid}
    &agent_id={string}
    &command={prefix}
    &since={ISO-8601}
    &until={ISO-8601}
    &bucket={1m|5m|15m|1h|1d}
```

**Response:**

```json
{
  "buckets": [
    {
      "timestamp": "2026-04-02T14:00:00Z",
      "count": 42,
      "errors": 2,
      "denied": 1
    }
  ],
  "bucket_size": "1h"
}
```

Available bucket sizes:

| Label | Seconds | Use Case |
|-------|---------|----------|
| `1m` | 60 | Real-time monitoring |
| `5m` | 300 | Short-term trend analysis |
| `15m` | 900 | Medium-term analysis |
| `1h` | 3600 | Default daily overview |
| `1d` | 86400 | Long-term trend analysis |

Bucketing uses PostgreSQL epoch arithmetic: `floor(extract(epoch from timestamp) / bucket_seconds) * bucket_seconds`, converted back to a timestamp via `to_timestamp()`.

### 20.6 Output Sanitization Monitoring

The Sanitizer subsystem inspects agent tool output for sensitive patterns (credentials, PII, internal URLs, secrets) and assigns a verdict to each invocation.

#### Verdict Types

| Verdict | Action | Description |
|---------|--------|-------------|
| `pass` | Content delivered unmodified | No sensitive patterns detected |
| `warn` | Content delivered with alert | Suspicious patterns detected but below block threshold |
| `block` | Content withheld from agent | Sensitive patterns exceed the block threshold |

#### Sanitizer Dashboard

The Sanitizer page (`/dashboard/aletheia/sanitizer`) provides three views:

**Verdict Distribution (top):**

Three large KPI cards showing pass, warn, and block counts with percentages. A stacked progress bar visualizes the ratio. Click any verdict card to filter the invocation list below to only that verdict.

**Pattern Match Frequency (bottom-left):**

Horizontal bar chart ranking sanitizer patterns by match count. Click any pattern to filter matching invocations. Supports cross-filtering with the verdict filter.

**Filtered Invocations / Blocked Response Details (bottom-right):**

When no filter is active, this panel shows only blocked responses. When a verdict or pattern filter is active, it shows all matching invocations. Each entry displays:
- Command name
- Sanitizer verdict badge
- Agent ID
- Matched patterns as inline badges
- Stdout hash (truncated, for content verification)
- Relative timestamp

Expanding an entry shows the complete detail including command, agent, duration, exit code, stderr hash, stdout hash, matched patterns, and arguments.

#### Blocked Response Tracking

When the sanitizer blocks a response (`sanitizer_verdict = "block"`), the following data is captured:

1. **Stdout hash** -- SHA-256 hash of the blocked output, allowing content verification without exposure
2. **Stderr hash** -- SHA-256 hash of any error output
3. **Patterns matched** -- List of all sanitizer pattern names that triggered the block
4. **Duration** -- Time elapsed before the block decision
5. **Agent ID** -- The agent whose output was blocked

This data enables forensic investigation of blocked responses without exposing the sensitive content that triggered the block.

### 20.7 Aletheia Overview Dashboard

The Aletheia Overview page (`/dashboard/aletheia`) provides a consolidated view across all three Aletheia subsystems in a four-panel layout:

**CoT Chain Health (top-left):**

- Total chain entry count
- Chain health status badge: "Healthy" (green) when entries exist, "Unverified" (amber) when no entries are recorded
- Timestamp of the most recent entry

Data source: `GET /watch/v1/aletheia/cot/chain?limit=10`, refresh interval 30 seconds.

**Tool Invocation Timeline (top-right):**

- Vertical timeline of the 8 most recent tool invocations
- Each entry shows: command name, exit code badge, agent ID, relative timestamp
- Connected by a vertical line with dot markers

Data source: `GET /watch/v1/aletheia/tools/invocations?limit=20`, refresh interval 30 seconds.

**Sanitizer Verdicts (bottom-left):**

- Three KPI cards: Pass (green), Warn (amber), Block (red)
- Stacked progress bar showing verdict distribution

Data source: `GET /watch/v1/aletheia/tools/summary`, refresh interval 60 seconds.

**Policy Violations (bottom-right):**

- Table of recent invocations where `policy_verdict != "allow"`
- Columns: Command, Agent, Rule (matched policy rule name), Time
- Shows up to 10 most recent violations

Data source: `GET /watch/v1/aletheia/tools/invocations?limit=50` (filtered client-side to `policy_verdict != "allow"`), refresh interval 30 seconds.

When no violations exist, the panel displays a shield-check icon with the message "No policy violations detected."

### 20.8 Aletheia API Authentication and Authorization

All Aletheia endpoints enforce two layers of access control:

**Layer 1 -- API Authentication:**

Requests to Aletheia endpoints must include a valid authentication credential. The SoulWatch API accepts:
- `X-SoulKey` header with a valid agent SoulKey
- `X-Tiresias-Api-Key` header with a valid API key
- `Authorization: Bearer {token}` header with a valid capability token

**Layer 2 -- RBAC Permission:**

After authentication, the RBAC middleware checks that the authenticated identity holds the `aletheia:read` permission. This permission is included in the following predefined roles:

| Role | `aletheia:read` | Notes |
|------|-----------------|-------|
| Global Admin | Yes | Full access to all Aletheia data across tenants |
| Tenant Admin | Yes | Access scoped to the tenant |
| Analyst | Yes | Read-only access for investigation |
| Viewer | No | Cannot access Aletheia endpoints |

Custom roles can include the `aletheia:read` permission as needed. See Chapter 23 for custom role configuration.

### 20.9 Operational Procedures

#### Investigate a Suspicious Tool Invocation

**Step 1.** Navigate to **Aletheia > Tool Activity**.

**Step 2.** In the Command Frequency panel, identify the suspicious command (e.g., `bash`, `exec`, `http_request`).

**Step 3.** Click the command bar to filter the timeline. Review the filtered invocations for anomalous patterns: unusual agents, high error rates, or denied verdicts.

**Step 4.** Click a specific invocation to expand its detail. Note the agent ID, policy verdict, matched rules, and execution metadata.

**Step 5.** Cross-reference the agent ID in the Agent Activity panel to determine if the agent has an abnormal invocation volume.

**Step 6.** Check the Deny/Block Log for any related policy violations by the same agent.

**Step 7.** If the invocation is associated with an LLM session, navigate to **Sessions** and search for the session ID to review the full conversation context.

#### Verify Chain Integrity After an Incident

**Step 1.** Navigate to **Aletheia > CoT Audit**.

**Step 2.** Click **Verify Chain**. Wait for the verification to complete.

**Step 3.** If the chain is valid, export a proof document by clicking **Export Proof** for your incident record.

**Step 4.** If the chain is broken, note the `broken_at` entry index. This indicates the exact point where the chain was compromised.

**Step 5.** Expand the chain entries around the break point to inspect the chain_hash and prev_hash values. Compare with the proof document from the last known-good verification.

**Step 6.** Escalate to platform administrators. A broken chain may indicate:
- Database corruption
- Unauthorized direct database modification
- A bug in the chain construction logic
- An attack on the audit subsystem

#### Export Evidence for Compliance Audit

**Step 1.** Navigate to **Aletheia > CoT Audit**.

**Step 2.** Click **Verify Chain** to confirm chain integrity.

**Step 3.** Click **Export Proof** to download the proof document.

**Step 4.** The proof document contains the complete hash chain with inline verification results. Provide this file to external auditors along with:
- The tenant ID
- The time range covered
- The total entry count
- The first and last entry hashes (for out-of-band verification)

The proof document is self-contained: an auditor can independently verify the chain by walking the entries array and checking that each entry's `prev_hash` matches the preceding entry's `entry_hash`.

---

> **Next:** Part VII covers Enterprise Features including Multi-Tenancy (Chapter 21), Single Sign-On (Chapter 22), RBAC (Chapter 23), and Compliance (Chapter 24).
