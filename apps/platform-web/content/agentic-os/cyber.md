# CyberSec OS — Full Execution Plan (Assess → Plan → Execute → Validate)

## How to Use This Document

Every ticket follows **EPIC-XX-[A|P|E|V]-NN** where A = Assess, P = Plan, E = Execute, V = Validate, mirroring the other OS plans.[1]
Epics are independent enough to be parallelized after EPIC-01 and EPIC-02 complete.[1]
Execute tickets include concrete file paths, package names, and commands; Validate tickets include pass/fail criteria an automated agent can evaluate without ambiguity.[1]

CyberSec OS is a security operations and engineering ecosystem that:

- Aggregates telemetry and alerts from open-source SIEM, IDS/IPS, EDR, and scanners into a normalized model.
- Provides agentic copilots for alert triage, investigation, hunting, and response drafting.
- Coordinates detections, playbooks, DFIR timelines, and threat intel.
- Integrates open-source security tools as first-class co-processes exposed via MCP tools.

***

## Frozen Tech Stack (All Tickets Assume This)

Same foundation as your other OSes.[1]

| Layer | Package | License | Pin |
|---|---|---|---|
| Monorepo | `turborepo` | MIT | latest |
| Framework | `next` (App Router) | MIT | 14.x |
| Language | TypeScript | Apache-2.0 | 5.x |
| Package mgr | `pnpm` | MIT | 9.x |
| Styling | `tailwindcss` + `shadcn/ui` | MIT | 3.x |
| ORM | `prisma` + `@prisma/client` | Apache-2.0 | 5.x |
| Database | SQLite (dev) / Postgres (prod) | — | — |
| Auth | `next-auth` v5 | MIT | 5.x |
| State | `zustand` | MIT | 4.x |
| MCP | `@modelcontextprotocol/sdk` | MIT | latest |
| AI SDK | `ai` (Vercel AI SDK) | Apache-2.0 | 3.x |
| Process mgr | `supervisord` | MIT | 4.x |
| Proxy | `nginx` | BSD | 1.25.x |
| Container | Docker multi-stage | Apache-2.0 | 25.x |

### Security Co‑Processes (SOC / DFIR Focus)

| Function | Default Tool | License | Notes |
|---|---|---|---|
| SIEM / log analytics | OpenSearch Dashboards OR Wazuh | Apache-2.0 / GPL | Index and search logs, alerts, and events. |
| IDS / IPS | Suricata | GPL | Network detection and alerting. |
| EDR / agent telemetry | Wazuh agent | GPL | Host logs, FIM, basic EDR-style telemetry. |
| Vuln mgmt | OpenVAS / Greenbone | GPL | Network vulnerability scanning. |
| CSPM | CloudQuery | MPL-2.0 | Cloud posture via SQL over cloud APIs. |
| Secrets exposure | TruffleHog / Gitleaks | GPL / MIT | Repo and filesystem secrets discovery.[1] |
| Threat intel | MISP | AGPL | Open-source threat intel sharing platform. |
| SOAR / workflow | n8n | Fair-code | Alert enrichment, notifications, remediation workflows.[2] |
| DFIR / timeline | Timesketch + Plaso | Apache-2.0 | Timeline forensics and event analysis. |
| Ticketing | Generic: JIRA / GitHub / TheHive | Mixed | Case management; integrated via webhooks/MCP. |

***

## EPIC-01: Project Scaffold & Monorepo

**Goal:** Create `~/cybersec-os/` Turborepo with Next.js app, core packages, and infra skeleton, matching the other OSes but with `@cybersec-os/*` prefixes.[1]

### EPIC-01-A-01 — Assess Existing Environment

**Type:** Assess  
Verify host machine has required tooling before scaffolding.

**Commands:**
```bash
node --version
pnpm --version
docker --version
git --version
python3 --version
```

**Acceptance Criteria:**

- Node >= 20.x.
- pnpm >= 9.x.
- Docker >= 25.x.
- Python >= 3.11.
- Results recorded in `SETUP_LOG.md` at repo root.

---

### EPIC-01-A-02 — Assess Monorepo Structure Requirements

**Type:** Assess

Write `ARCHITECTURE.md` containing:

```text
cybersec-os/
  apps/
    web/                         # Next.js SOC / SecEng console
  packages/
    ui/                          # shared shadcn components
    db/                          # Prisma schema + client
    mcp-server/                  # MCP server package
    mcp-client/                  # MCP client + CLI
    ingest/                      # log & alert ingestion adapters
    detections/                  # detection rule engine
    cases/                       # cases & investigations
    playbooks/                   # response playbooks and engine
    threat-intel/                # MISP + feed integration
    dfir/                        # DFIR helpers and timelines
    telemetry/                   # metrics & audit
  infra/
    nginx/
    supervisord/
    docker/
    opensearch/
    wazuh/
    n8n/
```

---

### EPIC-01-P-01 — Plan Turborepo Pipeline Config

**Type:** Plan

Define `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "outputs": [] },
    "test": { "outputs": [] },
    "db:generate": { "cache": false },
    "detections:test": { "outputs": [] },
    "playbooks:test": { "outputs": [] }
  }
}
```

---

### EPIC-01-E-01 — Scaffold Turborepo Root

**Type:** Execute

**Commands:**
```bash
mkdir cybersec-os && cd cybersec-os
git init
pnpm init
pnpm add -D turbo typescript @types/node
```

**Files:**

- `pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- `turbo.json` from EPIC-01-P-01.
- `.gitignore` with `node_modules`, `.next`, `.turbo`, `dist`, `*.db`.
- `tsconfig.base.json` with strict TS options (matching other OSes).[1]

---

### EPIC-01-E-02 — Scaffold Next.js App

**Type:** Execute

**Commands:**
```bash
cd apps
pnpm create next-app@14 web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/ *"
```

(Replace `@/ *` above with `"@/*"` when running.)

**Post-scaffold edits:**

- `apps/web/tsconfig.json` extends `../../tsconfig.base.json`.
- `apps/web/package.json` name set to `"@cybersec-os/web"`.
- Remove default logo assets.

---

### EPIC-01-E-03 — Install shadcn/ui

**Type:** Execute

From `apps/web`:

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input textarea label badge avatar separator
pnpm dlx shadcn@latest add dropdown-menu navigation-menu sheet tabs toast sonner
```

---

### EPIC-01-E-04 — Scaffold Shared Packages

**Type:** Execute

**Commands:**
```bash
mkdir -p packages/{ui,db,mcp-server,mcp-client,ingest,detections,cases,playbooks,threat-intel,dfir,telemetry}
```

Each gets a minimal `package.json` with name `@cybersec-os/<pkg>`.

---

### EPIC-01-V-01 — Validate Monorepo Boots

**Type:** Validate

**Commands:**
```bash
pnpm install
pnpm turbo run build
pnpm turbo run dev
```

**Pass Criteria:**

- Install and build succeed.
- Dev server serves web app at http://localhost:3000.

***

## EPIC-02: Domain Schema — Assets, Alerts, Cases, Playbooks

**Goal:** Prisma schema capturing assets, log sources, alerts, detections, cases, playbooks, vulnerabilities, intel, DFIR artifacts, and audit events, mirroring the schema depth in Secure Dev OS but for operations.[1]

### EPIC-02-A-01 — Audit Entities

**Type:** Assess

Write `packages/db/ENTITIES.md`:

```text
User, Session, Account (NextAuth)
OrgProfile, OrgSetting

Asset (host, container, SaaS app, user, repo)
AssetGroup (tags: env, criticality, owner)

LogSource (Wazuh, Suricata, CloudTrail, k8s-audit, syslog)
Alert (normalized alert across tools)
DetectionRule (analytics rules, thresholds)
DetectionRun (rule execution result + stats)

Vulnerability (scanner finding)
Exposure (vuln + asset + context)
RiskRegisterItem (tracked risk)

Case (investigation)
CaseEvent (activity in case)
Task (triage / containment / recovery)
Evidence (file, log excerpt, artifact ref)

Playbook (response procedure template)
PlaybookStep (atomic step)
PlaybookRun (instance)
PlaybookStepRun (per-step execution)

ThreatActor
ThreatIntelIndicator (IOC: IP, domain, URL, hash)
Campaign (red team or adversary campaign)

DFIRArtifact (disk image, memory dump, pcap ref)
TimelineEvent (DFIR timeline row)

AIConversation, AIMessage
MCPServerConfig
AutomationTrigger, AutomationLog
AuditEvent
Setting
```

---

### EPIC-02-P-01 — Relationship Design

**Type:** Plan

`packages/db/SCHEMA_PLAN.md`:

