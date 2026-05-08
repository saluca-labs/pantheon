# Business OS — Full Execution Plan (Assess → Plan → Execute → Validate)

## How to Use This Document

Every ticket follows **EPIC-XX-[A|P|E|V]-NN** where A = Assess, P = Plan, E = Execute, V = Validate, identical in structure to Creator OS and Maker OS.[^1]
Epics are independent enough to be parallelized after EPIC-01 and EPIC-02 complete.
Every Execute ticket includes exact file paths, package names, and commands. Every Validate ticket includes concrete pass/fail criteria an automated agent can evaluate without ambiguity.

### Design Philosophy

Business OS is built around a single principle: **start solo, scale to enterprise without re-architecting**.
At launch, every module functions for a one-person shop — zero employees, one person, one bank account, one client list.
As the user adds information about their organization (team size, industry, billing model, geographic scope) through the **Organization Profile**, the system unlocks and adapts relevant module behaviors.
Plugins and MCP tools are the scale mechanism: the core schema is fixed, but behavior extends through MCP tool registration and module feature flags stored in `OrgSetting`.

***

## Frozen Tech Stack (All Tickets Assume This)

Identical to Creator OS and Maker OS — all three OSes share the same monorepo root conventions.[^1]

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

### Co-Process Services

Each co-process is a separate container or subprocess wired via nginx and supervisord, not a library dependency — identical integration pattern to Flowise, Activepieces, and Owncast in Creator OS.[^1]

| Function | Default Tool | License | Notes |
|---|---|---|---|
| CRM | Twenty v2.0 | AGPL 3.0 | Modern, Notion-like UI; API + webhooks; extensible via SDK[^2][^3] |
| Invoicing & billing | Invoice Ninja v5 | AAL | Fully self-hosted; invoices, quotes, expenses, recurring billing, payment gateways[^4][^5] |
| Time tracking | Solidtime | AGPL 3.0 | Modern open-source tracker for freelancers and agencies; project/client/task hierarchy[^6] |
| E-signature | DocuSeal | AGPL 3.0 | Open-source DocuSign alternative; template builder, multi-signer, REST API[^7][^8] |
| Project management | Plane | AGPL 3.0 | 48k GitHub stars; issues, cycles, modules, Kanban, Gantt[^9][^10] |
| Email marketing | Listmonk | AGPL 3.0 | Solopreneur-friendly newsletter/list manager; simple, fast[^11][^12] |
| Marketing automation | Mautic | GPL 3.0 | Full marketing automation suite for when Listmonk is not enough[^12] |
| No-code database | Baserow | MIT | Open-source Airtable alternative; drag-and-drop, APIs, automation, self-hosted[^13][^14] |
| HR & Payroll | Frappe HR / OrangeHRM Starter | GPL 3.0 / GPL | Scales from solo (no-op) to full team HR and payroll[^15][^16] |
| Automation | n8n | Fair-code | Workflow automation: triggers, webhooks, API connectors[^12] |

***

## EPIC-01: Project Scaffold & Monorepo

**Goal:** Produce a Turborepo monorepo at `~/business-os/` with a working Next.js app shell, shared packages, and CI-ready config, following Creator OS conventions exactly.[^1]

***

### EPIC-01-A-01 — Assess Existing Environment

**Type:** Assess

**Commands to run:**
```bash
node --version      # must be >= 20.0.0
pnpm --version      # must be >= 9.0.0
docker --version    # must be >= 25.0.0
git --version       # any recent version
```

**Outputs / Acceptance Criteria:**
- All four commands return version strings without error.
- If `pnpm` is missing: `npm install -g pnpm`.
- If Node < 20: `nvm install 20 && nvm use 20`.
- Document result in `SETUP_LOG.md` at repo root.

***

### EPIC-01-A-02 — Assess Monorepo Structure Requirements

**Type:** Assess

**Outputs:** `ARCHITECTURE.md`:

```text
business-os/
├── apps/
│   └── web/                     # Next.js 14 main app
├── packages/
│   ├── ui/                      # shared shadcn components
│   ├── db/                      # Prisma schema + client
│   ├── mcp-server/              # MCP server package
│   ├── mcp-client/              # MCP client + CLI
│   └── integrations/            # typed API clients for co-processes
├── infra/
│   ├── nginx/                   # nginx.conf
│   ├── supervisord/             # supervisord.conf
│   └── docker/                  # Dockerfile + compose
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

***

### EPIC-01-P-01 — Plan Turborepo Pipeline Config

**Type:** Plan

**Outputs:** Draft `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "dev":   { "cache": false, "persistent": true },
    "lint":  { "outputs": [] },
    "test":  { "outputs": [] },
    "db:generate": { "cache": false }
  }
}
```

***

### EPIC-01-E-01 — Scaffold Turborepo Root

**Type:** Execute

**Commands:**
```bash
mkdir business-os && cd business-os
git init
pnpm init
pnpm add -D turbo typescript @types/node
```

**Files to create:**
- `pnpm-workspace.yaml`:
  ```yaml
  packages:
    - 'apps/*'
    - 'packages/*'
  ```
- `turbo.json`: use content from EPIC-01-P-01.
- `.gitignore`: include `node_modules`, `.next`, `.turbo`, `dist`, `*.db`.
- `tsconfig.base.json` (identical to Creator OS).[^1]

***

### EPIC-01-E-02 — Scaffold Next.js App

**Type:** Execute

```bash
cd apps
pnpm create next-app@14 web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"
```

Post-scaffold: set `"name": "@business-os/web"` in `apps/web/package.json`.

***

### EPIC-01-E-03 — Install and Init shadcn/ui

**Type:** Execute

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input label textarea
pnpm dlx shadcn@latest add dropdown-menu navigation-menu sheet tabs
pnpm dlx shadcn@latest add toast sonner badge avatar separator
pnpm dlx shadcn@latest add table progress command popover
```

***

### EPIC-01-E-04 — Scaffold Shared Packages

**Type:** Execute

```bash
mkdir -p packages/ui packages/db packages/mcp-server packages/mcp-client packages/integrations
```

```json
// packages/integrations/package.json
{ "name": "@business-os/integrations", "version": "0.0.1", "main": "./src/index.ts" }
```

All other `package.json` files follow the Creator OS pattern with `@business-os/` prefix.[^1]

***

### EPIC-01-V-01 — Validate Monorepo Boots

**Type:** Validate

```bash
cd business-os
pnpm install
pnpm turbo run build
pnpm turbo run dev   # http://localhost:3000 starts without errors
```

***

## EPIC-02: Database Schema (Prisma + SQLite)

**Goal:** A fully migrated Prisma schema covering all business entities, designed so that all modules work for a solo operator and extend naturally as the organization grows.

***

### EPIC-02-A-01 — Audit All Data Entities

**Type:** Assess

**Outputs:** `packages/db/ENTITIES.md`:

```text
User, Session, Account (NextAuth)
OrgProfile (organization identity, business model, industry flags)
OrgSetting (key-value feature flags and app config — drives module behavior)
Contact (person in a company or individual client)
Company (organization a Contact belongs to; optional)
Deal (sales opportunity linked to Contact/Company)
DealStage (configurable pipeline stages per organization)
Invoice (billing document)
InvoiceLineItem
Quote (pre-invoice estimate / proposal)
QuoteLineItem
Expense (cost tracked against a project or period)
RecurringBilling (schedule for automatic invoice generation)
PaymentRecord (payment received against an Invoice)
Project (work unit that can be billable or internal)
Task (item inside a Project)
TaskLabel
TimeEntry (time logged against a Task or Project)
Contract (document requiring signature, links to DocuSeal)
ContractTemplate
Document (generic file — PDF, DOCX, etc.)
EmailList (for Listmonk integration)
EmailCampaign
Lead (early-stage contact before becoming a full Contact)
LeadSource
TeamMember (employee or contractor — optional for solo mode)
Role (permission role for a TeamMember)
Department
Payroll (payroll run — only relevant when team exists)
PayrollEntry (per-member line within a payroll run)
Vendor (supplier or service provider)
PurchaseOrder
POLineItem
Note (internal notes — like Creator OS; linked to Contact/Deal/Project)
AIConversation
AIMessage
MCPServerConfig
AutomationTrigger
AutomationLog
ActivityLog (audit trail: who did what, when, on what entity)
```