- `OrgProfile` 1→N `Asset`, `LogSource`, `Case`, `DetectionRule`, `Playbook`.
- `Asset` 1→N `Exposure`, 1→N `Alert`.
- `AssetGroup` N↔N `Asset` via join.
- `LogSource` 1→N `Alert` and 1→N `DetectionRun`.
- `DetectionRule` 1→N `DetectionRun`, optionally associated with `Playbook`.
- `Alert` N→1 `Asset`, N→1 `LogSource`, N→N `ThreatIntelIndicator`, N→1 `Case`.
- `Case` 1→N `CaseEvent`, `Task`, `Evidence`, `PlaybookRun`, `TimelineEvent`.
- `Playbook` 1→N `PlaybookStep`; 1→N `PlaybookRun`.
- `PlaybookRun` 1→N `PlaybookStepRun`.
- `Vulnerability` 1→N `Exposure`.
- `RiskRegisterItem` links to `Asset`, `Exposure`, or `Case`.
- `ThreatIntelIndicator` N→N `Alert`, N→N `Asset`.
- `Campaign` 1→N `Case`, 1→N `DetectionRun`.
- `DFIRArtifact` 1→N `TimelineEvent`; optionally links to `Case`.
- `AuditEvent` references actor (`User`), target entity, and metadata.

---

### EPIC-02-E-01 — Implement Prisma Schema

**Type:** Execute

Implement models with appropriate enums for severity, status, and types. Follow Secure Dev OS schema style for timestamps and soft deletes.[1]

---

### EPIC-02-E-02 — Seed Defaults

**Type:** Execute

- Seed one `OrgProfile` and `OrgSetting` with flags like `wazuh_enabled`, `suricata_enabled`, `misp_enabled`, `n8n_enabled`.
- Seed a few `Asset` and `LogSource` entries for a demo environment.

---

### EPIC-02-V-01 — Validate Schema

**Type:** Validate

- `pnpm prisma validate` succeeds.
- Prisma Studio shows key relationships (Alert → Asset → Case).
- Test data for one `Case` with linked `Alert`, `Task`, `Evidence` persists.

***

## EPIC-03: Auth, Org Profile, and Security Roles

**Goal:** Role-based access control for security teams with feature flags for modules.

### EPIC-03-A-01 — Define Roles and Org Fields

**Type:** Assess

`apps/web/AUTHSPEC.md`:

- Roles: `sec_lead`, `analyst`, `threat_hunter`, `dfir`, `red_team`, `viewer`.
- OrgProfile fields: `industry`, `regulatoryDrivers`, `cloudProvider`, `teamSize`.
- OrgSetting toggles: `soar_enabled`, `dfir_enabled`, `intel_enabled`, `redteam_enabled`.

---

### EPIC-03-E-01 — Configure NextAuth

**Type:** Execute

- Add `next-auth` v5 and Prisma adapter.
- Implement `/api/auth/[...nextauth]/route.ts`.
- Map users to roles in `User` or `OrgSetting`.

---

### EPIC-03-E-02 — Org Profile Wizard

**Type:** Execute

- `/app/onboarding` wizard to collect org context and turn modules on/off.

---

### EPIC-03-E-03 — Role-Based Route Protection

**Type:** Execute

- Middleware that restricts DFIR, Intel, Red Team sections to appropriate roles.

---

### EPIC-03-V-01 — Validate Auth & Roles

**Type:** Validate

- Admin (sec_lead) can access all modules.
- Viewer can see dashboards and cases, not detections or playbooks.

***

## EPIC-04: SOC Shell UI and Navigation

**Goal:** Layout and navigation tuned for SOC operations.

### EPIC-04-A-01 — Define Navigation Sections

**Type:** Assess

`apps/web/NAVSPEC.md`:

- Dashboard
- Assets
- Alerts
- Detections
- Cases
- Playbooks
- Vulns & Exposures
- Threat Intel
- DFIR
- Automation
- MCP
- Settings

---

### EPIC-04-E-01 — Shell Layout

**Type:** Execute

- Implement `src/app/app/layout.tsx` with sidebar, header, and environment badge.
- Global **"Suspend Automations"** toggle for SOAR actions.

---

### EPIC-04-E-02 — Stub Route Pages

**Type:** Execute

- Create stub pages for each nav item with basic headings and placeholders.

---

### EPIC-04-V-01 — Validate Navigation

**Type:** Validate

- All links work without 404.
- Sidebar collapses on mobile.
- Role-based visibility respects AUTHSPEC.

***

## EPIC-05: Telemetry Ingestion and Normalization

**Goal:** Ingest alerts/logs from Wazuh, Suricata, cloud providers, and normalize into `Alert`.

### EPIC-05-A-01 — Catalogue Sources

**Type:** Assess

`packages/ingest/INGEST-SOURCES.md`:

- Wazuh manager API.
- Suricata JSON logs.
- CloudTrail, Azure Activity Logs, GCP Audit Logs.
- Syslog and Windows Event logs.

---

### EPIC-05-P-01 — Normalized Alert Schema

**Type:** Plan

Define canonical alert fields: `source`, `sourceEventId`, `time`, `severity`, `category`, `tactic`, `technique`, `assetId`, `description`, `raw`, `tags`.

---

### EPIC-05-E-01 — Build Adapters

**Type:** Execute

- `packages/ingest/src/wazuh.ts` for Wazuh alerts.
- `packages/ingest/src/suricata.ts` for Suricata.
- Cloud provider adapter stubs.

---

### EPIC-05-E-02 — Normalization Pipeline

**Type:** Execute

- Map raw events to `Alert` by schema.
- Deduplicate and correlate via `correlationId`.

---

### EPIC-05-E-03 — Ingestion Jobs

**Type:** Execute

- Cron-like jobs or n8n flows to poll APIs and push to CyberSec OS.

---

### EPIC-05-V-01 — Validate Ingestion

**Type:** Validate

- Ingest sample Wazuh and Suricata events.
- Confirm normalized alerts appear in `/app/alerts` with mapped severity and assets.

***

## EPIC-06: Detection Rules and Analytics

**Goal:** Detection rule registry and test harness.

### EPIC-06-A-01 — Detection Rule Taxonomy

**Type:** Assess

`packages/detections/DETECTIONS-SPEC.md`:

- Rule types: threshold, correlation, heuristic, scheduled search.
- Mapping to Sigma or internal YAML format.

---

### EPIC-06-P-01 — Rule Model and Versioning

**Type:** Plan

- Define `DetectionRule` fields: name, description, query, severity, status, version, tags, references.
- Define status lifecycle: `draft`, `testing`, `active`, `disabled`.

---

### EPIC-06-E-01 — Rule CRUD & Registry UI

**Type:** Execute

- API routes and UI for viewing, editing, and promoting rules.

---

### EPIC-06-E-02 — Rule Test Harness

**Type:** Execute

- Use test datasets in OpenSearch/Wazuh.
- Run queries and assert expected matches.

---

### EPIC-06-V-01 — Validate Detection Pipeline

**Type:** Validate

- New rule passes basic tests before `active`.
- Noise evaluation uses sample event sets.

***

## EPIC-07: Case Management and Investigations

**Goal:** Investigations hub analogous to a built-in case system.

### EPIC-07-A-01 — Case Lifecycle

**Type:** Assess

`packages/cases/CASES-SPEC.md` defining stages: `new`, `triage`, `investigating`, `contained`, `resolved`, `accepted_risk`.

---

### EPIC-07-E-01 — Case CRUD and Alert Linking

**Type:** Execute

- API and UI to create cases from alerts or manually.
- Link multiple alerts to a single case.

---

### EPIC-07-E-02 — Tasks and Evidence

**Type:** Execute

- Task list per case.
- Evidence attachments referencing DFIR artifacts or raw logs.

---

### EPIC-07-V-01 — Validate Cases

**Type:** Validate

- Case view shows timeline of CaseEvents.
- Actions logged in `AuditEvent`.

***

## EPIC-08: Response Playbooks and SOAR Engine

**Goal:** Playbook engine for semi-automated response.

### EPIC-08-A-01 — Playbook Step Types

**Type:** Assess

`packages/playbooks/PLAYBOOK-SPEC.md`:

- `manual_step`, `approval_step`, `automation_step`.
- Supported actions: block IP, disable account, quarantine host, create ticket, send notification.

---

### EPIC-08-E-01 — Playbook Model and Editor

**Type:** Execute

- Graph-based editor for steps.
- Store as ordered DAG.

---

### EPIC-08-E-02 — Runtime Engine

**Type:** Execute

- Execute steps sequentially/as DAG.
- Persist `PlaybookRun` and `PlaybookStepRun` with outcomes.

---

### EPIC-08-E-03 — n8n Integration

**Type:** Execute

- Use n8n for external actions with webhooks back into CyberSec OS.

---

### EPIC-08-V-01 — Validate Playbooks

**Type:** Validate

- Run phishing playbook on sample alert.
- Ensure manual approvals are required for high-risk actions.

***