***

### EPIC-02-P-01 — Design Schema Relationships

**Type:** Plan

**Outputs:** `packages/db/SCHEMA_PLAN.md`:

- `OrgProfile` is a singleton (one row per deployment); all behavior adapts based on fields like `businessModel`, `industry`, `hasTeam`, `billingCurrency`.
- `User` 1→N `Project`, `Invoice`, `Quote`, `Deal`, `TimeEntry`, `AIConversation`, `Note`.
- `Contact` N→1 `Company` (optional); 1→N `Deal`, `Invoice`, `Quote`, `Contract`, `Note`.
- `Deal` N→1 `DealStage`; 1→N `TimeEntry`, `Task` (via `Project`).
- `Invoice` 1→N `InvoiceLineItem`, 1→N `PaymentRecord`.
- `Quote` 1→N `QuoteLineItem`; `Quote` converts to `Invoice` (tracked via `quoteId` FK on `Invoice`).
- `Project` 1→N `Task`, 1→N `TimeEntry`, 1→N `Document`; optionally linked to `Deal` or `Contract`.
- `Task` N→N `TaskLabel`; N→1 `TeamMember` (assignee, nullable for solo).
- `Contract` links to `DocuSeal` external signing via `externalSigningId` string.
- `TeamMember` N→1 `Role`, N→1 `Department`; 1→N `TimeEntry`, `Task`, `PayrollEntry`.
- `Payroll` 1→N `PayrollEntry` (one per `TeamMember`).
- `ActivityLog` is append-only: `entityType`, `entityId`, `action`, `actorId`, `before` (JSON), `after` (JSON).
- All models have `id String @id @default(cuid())`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.

***

### EPIC-02-E-01 — Install Prisma and Write Schema

**Type:** Execute

```bash
# From packages/db:
pnpm add prisma @prisma/client
pnpm prisma init --datasource-provider sqlite
```

**File: `packages/db/prisma/schema.prisma`** — core models:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
  output   = "../generated/client"
}