## EPIC-09: Vulnerability and Exposure Management

**Goal:** Centralize vulnerability feeds and exposures.

### EPIC-09-A-01 — Scanner Sources

**Type:** Assess

`packages/ingest/VULN-SOURCES.md`: OpenVAS, Trivy, CloudQuery, SCA tools.[1]

---

### EPIC-09-P-01 — Mapping to Vulnerability/Exposure

**Type:** Plan

- Define mapping from scanner JSON/XML to `Vulnerability` and `Exposure`.

---

### EPIC-09-E-01 — Importers

**Type:** Execute

- Parser scripts for each tool.
- Jobs to import reports regularly.

---

### EPIC-09-E-02 — Exposure Views

**Type:** Execute

- UI grouped by asset, owner, environment, severity.

---

### EPIC-09-V-01 — Validate Vuln Workflow

**Type:** Validate

- Sample reports import.
- Exposures link correctly to assets and can be tracked to closure.

***

## EPIC-10: Threat Intel and IOC Management

**Goal:** Integrate threat intel and correlate IOCs.

### EPIC-10-A-01 — Intel Sources

**Type:** Assess

`packages/threat-intel/INTEL-SPEC.md`: MISP, open feeds, internal intel.

---

### EPIC-10-E-01 — MISP Connector

**Type:** Execute

- Fetch events and normalize indicators.

---

### EPIC-10-E-02 — IOC Correlation

**Type:** Execute

- Correlate indicators with alerts and assets.

---

### EPIC-10-V-01 — Validate Intel Correlation

**Type:** Validate

- Sample MISP event results in alerts and assets flagged with intel context.

***

## EPIC-11: DFIR Toolkit and Timelines

**Goal:** Support DFIR workflows.

### EPIC-11-A-01 — DFIR Requirements

**Type:** Assess

`packages/dfir/DFIR-SPEC.md`: artifact types, timeline fields.

---

### EPIC-11-E-01 — Artifact Registry

**Type:** Execute

- Register disk images, memory captures, pcaps with metadata.

---

### EPIC-11-E-02 — Timeline Import and Viewer

**Type:** Execute

- Import Plaso/Timesketch exports.
- Timeline viewer per case.

---

### EPIC-11-E-03 — AI Timeline Summaries

**Type:** Execute

- Summarize time ranges using AI with clear provenance.

---

### EPIC-11-V-01 — Validate DFIR Flows

**Type:** Validate

- Timeline for a sample incident imports and displays correctly.

***

## EPIC-12: Agentic Cyber Copilot (SOC & SecEng)

**Goal:** Agent-native workflows for triage, investigation, and content drafting.

### EPIC-12-A-01 — Agent Roles

**Type:** Assess

`packages/mcp-server/AGENT-ROLES.md`: `TriageAgent`, `HunterAgent`, `ResponderAgent`, `DetectionEngineerAgent`.

---

### EPIC-12-P-01 — LangGraph State Machine

**Type:** Plan

- States: `collect_context`, `enrich_alert`, `query_logs`, `correlate_intel`, `generate_hypotheses`, `propose_actions`, `update_case`, `halt`.

---

### EPIC-12-E-01 — Implement Graph

**Type:** Execute

- Implement nodes and state transitions in an `agents` package or `mcp-client` using LangGraph.

---

### EPIC-12-E-02 — Memory Integration

**Type:** Execute

- Qdrant for past cases, detection changes, and lessons learned.

---

### EPIC-12-V-01 — Validate Agent Runs

**Type:** Validate

- Simulated alert run produces investigation notes and suggested actions without executing them automatically.

***

## EPIC-13: MCP Server for Cyber Tools

**Goal:** Expose cyber tools via MCP.

### EPIC-13-A-01 — Tool and Resource Inventory

**Type:** Assess

`packages/mcp-server/TOOLS-SPEC.md`:

- Resources: `cyber://alerts`, `cyber://cases`, `cyber://detections`, `cyber://playbooks`, `cyber://intel`, `cyber://timeline`.
- Tools: `list_alerts`, `get_alert`, `create_case`, `update_case`, `run_playbook`, `test_detection`, `ingest_ioc`, `search_timeline`.

---

### EPIC-13-E-01 — Implement MCP Server

**Type:** Execute

- Use `@modelcontextprotocol/sdk` for tools and resources, with adapters into Prisma and external systems.

---

### EPIC-13-V-01 — Validate MCP

**Type:** Validate

- MCP Inspector shows tools.
- `create_case` and `run_playbook` work end-to-end on sample data.

***

## EPIC-14: Automation and SOAR (n8n)

**Goal:** Glue and automation flows.

### EPIC-14-E-01 — n8n Co-Process

**Type:** Execute

- Deploy n8n in `infra/n8n`.
- Flows: daily summaries, new IOC notifications, ticket creation, scheduled intel pulls.

---

### EPIC-14-E-02 — Webhook Integration

**Type:** Execute

- Webhooks in CyberSec OS to accept events from n8n (e.g. `/api/automation/events`).

---

### EPIC-14-V-01 — Validate Automations

**Type:** Validate

- Inject test alert and IOC events and confirm flows run and update CyberSec OS state.

***

## EPIC-15: Metrics, Audit, and Compliance Views

**Goal:** Observability and audit trails.

### EPIC-15-E-01 — Prometheus & Grafana

**Type:** Execute

- Metrics: alert volume, MTTR, MTTD, rule noise %, exposure backlog, playbook usage.

---

### EPIC-15-E-02 — AuditEvent Logging

**Type:** Execute

- Log all important actions (case changes, playbook runs, rule promotions).

---

### EPIC-15-V-01 — Validate Metrics and Audit

**Type:** Validate

- Dashboards show synthetic data.
- Example case has a full audit trail visible.

***

## EPIC-16: Red Team and Purple Team Support (Optional)

**Goal:** Support offensive simulations and exercises.

### EPIC-16-A-01 — Red Team Requirements

**Type:** Assess

`packages/detections/REDTEAM-SPEC.md`: scenarios, TTPs, ATT&CK mapping.

---

### EPIC-16-E-01 — Campaign Model and UI

**Type:** Execute

- Model red-team campaigns linked to detection performance and cases.

---

### EPIC-16-E-02 — MCP Integration for Simulations

**Type:** Execute

- Tools to register simulated attacks and expected detections and to tag alerts as part of exercises.

---

### EPIC-16-V-01 — Validate Purple-Team Loop

**Type:** Validate

- Run a simulated campaign, confirm detections and coverage gaps tracked and surfaced as detection improvements.

***

## EPIC-17: CLI MCP Client (cybersec-cli)

**Goal:** Command-line interface mirroring MCP functions.

### EPIC-17-E-01 — Build CLI

**Type:** Execute

- Commands: `cybersec alerts list`, `cybersec cases create`, `cybersec detections test`, `cybersec playbooks run`, `cybersec intel ingest`.

---

### EPIC-17-V-01 — Validate CLI

**Type:** Validate

- CLI commands operate correctly against local MCP server and update database.

***

## EPIC-18: Containerization and Co-Process Layout

**Goal:** Dockerized environment for all co-processes.

### EPIC-18-E-01 — Docker Compose Stack

**Type:** Execute

- Services: web, postgres, opensearch, wazuh, qdrant (if used for memory), n8n, prometheus, grafana, mcp-server, misp (optional).

---

### EPIC-18-V-01 — Validate Stack

**Type:** Validate

- `docker compose up` starts all services.
- Web UI, SIEM, and metrics accessible in local environment.

***

## EPIC-19: Runbooks and Knowledge Base

**Goal:** Documented runbooks and KB powered by AI.

### EPIC-19-E-01 — Runbook Content Model

**Type:** Execute

- Store runbooks as structured markdown with tagging by tactic/technique, asset type, and severity.

---

### EPIC-19-E-02 — AI-Assisted KB Search

**Type:** Execute

- Link KB search to cases and agentic assistant; retrieval augmented from runbooks and past cases.

---

### EPIC-19-V-01 — Validate KB

**Type:** Validate

- Search returns relevant runbooks for sample scenarios, and agent can cite the right runbook section.

***

## EPIC-20: Requirement-to-Plan Generator for Security Programs

**Goal:** Generator that produces plans like this from org security requirements.

### EPIC-20-E-01 — Plan Template

**Type:** Execute

- Markdown template with EPICs for SOC, DFIR, intel, and red teams, following APEV structure.

---

### EPIC-20-E-02 — MCP Tool `generate_cybersec_plan`

**Type:** Execute

- Inputs: org size, tooling preferences, maturity, compliance goals.
- Output: full APEV plan as an `ImplementationPlan` record.

---

### EPIC-20-V-01 — Validate Plan Generation

**Type:** Validate

- Generated plans include at least 10 EPICs and follow naming/formatting conventions from existing OS plans.[1]