// ─── Organization Identity ──────────────────────────────────
model OrgProfile {
  id              String   @id @default(cuid())
  name            String   @default("My Business")
  legalName       String?
  industry        String?  // freelance | agency | saas | product | retail | consulting | other
  businessModel   String?  // b2b | b2c | b2b2c | marketplace
  country         String   @default("US")
  billingCurrency String   @default("USD")
  hasTeam         Boolean  @default(false)
  logoUrl         String?
  website         String?
  taxId           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model OrgSetting {
  id    String @id @default(cuid())
  key   String @unique   // e.g. "crm_enabled", "invoice_prefix", "default_tax_rate"
  value String
}

// ─── CRM ────────────────────────────────────────────────────
model Company {
  id       String    @id @default(cuid())
  name     String
  domain   String?
  industry String?
  size     String?
  contacts Contact[]
  deals    Deal[]
  notes    Note[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Contact {
  id         String    @id @default(cuid())
  firstName  String
  lastName   String?
  email      String?   @unique
  phone      String?
  title      String?
  companyId  String?
  company    Company?  @relation(fields: [companyId], references: [id])
  deals      Deal[]
  invoices   Invoice[]
  quotes     Quote[]
  contracts  Contract[]
  notes      Note[]
  leads      Lead[]
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}

model DealStage {
  id       String @id @default(cuid())
  name     String
  order    Int    @default(0)
  color    String @default("#6366f1")
  deals    Deal[]
}

model Deal {
  id          String     @id @default(cuid())
  title       String
  value       Float?
  currency    String     @default("USD")
  status      String     @default("open") // open | won | lost
  closeDate   DateTime?
  stageId     String
  stage       DealStage  @relation(fields: [stageId], references: [id])
  contactId   String?
  contact     Contact?   @relation(fields: [contactId], references: [id])
  companyId   String?
  company     Company?   @relation(fields: [companyId], references: [id])
  projectId   String?
  project     Project?   @relation(fields: [projectId], references: [id])
  notes       Note[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model Lead {
  id        String   @id @default(cuid())
  name      String
  email     String?
  source    String?
  status    String   @default("new") // new | contacted | qualified | disqualified
  contactId String?
  contact   Contact? @relation(fields: [contactId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── Finance ─────────────────────────────────────────────────
model Invoice {
  id            String          @id @default(cuid())
  number        String          @unique
  status        String          @default("draft") // draft | sent | paid | overdue | void
  issueDate     DateTime        @default(now())
  dueDate       DateTime?
  currency      String          @default("USD")
  taxRate       Float           @default(0)
  notes         String?
  externalId    String?         // id from Invoice Ninja
  contactId     String?
  contact       Contact?        @relation(fields: [contactId], references: [id])
  quoteId       String?         // if converted from quote
  projectId     String?
  project       Project?        @relation(fields: [projectId], references: [id])
  lineItems     InvoiceLineItem[]
  payments      PaymentRecord[]
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
}

model InvoiceLineItem {
  id          String  @id @default(cuid())
  description String
  quantity    Float   @default(1)
  unitPrice   Float
  taxable     Boolean @default(true)
  invoiceId   String
  invoice     Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
}

model Quote {
  id          String          @id @default(cuid())
  number      String          @unique
  status      String          @default("draft") // draft | sent | accepted | declined | expired
  issueDate   DateTime        @default(now())
  expiryDate  DateTime?
  currency    String          @default("USD")
  notes       String?
  externalId  String?
  contactId   String?
  contact     Contact?        @relation(fields: [contactId], references: [id])
  projectId   String?
  project     Project?        @relation(fields: [projectId], references: [id])
  lineItems   QuoteLineItem[]
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
}

model QuoteLineItem {
  id          String @id @default(cuid())
  description String
  quantity    Float  @default(1)
  unitPrice   Float
  quoteId     String
  quote       Quote  @relation(fields: [quoteId], references: [id], onDelete: Cascade)
}

model Expense {
  id          String   @id @default(cuid())
  description String
  amount      Float
  currency    String   @default("USD")
  date        DateTime @default(now())
  category    String?
  vendor      String?
  projectId   String?
  project     Project? @relation(fields: [projectId], references: [id])
  receiptUrl  String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model RecurringBilling {
  id          String   @id @default(cuid())
  description String
  amount      Float
  currency    String   @default("USD")
  frequency   String   // monthly | quarterly | yearly | custom
  nextDate    DateTime
  contactId   String?
  projectId   String?
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model PaymentRecord {
  id        String  @id @default(cuid())
  amount    Float
  currency  String  @default("USD")
  paidAt    DateTime
  method    String? // stripe | paypal | bank | cash | other
  reference String?
  invoiceId String
  invoice   Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
}

// ─── Projects & Tasks ────────────────────────────────────────
model Project {
  id            String       @id @default(cuid())
  name          String
  description   String?
  status        String       @default("active") // active | paused | completed | archived
  billable      Boolean      @default(true)
  budgetHours   Float?
  budgetAmount  Float?
  currency      String       @default("USD")
  startDate     DateTime?
  dueDate       DateTime?
  externalId    String?      // Plane project ID
  contactId     String?
  deals         Deal[]
  tasks         Task[]
  timeEntries   TimeEntry[]
  invoices      Invoice[]
  quotes        Quote[]
  expenses      Expense[]
  documents     Document[]
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
}

model Task {
  id          String       @id @default(cuid())
  title       String
  description String?
  status      String       @default("todo") // todo | in_progress | done | cancelled
  priority    String       @default("medium") // low | medium | high | urgent
  dueDate     DateTime?
  externalId  String?      // Plane issue ID
  projectId   String
  project     Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  assigneeId  String?
  assignee    TeamMember?  @relation(fields: [assigneeId], references: [id])
  labels      TaskLabel[]
  timeEntries TimeEntry[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

model TaskLabel {
  id    String @id @default(cuid())
  name  String @unique
  color String @default("#6366f1")
  tasks Task[]
}

model TimeEntry {
  id          String    @id @default(cuid())
  startTime   DateTime
  endTime     DateTime?
  duration    Int?      // seconds; computed when endTime is set
  description String?
  billable    Boolean   @default(true)
  projectId   String?
  project     Project?  @relation(fields: [projectId], references: [id])
  taskId      String?
  task        Task?     @relation(fields: [taskId], references: [id])
  memberId    String?
  member      TeamMember? @relation(fields: [memberId], references: [id])
  externalId  String?   // Solidtime entry ID
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

// ─── Documents & Contracts ───────────────────────────────────
model Contract {
  id               String    @id @default(cuid())
  title            String
  status           String    @default("draft") // draft | sent | signed | expired | voided
  externalSigningId String?  // DocuSeal submission ID
  signingUrl       String?
  signedUrl        String?
  templateId       String?
  contactId        String?
  contact          Contact?  @relation(fields: [contactId], references: [id])
  projectId        String?
  project          Project?  @relation(fields: [projectId], references: [id])
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

model ContractTemplate {
  id        String   @id @default(cuid())
  name      String
  externalId String? // DocuSeal template ID
  category  String?  // nda | sow | employment | msa | freelance
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Document {
  id        String   @id @default(cuid())
  name      String
  kind      String   // pdf | docx | image | other
  url       String
  projectId String?
  project   Project? @relation(fields: [projectId], references: [id])
  createdAt DateTime @default(now())
}

// ─── Email & Marketing ───────────────────────────────────────
model EmailList {
  id         String          @id @default(cuid())
  name       String
  externalId String?         // Listmonk list ID
  campaigns  EmailCampaign[]
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt
}

model EmailCampaign {
  id         String    @id @default(cuid())
  subject    String
  status     String    @default("draft") // draft | scheduled | sent
  sentAt     DateTime?
  externalId String?   // Listmonk campaign ID
  listId     String
  list       EmailList @relation(fields: [listId], references: [id], onDelete: Cascade)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}

// ─── Team & HR (solo-safe: nullable everywhere) ──────────────
model Department {
  id      String       @id @default(cuid())
  name    String       @unique
  members TeamMember[]
}

model Role {
  id          String       @id @default(cuid())
  name        String       @unique
  permissions String       @default("[]") // JSON array
  members     TeamMember[]
}

model TeamMember {
  id           String      @id @default(cuid())
  name         String
  email        String      @unique
  employeeType String      @default("employee") // employee | contractor | owner
  status       String      @default("active")
  startDate    DateTime?
  endDate      DateTime?
  roleId       String?
  role         Role?       @relation(fields: [roleId], references: [id])
  departmentId String?
  department   Department? @relation(fields: [departmentId], references: [id])
  tasks        Task[]
  timeEntries  TimeEntry[]
  payrollEntries PayrollEntry[]
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
}

model Payroll {
  id          String         @id @default(cuid())
  periodStart DateTime
  periodEnd   DateTime
  status      String         @default("draft") // draft | approved | paid
  entries     PayrollEntry[]
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

model PayrollEntry {
  id           String     @id @default(cuid())
  payrollId    String
  payroll      Payroll    @relation(fields: [payrollId], references: [id], onDelete: Cascade)
  memberId     String
  member       TeamMember @relation(fields: [memberId], references: [id])
  grossAmount  Float
  deductions   Float      @default(0)
  netAmount    Float
  currency     String     @default("USD")
}

// ─── Vendors & Purchasing ────────────────────────────────────
model Vendor {
  id             String          @id @default(cuid())
  name           String
  email          String?
  website        String?
  purchaseOrders PurchaseOrder[]
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
}

model PurchaseOrder {
  id        String       @id @default(cuid())
  number    String       @unique
  status    String       @default("draft") // draft | sent | received | cancelled
  total     Float?
  currency  String       @default("USD")
  vendorId  String
  vendor    Vendor       @relation(fields: [vendorId], references: [id])
  lineItems POLineItem[]
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
}

model POLineItem {
  id          String        @id @default(cuid())
  description String
  quantity    Float         @default(1)
  unitPrice   Float
  poId        String
  po          PurchaseOrder @relation(fields: [poId], references: [id], onDelete: Cascade)
}

// ─── Notes & AI ──────────────────────────────────────────────
model Note {
  id        String    @id @default(cuid())
  content   String    @default("")
  entityType String?  // contact | company | deal | project
  entityId  String?
  contactId  String?
  contact   Contact?  @relation(fields: [contactId], references: [id])
  companyId  String?
  company   Company?  @relation(fields: [companyId], references: [id])
  dealId    String?
  deal      Deal?     @relation(fields: [dealId], references: [id])
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model AIConversation {
  id        String      @id @default(cuid())
  title     String      @default("New Conversation")
  model     String      @default("gpt-4o")
  messages  AIMessage[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
}

model AIMessage {
  id             String         @id @default(cuid())
  role           String
  content        String
  toolCallId     String?
  conversationId String
  conversation   AIConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  createdAt      DateTime       @default(now())
}

// ─── Activity Log ─────────────────────────────────────────────
model ActivityLog {
  id         String   @id @default(cuid())
  entityType String
  entityId   String
  action     String   // created | updated | deleted | status_changed
  actorId    String?
  before     String?  // JSON snapshot
  after      String?  // JSON snapshot
  createdAt  DateTime @default(now())
}

// ─── Automation & MCP ────────────────────────────────────────
model MCPServerConfig {
  id        String   @id @default(cuid())
  name      String   @unique
  url       String
  transport String   @default("stdio")
  command   String?
  args      String?
  env       String?
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model AutomationTrigger {
  id        String           @id @default(cuid())
  name      String
  type      String           // webhook | schedule | event
  config    String
  enabled   Boolean          @default(true)
  logs      AutomationLog[]
  createdAt DateTime         @default(now())
}

model AutomationLog {
  id        String            @id @default(cuid())
  status    String
  input     String?
  output    String?
  error     String?
  triggerId String
  trigger   AutomationTrigger @relation(fields: [triggerId], references: [id])
  createdAt DateTime          @default(now())
}
```

***

### EPIC-02-E-02 — Prisma Client Export

**Type:** Execute

`packages/db/index.ts` — identical pattern to Creator OS.[^1]

Set `DATABASE_URL="file:../../data/business-os.db"` in `apps/web/.env.local`.

***

### EPIC-02-E-03 — Run Initial Migration

**Type:** Execute

```bash
pnpm prisma generate
pnpm prisma migrate dev --name init
```

***

### EPIC-02-E-04 — Seed Organization Profile

**Type:** Execute

**File: `packages/db/seed.ts`:**

```ts
import { prisma } from './index'
import bcrypt from 'bcryptjs'

async function main() {
  // Seed admin user
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'changeme', 12)
  await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || 'admin@business-os.local' },
    update: {},
    create: { email: process.env.ADMIN_EMAIL || 'admin@business-os.local', name: 'Admin', hashedPassword: hash }
  })

  // Seed default org profile (singleton)
  const existing = await prisma.orgProfile.findFirst()
  if (!existing) {
    await prisma.orgProfile.create({
      data: { name: 'My Business', businessModel: 'b2b', industry: 'consulting' }
    })
  }

  // Seed default deal stages
  const stages = ['Lead', 'Qualified', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost']
  for (let i = 0; i < stages.length; i++) {
    await prisma.dealStage.upsert({
      where: { id: `stage-${i}` },
      update: {},
      create: { id: `stage-${i}`, name: stages[i], order: i }
    })
  }

  // Seed default OrgSettings (feature flags all on)
  const defaults = [
    ['crm_enabled', 'true'],
    ['invoicing_enabled', 'true'],
    ['projects_enabled', 'true'],
    ['time_tracking_enabled', 'true'],
    ['contracts_enabled', 'true'],
    ['email_marketing_enabled', 'false'],
    ['hr_enabled', 'false'],
    ['purchasing_enabled', 'false'],
    ['invoice_prefix', 'INV-'],
    ['default_tax_rate', '0'],
  ]
  for (const [key, value] of defaults) {
    await prisma.orgSetting.upsert({ where: { key }, update: {}, create: { key, value } })
  }

  console.log('Seed complete')
}

main().catch(console.error).finally(() => prisma.$disconnect())
```

***

### EPIC-02-V-01 — Validate Schema

**Type:** Validate

```bash
pnpm prisma validate
pnpm prisma studio
```

**Pass criteria:**
- All models visible in Prisma Studio.
- Seed completes; `OrgProfile`, `DealStage`, and `OrgSetting` rows present.
- Confirm feature flag `crm_enabled = true` appears in `OrgSetting`.

***

## EPIC-03: Authentication & Multi-User Support

**Goal:** NextAuth v5 with credentials provider (solo mode) plus optional multi-user mode controlled by `OrgSetting` `multi_user_enabled`.[^1]

Steps are identical to Creator OS EPIC-03 (install, auth config, middleware, seed) with names changed to `@business-os/db` and the login page branded for Business OS.[^1]

***

## EPIC-04: Organization Profile & Feature Flags

**Goal:** The central configuration layer — a settings page where the user describes their business, and the app adapts sidebar, modules, and AI context accordingly.

### EPIC-04-A-01 — Define Adaptive Behavior Rules

**Type:** Assess

Write to `apps/web/src/app/(app)/settings/ORG_ADAPTATION_SPEC.md`:

| OrgProfile field | Effect when set |
|---|---|
| `hasTeam = true` | Enables HR module, team member assignment in Tasks, Payroll |
| `businessModel = b2b` | Shows Company CRM view, deal pipeline, B2B-tuned AI prompts |
| `businessModel = b2c` | Hides Company view, shows Lead and Email Campaign modules |
| `industry = saas` | Enables recurring billing, subscription pipeline, MRR dashboard |
| `industry = agency` | Shows project + time tracking as primary, retainer billing |
| `industry = retail` | Enables Purchasing/PO module, vendor management |

Feature flags in `OrgSetting` are the runtime switches; `OrgProfile` fields trigger suggestions for which flags to enable.

### EPIC-04-E-01 — Org Profile API

`apps/web/src/app/api/org/route.ts`:
- `GET` returns single `OrgProfile` row.
- `PATCH` updates any field; after update, re-evaluates and suggests `OrgSetting` changes.

`apps/web/src/app/api/org/settings/route.ts`:
- `GET` returns all `OrgSetting` rows as `Record<string, string>`.
- `PATCH` bulk-updates settings.

### EPIC-04-E-02 — Feature Flag Hook

`apps/web/src/hooks/useFeatureFlags.ts`:

```ts
'use client'
import { useQuery } from '@tanstack/react-query'

export function useFeatureFlags() {
  const { data } = useQuery({
    queryKey: ['org-settings'],
    queryFn: () => fetch('/api/org/settings').then(r => r.json())
  })
  return {
    crm: data?.crm_enabled === 'true',
    invoicing: data?.invoicing_enabled === 'true',
    projects: data?.projects_enabled === 'true',
    timeTracking: data?.time_tracking_enabled === 'true',
    contracts: data?.contracts_enabled === 'true',
    emailMarketing: data?.email_marketing_enabled === 'true',
    hr: data?.hr_enabled === 'true',
    purchasing: data?.purchasing_enabled === 'true',
  }
}
```

### EPIC-04-V-01 — Validate Org Profile

- Update `OrgProfile` to `{ hasTeam: true, industry: "agency" }`.
- Confirm sidebar dynamically shows HR and Projects modules.
- Toggle `hr_enabled = false` → HR disappears from sidebar without page reload.

***

## EPIC-05: Shell UI & Adaptive Sidebar

**Goal:** A persistent sidebar that hides/shows modules based on feature flags, with a fast-access command palette.

### Navigation Structure

```ts
const allNavItems = [
  { label: 'Dashboard',   href: '/dashboard',   icon: 'LayoutDashboard', alwaysOn: true },
  { label: 'CRM',         href: '/crm',          icon: 'Users',          flag: 'crm' },
  { label: 'Pipeline',    href: '/pipeline',     icon: 'TrendingUp',     flag: 'crm' },
  { label: 'Invoices',    href: '/invoices',     icon: 'FileText',       flag: 'invoicing' },
  { label: 'Quotes',      href: '/quotes',       icon: 'ClipboardList',  flag: 'invoicing' },
  { label: 'Expenses',    href: '/expenses',     icon: 'Receipt',        flag: 'invoicing' },
  { label: 'Projects',    href: '/projects',     icon: 'Briefcase',      flag: 'projects' },
  { label: 'Tasks',       href: '/tasks',        icon: 'CheckSquare',    flag: 'projects' },
  { label: 'Time',        href: '/time',         icon: 'Clock',          flag: 'timeTracking' },
  { label: 'Contracts',   href: '/contracts',    icon: 'PenTool',        flag: 'contracts' },
  { label: 'Documents',   href: '/documents',    icon: 'FolderOpen',     flag: 'contracts' },
  { label: 'Marketing',   href: '/marketing',    icon: 'Send',           flag: 'emailMarketing' },
  { label: 'Team',        href: '/team',         icon: 'UserPlus',       flag: 'hr' },
  { label: 'Payroll',     href: '/payroll',      icon: 'DollarSign',     flag: 'hr' },
  { label: 'Purchasing',  href: '/purchasing',   icon: 'ShoppingCart',   flag: 'purchasing' },
  { label: 'AI Assist',   href: '/ai',           icon: 'Bot',            alwaysOn: true },
  { label: 'Automation',  href: '/automate',     icon: 'Zap',            alwaysOn: true },
  { label: 'MCP',         href: '/mcp',          icon: 'Server',         alwaysOn: true },
  { label: 'Settings',    href: '/settings',     icon: 'Settings',       alwaysOn: true },
]
```

Filter at render time using `useFeatureFlags()` — items with `alwaysOn: true` always render; others render only when their flag is `true`.

### EPIC-05-V-01 — Validate Adaptive Sidebar

- Default flags show CRM, Invoicing, Projects, Time, Contracts.
- Enable `hr_enabled = true` → Team and Payroll appear instantly.
- Command palette (⌘K) searches modules, contacts, invoices, and projects.

***

## EPIC-06: Dashboard

**Goal:** A role-adaptive home screen summarizing revenue, pipeline, active projects, outstanding invoices, and time this period — calculated from local DB, no external service required.

### EPIC-06-E-01 — Dashboard API Route

`apps/web/src/app/api/dashboard/route.ts` returns a JSON summary object:

```ts
{
  invoices: { totalOutstanding, overdueCount, paidThisMonth },
  pipeline:  { openDeals, totalValue, wonThisMonth },
  projects:  { activeCount, overdueTaskCount },
  time:      { billedHoursThisWeek, unbilledHoursThisWeek },
  recentActivity: ActivityLog[] // last 20 entries
}
```

All values come from Prisma aggregate queries against local DB — no co-process needed for solo mode.

### EPIC-06-E-02 — Dashboard UI

`apps/web/src/app/(app)/dashboard/page.tsx`:

- KPI cards: Outstanding Revenue, Open Deals Value, Active Projects, Hours This Week.
- Mini pipeline chart (shadcn `Progress` bars per stage).
- Recent Activity feed.
- "Quick Actions" section: New Invoice, New Contact, Log Time, New Task.

### EPIC-06-V-01 — Validate Dashboard

- Create one invoice, one deal, two tasks → dashboard KPIs reflect correct values.
- Recent Activity feed shows creation events.

***

## EPIC-07: CRM Module

**Goal:** A lightweight CRM for contacts, companies, deals, and pipeline — with optional sync to Twenty CRM co-process for power users.[^2][^3]

### EPIC-07-E-01 — Contacts & Companies API

Routes in `apps/web/src/app/api/crm/`:
- `contacts/route.ts` — `GET` (list, filterable), `POST`.
- `contacts/[id]/route.ts` — `GET`, `PATCH`, `DELETE`.
- `companies/route.ts` — `GET`, `POST`.
- `companies/[id]/route.ts` — `GET`, `PATCH`, `DELETE`.
- `contacts/[id]/notes/route.ts` — `GET`, `POST` for notes linked to a contact.

### EPIC-07-E-02 — Deal Pipeline API

- `deals/route.ts` — `GET` returns deals grouped by stage; `POST` creates deal.
- `deals/[id]/route.ts` — `GET`, `PATCH` (move stage, update value), `DELETE`.
- `deals/[id]/convert/route.ts` — `POST` converts deal to a Project or Invoice.
- `deal-stages/route.ts` — `GET`, `POST`, `PATCH` for custom pipeline stages.

### EPIC-07-E-03 — CRM UI

`apps/web/src/app/(app)/crm/page.tsx` — Contacts table with search, filter by company, and quick-add drawer.

`apps/web/src/app/(app)/pipeline/page.tsx` — Kanban board built with `@dnd-kit/core`, one column per `DealStage`, cards showing deal title, value, company name. Drag to reorder within stage or move between stages.

`apps/web/src/app/(app)/crm/[id]/page.tsx` — Contact detail: header (name, email, company), tabs for Deals, Invoices, Projects, Contracts, Notes.

### EPIC-07-E-04 — Twenty CRM Integration Bridge (Optional Co-Process)

`packages/integrations/src/twenty.ts` — typed client wrapping Twenty's REST API:

- `syncContact(contact: Contact)` — upsert contact to Twenty.
- `syncDeal(deal: Deal)` — upsert deal/opportunity to Twenty.
- `webhookHandler(payload)` — receive Twenty webhooks and update local DB.

Twenty is the recommended co-process for teams that need multi-user CRM with shared views, automation, and SDK extensions.[^17][^2]

When `OrgSetting` `twenty_enabled = true`, sync is activated via background job.

### EPIC-07-V-01 — Validate CRM Module

- Create 3 contacts, 2 companies, link contacts to companies.
- Create 4 deals across 3 pipeline stages.
- Drag a deal from "Lead" to "Proposal Sent" → stage persists after refresh.
- Open contact detail → associated deals and invoices list correctly.

***

## EPIC-08: Finance Module — Invoicing & Billing

**Goal:** Create, send, and track invoices and quotes, log expenses, and manage recurring billing — backed by local DB and optionally synced to Invoice Ninja for advanced payment processing.[^4][^5]

### EPIC-08-E-01 — Invoice API

Routes in `apps/web/src/app/api/finance/`:
- `invoices/route.ts` — `GET` (paginated, filter by status), `POST`.
- `invoices/[id]/route.ts` — `GET`, `PATCH`, `DELETE`.
- `invoices/[id]/send/route.ts` — `POST`: sets `status = sent`, sends email via SMTP.
- `invoices/[id]/mark-paid/route.ts` — `POST`: creates `PaymentRecord`, sets `status = paid`.
- `invoices/[id]/pdf/route.ts` — `GET`: streams invoice as PDF using Puppeteer or WeasyPrint subprocess.

Auto-increment `number` with prefix from `OrgSetting` `invoice_prefix` (default `INV-`).

### EPIC-08-E-02 — Quote API

- `quotes/route.ts` — `GET`, `POST`.
- `quotes/[id]/route.ts` — `GET`, `PATCH`, `DELETE`.
- `quotes/[id]/convert/route.ts` — `POST`: creates `Invoice` from Quote line items, links via `quoteId`.

### EPIC-08-E-03 — Expenses & Recurring API

- `expenses/route.ts` — `GET`, `POST`.
- `recurring/route.ts` — `GET`, `POST`.
- Cron job via `node-cron`: daily check of `RecurringBilling.nextDate`; auto-create invoice when due.

### EPIC-08-E-04 — Invoice Ninja Integration Bridge (Optional Co-Process)

`packages/integrations/src/invoiceninja.ts`:
- `createInvoice(invoice)` — push invoice to Invoice Ninja and store `externalId`.
- `syncPayments()` — pull payment records from Invoice Ninja into local `PaymentRecord`.
- Webhook handler for payment events.

Activated when `OrgSetting` `invoiceninja_enabled = true`.[^18][^4]

### EPIC-08-E-05 — Finance UI

`apps/web/src/app/(app)/invoices/page.tsx` — table with status filter, quick totals row (outstanding, overdue, paid this month).

`apps/web/src/app/(app)/invoices/[id]/page.tsx` — invoice editor with: client selector, line item table (add/remove rows, quantity, price, tax), notes, send/mark-paid actions, PDF preview.

`apps/web/src/app/(app)/quotes/page.tsx` and `[id]/page.tsx` — same pattern as invoices.

`apps/web/src/app/(app)/expenses/page.tsx` — table with category filter; "Attach Receipt" uploads to Document store.

### EPIC-08-V-01 — Validate Finance Module

- Create quote → convert to invoice → mark as paid → total Outstanding decreases.
- PDF download renders with correct line items.
- Recurring billing triggers on due date → invoice auto-created.
- Invoice Ninja bridge (if enabled) syncs invoice and returns `externalId`.

***

## EPIC-09: Projects & Tasks Module

**Goal:** Manage client and internal projects with tasks, deadlines, and progress — with optional sync to Plane for power users who need full agile tooling.[^9][^10]

### EPIC-09-E-01 — Projects API

- `projects/route.ts` — `GET`, `POST`.
- `projects/[id]/route.ts` — `GET`, `PATCH`, `DELETE`.
- `projects/[id]/tasks/route.ts` — `GET`, `POST`.
- `projects/[id]/budget/route.ts` — `GET` returns `{ budgetHours, loggedHours, budgetAmount, billedAmount }`.

### EPIC-09-E-02 — Tasks API

- `tasks/route.ts` — `GET` (all tasks, filter by assignee/status/project), `POST`.
- `tasks/[id]/route.ts` — `GET`, `PATCH`, `DELETE`.

### EPIC-09-E-03 — Plane Integration Bridge (Optional Co-Process)

`packages/integrations/src/plane.ts`:
- `createProject(project)` → creates Plane workspace project; store `externalId`.
- `syncIssue(task)` → push/pull task to Plane issue.
- Webhook handler for Plane issue status changes.

When `OrgSetting` `plane_enabled = true`, full bidirectional sync is active.[^10][^19]

### EPIC-09-E-04 — Projects UI

`apps/web/src/app/(app)/projects/page.tsx` — project cards with status, budget progress bar, link to tasks.

`apps/web/src/app/(app)/projects/[id]/page.tsx` — detail with tabs: Tasks (Kanban), Time Entries, Financials (budget vs. actual), Documents, Notes.

`apps/web/src/app/(app)/tasks/page.tsx` — cross-project task list with filters.

### EPIC-09-V-01 — Validate Projects Module

- Create project, add 4 tasks, move tasks through statuses → completion percentage updates.
- Budget hours = 10; log 6 hours → budget shows 60% used.

***

## EPIC-10: Time Tracking Module

**Goal:** Log time against projects and tasks, view billable vs. non-billable summaries, and convert time to invoice line items — with optional Solidtime co-process for detailed tracking.[^6]

### EPIC-10-E-01 — Time Entry API

- `time/route.ts` — `GET` (filter by project, date range), `POST`.
- `time/[id]/route.ts` — `GET`, `PATCH`, `DELETE`.
- `time/timer/route.ts` — `POST` to start a timer (create entry with `endTime = null`); `PATCH` to stop.
- `time/billable-summary/route.ts` — `GET` returns `{ billableHours, billableValue, unbillableHours }` for period.
- `time/to-invoice/route.ts` — `POST` with `{ projectId, timeEntryIds }` → creates invoice with line items from time entries.

### EPIC-10-E-02 — Solidtime Integration Bridge (Optional Co-Process)

`packages/integrations/src/solidtime.ts`:
- `syncProject(project)` → create project and client in Solidtime.
- `importEntries(projectId, since)` → pull time entries and upsert into local `TimeEntry`.

When `OrgSetting` `solidtime_enabled = true`, a poller runs every 5 minutes to sync entries.[^6]

### EPIC-10-E-03 — Time Tracking UI

`apps/web/src/app/(app)/time/page.tsx`:
- Running timer widget at top: project/task selector, start/stop button, elapsed time display.
- Time entries table grouped by day.
- Weekly summary bar chart (billable vs. non-billable).
- "Convert to Invoice" button for a date range.

### EPIC-10-V-01 — Validate Time Tracking

- Start timer, wait, stop → duration computed correctly.
- Convert 3 entries to invoice → line items match descriptions and computed hours.
- Solidtime sync (if enabled) imports entries bidirectionally.

***

## EPIC-11: Contracts & Documents Module

**Goal:** Create, send for signature, and track contracts using DocuSeal as the signing co-process.[^7][^8]

### EPIC-11-E-01 — DocuSeal Integration

`packages/integrations/src/docuseal.ts`:
- `createSubmission(templateId, signers)` → POST to DocuSeal API; return `externalSigningId` and `signingUrl`.
- `getStatus(submissionId)` → check signing status.
- `webhookHandler(payload)` → on `completed` event, update `Contract.status = signed` and store signed PDF URL.

### EPIC-11-E-02 — Contracts API

- `contracts/route.ts` — `GET`, `POST`.
- `contracts/[id]/route.ts` — `GET`, `PATCH`.
- `contracts/[id]/send/route.ts` — `POST`: calls DocuSeal `createSubmission`, stores `externalSigningId` and `signingUrl`.

### EPIC-11-E-03 — Contracts UI

`apps/web/src/app/(app)/contracts/page.tsx` — table with status badges (draft, sent, signed, expired).

`apps/web/src/app/(app)/contracts/[id]/page.tsx` — detail showing template used, signers, status, link to signing portal, PDF download when signed.

`apps/web/src/app/(app)/contracts/templates/page.tsx` — list of `ContractTemplate` rows; "Open in DocuSeal" button.

### EPIC-11-V-01 — Validate Contracts Module

- Create a contract from template, send for signing → `signingUrl` generated.
- DocuSeal webhook fires on completion → `Contract.status` updates to `signed`.

***

## EPIC-12: Email & Marketing Module

**Goal:** Newsletter sending and list management via Listmonk (solo/small business), with Mautic as the upgrade path for full marketing automation.[^11][^12]

### EPIC-12-E-01 — Listmonk Integration

`packages/integrations/src/listmonk.ts`:
- `syncList(emailList)` → create/update list in Listmonk.
- `addSubscriber(email, name, listIds)`.
- `createCampaign(campaign)` → create draft campaign.
- `sendCampaign(externalId)`.

### EPIC-12-E-02 — Marketing API

- `marketing/lists/route.ts` — `GET`, `POST`.
- `marketing/campaigns/route.ts` — `GET`, `POST`.
- `marketing/campaigns/[id]/send/route.ts` — `POST`.
- `marketing/subscribers/import/route.ts` — `POST` CSV import → bulk subscribe contacts.

### EPIC-12-E-03 — Marketing UI

`apps/web/src/app/(app)/marketing/page.tsx` — lists table and campaigns table. New campaign drawer with: list selector, subject, and basic rich text editor (TipTap minimal, no full notes extension needed).

### EPIC-12-V-01 — Validate Marketing Module

- Create list, import 5 contacts, create campaign, send → Listmonk processes it.

***

## EPIC-13: Team & HR Module

**Goal:** Team member management, time and PTO tracking, and payroll calculation — only active when `hr_enabled = true`.[^15][^16]

### EPIC-13-E-01 — Team Member API

- `team/members/route.ts` — `GET`, `POST`.
- `team/members/[id]/route.ts` — `GET`, `PATCH`, `DELETE`.
- `team/roles/route.ts` and `team/departments/route.ts` — CRUD.

### EPIC-13-E-02 — Payroll API

- `payroll/route.ts` — `GET`, `POST` (create new payroll run).
- `payroll/[id]/route.ts` — `GET`, `PATCH`.
- `payroll/[id]/approve/route.ts` — `POST` sets `status = approved`.
- `payroll/[id]/export/route.ts` — `GET` exports CSV for bank transfer or payroll service.

### EPIC-13-E-03 — HR UI

`apps/web/src/app/(app)/team/page.tsx` — member cards with role, department, employment type, and status.

`apps/web/src/app/(app)/payroll/page.tsx` — payroll runs table; "New Payroll Run" flow: select period → auto-calculate from `TimeEntry.duration * hourly_rate` per member → review and approve.

### EPIC-13-V-01 — Validate HR Module

- HR is hidden when `hr_enabled = false`, visible when true.
- Create 2 team members, log time, run payroll → net amounts calculated correctly.

***

## EPIC-14: Purchasing & Vendor Module

**Goal:** Track vendors, create purchase orders, and manage procurement — only active when `purchasing_enabled = true`.

### EPIC-14-E-01 — Vendor & PO API

- `purchasing/vendors/route.ts` — `GET`, `POST`.
- `purchasing/vendors/[id]/route.ts` — `GET`, `PATCH`.
- `purchasing/orders/route.ts` — `GET`, `POST`.
- `purchasing/orders/[id]/route.ts` — `GET`, `PATCH`.
- `purchasing/orders/[id]/receive/route.ts` — `POST`: sets `status = received`, optionally creates `Expense`.

### EPIC-14-E-02 — Purchasing UI

`apps/web/src/app/(app)/purchasing/page.tsx` — vendors tab and purchase orders tab.

***

## EPIC-15: Business AI Assist

**Goal:** A business-context AI assistant tuned to the user's OrgProfile, with quick-action prompts and MCP tools for business tasks.

### EPIC-15-E-01 — Org-Aware System Prompt

`apps/web/src/lib/business-ai-context.ts`:

```ts
export async function buildSystemPrompt(): Promise<string> {
  const org = await prisma.orgProfile.findFirst()
  const flags = await prisma.orgSetting.findMany()
  const flagMap = Object.fromEntries(flags.map(f => [f.key, f.value]))

  return `
You are a business assistant for ${org?.name}.
Industry: ${org?.industry}. Business model: ${org?.businessModel}.
Currency: ${org?.billingCurrency}. Country: ${org?.country}.
Active modules: ${Object.entries(flagMap).filter(([k, v]) => k.endsWith('_enabled') && v === 'true').map(([k]) => k.replace('_enabled', '')).join(', ')}.
Current date: ${new Date().toISOString().split('T')}.
Help the user with business tasks, summarize data, draft emails and proposals, and suggest next actions.`
}
```

### EPIC-15-E-02 — Business MCP Tools

`packages/mcp-server/src/tools/business-tools.ts` defines tools:

- `get_revenue_summary(period)` — queries Invoice/PaymentRecord and returns totals.
- `list_overdue_invoices()` — returns invoices past due date with contact names.
- `draft_invoice(contactEmail, lineItems)` — creates an Invoice draft and returns its ID.
- `create_contact(name, email, company)` — creates Contact (and Company if new).
- `get_pipeline_summary()` — returns deals grouped by stage with total values.
- `log_time(projectId, minutes, description)` — creates TimeEntry for now.
- `convert_time_to_invoice(projectId, since)` — calls existing time-to-invoice API.
- `send_for_signature(contractId)` — triggers DocuSeal signing flow.
- `schedule_email_campaign(listId, subject, body, sendAt)` — creates and schedules Listmonk campaign.

### EPIC-15-V-01 — Validate AI Module

- Ask AI "Summarize my open invoices" → correct totals from DB.
- Ask AI "Draft an invoice for Acme Corp, $2,500 consulting fee" → `Invoice` created in `draft` status with correct line item.
- `tools:list` via CLI returns all business tools.

***

## EPIC-16: Automation (n8n)

**Goal:** Event-driven automation for business workflows — triggered by invoicing, CRM, and job events.

### Example Automation Flows

Document in `apps/web/src/app/(app)/automate/AUTOMATION_EXAMPLES.md`:

- **New deal won → auto-create project** — webhook on `deal.status = won` → `POST /api/projects`.
- **Invoice overdue → send reminder** — daily schedule → query overdue invoices → send email.
- **New contact → add to CRM and Listmonk list** — contact webhook → Listmonk API.
- **Signed contract → activate recurring billing** — DocuSeal webhook → create `RecurringBilling`.
- **Time entries exceed budget → notify** — daily check → Slack/email if `loggedHours > budgetHours * 0.9`.

n8n is the recommended co-process, consistent with Creator OS automation pattern; webhook URLs are registered in `AutomationTrigger`.[^1]

***

## EPIC-17: MCP Client & CLI (business-cli)

**Goal:** A CLI for managing the business from the terminal, following Creator OS MCP CLI conventions.[^1]

**Commands to implement:**
```bash
business-cli contact:create "Acme Corp" --email hello@acme.com
business-cli invoice:create --contact hello@acme.com --amount 2500 --desc "Consulting"
business-cli invoice:list --status outstanding
business-cli deal:create "Website Redesign" --value 5000 --stage "Qualified"
business-cli time:start --project proj_123 --desc "Deep work"
business-cli time:stop
business-cli ai:ask "What is my revenue this month?"
business-cli tools:list
```

Validation mirrors Creator OS EPIC-14: all commands must return 0 and produce machine-readable JSON with `--json` flag.[^1]

***

## EPIC-18: Container Build & Packaging

**Goal:** A single Docker image running Business OS web app + all active co-processes, managed by supervisord behind nginx.

### EPIC-18-A-01 — Process Inventory

**File: `infra/docker/PROCESS_INVENTORY.md`:**

```text
PID 1:    supervisord
  ├─ nginx          (port 80 → internal router)
  ├─ next.js        (port 3000)
  ├─ mcp-sse        (port 3200)
  ├─ n8n            (port 5678 — automation)
  ├─ twenty         (port 3100 — CRM co-process, optional)
  ├─ invoiceninja   (port 9000 — invoicing co-process, optional)
  ├─ solidtime      (port 8000 — time tracking co-process, optional)
  ├─ docuseal       (port 3003 — e-signature co-process, optional)
  ├─ plane          (port 8090 — project management co-process, optional)
  └─ listmonk       (port 9001 — email, optional)

Optional (disabled by default, enabled via env var):
  ├─ ollama         (port 11434 — local LLM)
  └─ mautic         (port 8080 — full marketing automation)

Volumes (persistent):
  /data/db          → SQLite database
  /data/files       → uploaded documents, receipts, signed PDFs
  /data/twenty      → Twenty CRM data
  /data/invoiceninja→ Invoice Ninja data
  /data/docuseal    → DocuSeal templates and signed PDFs
  /data/plane       → Plane data
  /data/listmonk    → Listmonk subscriber and campaign data
  /data/n8n         → n8n workflow data
```

### Co-Process Enable/Disable Pattern

Each co-process is gated by an environment variable (`ENABLE_TWENTY=true`, `ENABLE_INVOICENINJA=true`, etc.).
supervisord reads these and skips disabled programs at startup.
This keeps the solo-operator image lean — start with only `next.js`, `mcp-sse`, and `n8n`, and add co-processes by setting env vars and restarting.

### EPIC-18-E-01 — supervisord Config

`infra/supervisord/supervisord.conf` uses the Creator OS pattern with `autostart=%(ENV_ENABLE_TWENTY)s` per optional service.[^1]

### EPIC-18-E-02 — Nginx Config

`infra/nginx/nginx.conf` — routes:

| Path prefix | Upstream |
|---|---|
| `/` | Next.js :3000 |
| `/mcp-sse/` | MCP SSE :3200 |
| `/crm/` | Twenty :3100 |
| `/invoiceninja/` | Invoice Ninja :9000 |
| `/docuseal/` | DocuSeal :3003 |
| `/plane/` | Plane :8090 |
| `/listmonk/` | Listmonk :9001 |
| `/n8n/` | n8n :5678 |
| `/files/` | `/data/files/` static |

### EPIC-18-E-03 — Docker Compose

`docker-compose.yml`:
```yaml
version: "3.8"
services:
  business-os:
    build:
      context: .
      dockerfile: infra/docker/Dockerfile
    ports:
      - "8080:80"
    volumes:
      - business-data:/data
    environment:
      - ADMIN_EMAIL=admin@business-os.local
      - ADMIN_PASSWORD=changeme
      - NEXTAUTH_SECRET=replace-with-64-char-secret
      - NEXTAUTH_URL=http://localhost:8080
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - ENABLE_TWENTY=${ENABLE_TWENTY:-false}
      - ENABLE_INVOICENINJA=${ENABLE_INVOICENINJA:-false}
      - ENABLE_SOLIDTIME=${ENABLE_SOLIDTIME:-false}
      - ENABLE_DOCUSEAL=${ENABLE_DOCUSEAL:-false}
      - ENABLE_PLANE=${ENABLE_PLANE:-false}
      - ENABLE_LISTMONK=${ENABLE_LISTMONK:-false}
      - ENABLE_N8N=${ENABLE_N8N:-true}
      - ENABLE_OLLAMA=${ENABLE_OLLAMA:-false}
    restart: unless-stopped
volumes:
  business-data:
    driver: local
```

### EPIC-18-V-01 — Validate Container

```bash
docker compose up --build
```

**Pass criteria:**
- `http://localhost:8080` serves Next.js login page.
- `docker exec business-os supervisorctl status` shows all enabled processes `RUNNING`.
- AI ask via CLI returns correct invoice summary.
- Enable `ENABLE_DOCUSEAL=true` and restart → DocuSeal available at `/docuseal/`.

***

## Scale-Up Path: From Solo to Enterprise

The design principle is that Business OS scales by registering more MCP tools and enabling more co-processes — no core code changes required.

| Stage | Org Size | Action |
|---|---|---|
| Solo operator | 1 person | Default flags; only Next.js + n8n run. |
| Small team | 2–5 | Enable `hr_enabled = true`, set `ENABLE_TWENTY=true`, `ENABLE_PLANE=true`. |
| Agency / Studio | 5–25 | Enable `ENABLE_INVOICENINJA=true`, `ENABLE_SOLIDTIME=true`, `ENABLE_DOCUSEAL=true`. |
| Mid-market | 25–100 | Migrate DB to Postgres; enable `ENABLE_MAUTIC=true`; add Frappe HR via MCP; register ERP MCP tool. |
| Enterprise | 100+ | Decompose co-processes to dedicated servers; register Odoo or ERPNext as MCP tool; SAML SSO via `next-auth` provider.[^20][^21] |

At every stage, the core Business OS web app and its schema stay constant — only service topology changes.[^20][^22]

---

## References

1. [Creator-OS-Full-Execution-Plan-Assess-Plan-Execute-Validate.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/399744584/abd6ec54-7f74-4389-aec4-b0a0b60ab632/Creator-OS-Full-Execution-Plan-Assess-Plan-Execute-Validate.md?AWSAccessKeyId=ASIA2F3EMEYE7TOCCQ4U&Signature=TbSlBKlyI2aYh9dzwq9Zhai7vZM%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEMb%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJIMEYCIQD1rWCCxM7%2BMvokgZnKTRu4QtIIHt91cGKpFBmvhSSJcAIhAINp7%2Fg4PyzzGxPkE2IpFmQAShKBJr6IOsv0IHXKw4QoKvwECI%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQARoMNjk5NzUzMzA5NzA1Igzry1%2B7ieUJ9Aev780q0ASJ9bh2FLZEwDXBJ%2FvHrxeAs09mm%2BlNeH4WpOS48OgwUApuiGyMSkB2cMRDER%2B%2FJaCsmDTql98H6tTZtoJGCBIvgg6IN3Hpd1jguGYOMywzh8%2BGN1s0%2F3Ft%2Btkrig0v6Kt8z8jmTXtZieoy2hCBwG3L6s6%2BNZj9uw8pDZG9W0QpAs%2BEYX1%2Bk%2B1whApcfjg6XTmlIaGDqU5DEelWOP%2B3RCRtlWz%2BY7Yz5n21PjDy20wssxyBF%2BT3EZqzlcFmWP6BPEPYCGIw6t%2F5s%2B0tI0sL3DGY8UeI3VaLLI8t0SX%2BvSuDMyJuK1PRhKa85HF9xiJfZdXNY6vP9vyQbGfGV9smOKudxmHMIjeUXsQOn4qLsBE44%2F%2Fuh7ou7BJB4lpObcjk2KWXm70Su5Em0bRPL4MYt2SzXZw3nNNYKVjw3hrJvxliw2wRP2OkjUcgGsliZzggJ%2FEnAyXFRK7cAh1sJK%2BAmUuJfvoQIC7OZaelXdzsZWzUdE8k4mPrIOQhxMDIjD3TuubqIsLLshpdV6Ywsbs3WvDb0anyxSFuudiVmIgoSj6UIoS4xsclbFfpdQjha6SuFRsQXuQ%2F78%2BnqWn%2Fl01z5JVOrFr3j26ZLdwgyvXs5mzLF65R%2FmyXdrb%2FkJdPcyJ2lGCKtl1mjKtBBz%2BT%2FG6AEKpRNTtKZP82ktQeQQ%2F1R05c8doUoR7p7qezenbMtr64YEbdVkIMXsz02P2yjU2JsHU62OdOPiUX4pI%2FXA3%2B3cNqyzr%2FoqlW%2BKlYUASa8A570En6lLdGmgzXJ5fTyp8BICSjMMTK6c8GOpcB8wpwbXebR6%2Fa3vPqw0y91swYVT1P1MKJbBvhi6XPCpSFh46aSy8yARGME0Ga76nXANGo04dSK7P4pymgpsDICjDb0ae%2B99vQ7Lo3O8iQmIfCouBKpxCSTobEB1b%2B27fjhTI9ImF7laqIMYKhpmZIAiIfU2htLQWgADh0VPXJXWYLQ1bpFdgEPe6BpWkUf%2FuXDQTtN8arxg%3D%3D&Expires=1778021143) - # Creator OS — Full Execution Plan (Assess → Plan → Execute → Validate)

## How to Use This Document...

2. [Twenty v2.0: Self-hosted CRM : r/selfhosted](https://www.reddit.com/r/selfhosted/comments/1srmjht/twenty_v20_selfhosted_crm/) - We're an open-source CRM (https://github.com/twentyhq/twenty). It's been a while since I last posted...

3. [Twenty | #1 open source CRM](https://twenty.com) - Twenty is the #1 open source CRM on GitHub. You can self-host to fully own your infrastructure, or r...

4. [Invoice Ninja | Free Self-Hosted Invoicing, Quotes, Expenses ...](https://www.invoiceninja.org) - Self-Hosting Invoice Ninja. Invoices, Expenses and Tasks built with Laravel, Flutter and React. Down...

5. [Deploy Invoice Ninja [Updated May '26]](https://railway.com/deploy/invoiceninja) - You can self-host Invoice Ninja to maintain full control over your client data, invoices, and paymen...

6. [Solidtime - Modern open-source time-tracking app](https://github.com/solidtime-io/solidtime) - solidtime is a modern open-source time tracking application for Freelancers and Agencies. Features. ...

7. [DocuSeal | Open Source Document Signing](https://www.docuseal.com) - Free and Open source tool to streamline document filling and signing. Create custom PDF forms to com...

8. [docusealco/docuseal: Open source DocuSign alternative. ...](https://github.com/docusealco/docuseal) - DocuSeal is an open source platform that provides secure and efficient digital document signing and ...

9. [Plane vs Taiga: A Detailed Comparison of Project ...](https://openalternative.co/compare/plane/vs/taiga) - Plane significantly outpaces Taiga in community adoption with 48,307 stars compared to 821 stars on ...

10. [Top 6 open source project management software in 2026](https://plane.so/blog/top-6-open-source-project-management-software-in-2026) - Explore the top 6 open-source project management tools for 2026, comparing Plane, OpenProject, Leant...

11. [Listmonk vs Mautic: Which Is Better in 2026? (Pros & Cons)](https://www.sequenzy.com/versus/listmonk-vs-mautic) - Listmonk is lean and easy. Mautic is powerful but complex. Both are self-hosted and open-source. Pla...

12. [Best Open Source Email Marketing Platforms for ...](https://www.awwtomation.com/blog/best-open-source-email-marketing-platforms) - Overview: Listmonk is a modern, high-performance, self-hosted newsletter and mailing list manager. W...

13. [Top Airtable Competitors (2025)](https://baserow.io/blog/top-airtable-competitors) - Baserow is a powerful, open-source alternative to Airtable with an emphasis on flexibility, data sov...

14. [8 Best Airtable Alternatives for Custom Apps in 2026](https://lovable.dev/guides/airtable-alternatives-custom-apps) - 1. Notion: Best for Knowledge-First Teams · 2. Baserow: Best for Open-Source Flexibility · 3. NocoDB...

15. [Cloud Based HR Software | Frappe HR](https://frappe.io/hr) - Frappe HR is a 100% open source, modern, user-friendly solution to drive excellence within your team...

16. [HR Software that Grows With You, For Free](https://orangehrm.com/orangehrm-starter-open-source-software) - OrangeHRM Starter is a free and open-source HR software designed to help HR teams streamline adminis...

17. [Open Source CRM for Businesses | Twenty CRM - Factorial](https://www.factorial.io/en/blog/crm-software-open-source-twenty-crm) - Discover how Twenty CRM redefines customer management with open source CRM software. Gain full data ...

18. [Small Business Invoicing Features](https://invoiceninja.com/features/) - Invoice Ninja is a leading free invoicing software for small business invoicing, online payments, tr...

19. [The definitive guide to self-hosting project management ...](https://plane.so/blog/self-hosted-project-management-jira-server-alternative) - Around since 2012, OpenProject is one of the oldest open-source project management products still ar...

20. [Top 5 Open Source ERP Hosting Options](https://www.aorborc.com/top-5-open-source-erp-hosting-options/) - ERPNext: Budget-friendly with integrated features. Ideal for small to medium businesses, offering se...

21. [Leading Open-Source Enterprise Resource Systems in 2025](https://www.planetcrust.com/leading-open-source-enterprise-resource-systems-2025/) - ERPNext has emerged as a leading open-source ERP with 24.2k GitHub stars. Originally known for its s...

22. [8 Best ERP software solutions for 2025](https://www.onlyoffice.com/blog/2025/05/best-erp-software) - Odoo stands out as one of the most versatile and cost-effective ERP software for small businesses an...

