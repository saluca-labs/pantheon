# Business OS — Execution Plan (locked decisions)

> Drafted by Plan sub on 2026-05-12.
> Supersedes the legacy Perplexity EPIC plan at `business.md` once Cristian
> resolves the open decisions in §"Open questions" below and the legacy doc
> is moved to `business.md.legacy-epic.md`.

## How to Read This Doc

Business OS is the eighth vertical to be planned in the Pantheon agentic-os family, following the shape established by Maker OS and refined through Autobiographer / Research: the **most recent phase sits at the top**, earlier phases appended chronologically below. Every section is a self-contained set of locked decisions that an executor can take straight into a build prompt.

This document is **plan-only**. The contacts CRM stub from migration `0010_business_os` is shipped and will be carried forward as the seed of Phase 1 (see Inventory below). All other tables, routes, pages, and the coach are net-new. (A prior epic-style draft — the original Perplexity plan with EPIC-XX-A/P/E/V tickets and the standalone-monorepo container co-process stack — has been retired; its domain inventory feeds directly into the phase decomposition below.) Its implementation specifics (Turborepo monorepo at `~/business-os/`, next-auth, Prisma, SQLite, supervisord-managed Twenty + Invoice Ninja + Solidtime + DocuSeal + Plane + Listmonk + Mautic + Baserow + Frappe HR + OrangeHRM + n8n co-processes) are discarded in favor of the native pantheon shape every other Pantheon OS uses.

***

## Inventory — What Already Exists

**Registry entry** (`apps/platform-web/src/lib/agentic-os/registry.ts`):

- `slug: 'business'`, `status: 'live'`, accent `teal`, icon `Briefcase`. Tagline "Solo to enterprise without re-architecting." Description "Org profile, contacts, invoicing, finances, and ops modules that unlock as your team grows." One feature card listed today, pointing at `/dashboard/business/contacts` ("Contacts CRM").

**Shipped surface (stub features only — pre-Phase-1 sketch):**

- `apps/platform-web/src/app/(dashboard)/dashboard/business/contacts/page.tsx` — loads the user's people / organizations / interactions and mounts the `ContactsCrm` component. No deal / pipeline concept yet.
- `apps/platform-web/src/components/agentic-os/business/contacts-crm.tsx` — client UI for the three-entity contact ledger (people, orgs, recent interactions).
- `apps/platform-web/src/lib/agentic-os/business/crm.ts` — domain types (`Person`, `Organization`, `Interaction`, `ORG_TYPES`, `INTERACTION_TYPES`, `CONTACT_STAGES`), validators, `fullName` helper. Stage taxonomy `lead | qualified | proposal | negotiation | won | lost | inactive` and interaction taxonomy `call | email | meeting | demo | proposal | follow_up | note | linkedin | other` are already in code.
- `apps/platform-web/src/lib/agentic-os/business/repo.ts` — CRUD against the three `agos_business_*` tables. Currently uses a thin local `recordAudit` rather than the shared `_shared/audit.ts` writer.
- `apps/platform-web/src/lib/agentic-os/business/session.ts` — thin re-export of Health OS's session helpers (`getCurrentBusinessUser` / `getBusinessPool`) so the vertical shares the same cookie + pool layer.
- `apps/platform-web/src/app/api/tiresias/agentic-os/business/contacts/route.ts` — list / create endpoints for the three entities.

**Existing migrations touching `agos_business_*`:**

- `0010_business_os` (`packages/database/alembic/versions/0010_business_os.py`), down_revision `0009_autobiographer_os`. Creates three tables:
  - `agos_business_orgs` — `id`, `user_id`, `name`, `org_type` default `'company'` (free-form, no CHECK), `website`, `industry`, `notes`, timestamps. Index on `(user_id, name ASC)`.
  - `agos_business_people` — `id`, `user_id`, `first_name`, `last_name`, `email`, `phone`, `role`, `organization_id` FK SET NULL → orgs, `stage` default `'lead'` (free-form, no CHECK), `tags JSONB DEFAULT '[]'`, `notes`, timestamps. Indexes on `(user_id, last_name, first_name)` and `(organization_id)`.
  - `agos_business_interactions` — `id`, `user_id`, `person_id` FK SET NULL → people, `organization_id` FK SET NULL → orgs, `interaction_type` default `'note'` (free-form, no CHECK), `summary`, `occurred_at`, `created_at`. Indexes on `(user_id, occurred_at DESC)` and `(person_id, occurred_at DESC)`.

**What is NOT yet built (everything else):**

- No concept of a **deal** or **pipeline**. The contact `stage` column on `people` overloads the stage taxonomy onto the contact itself, which conflates "this person is qualified" with "we have an open opportunity in negotiation"; Phase 2 introduces a proper `deals` entity and re-uses `stage` only as a deal-pipeline attribute.
- No **project / time-tracking** layer. Time entries for billable hours do not exist.
- No **invoicing**, no quotes, no payments, no line items.
- No **expenses**, no receipts, no P&L rollup.
- No **documents** / **e-sign**. No template / signer flow.
- No **email marketing** / lists / broadcasts (deferred — see Open questions §7).
- No **HR / payroll** surface (deferred — see Non-goals).
- No **AI coach** for Business (`_shared/coach/` already lives under Filmmaker / Health / Cyber / Maker / Autobiographer / Research; reuse is in Phase 7).
- No **PDF export** of any business artifact (`_shared/pdf/` ready to reuse).
- No registered `agos_business_*` mutations call the shared `_shared/audit.ts` writer (legacy local `recordAudit` is still used in the contacts repo); Phase 1 migrates this so every business mutation audits through the standard channel and carries `os_slug = 'business'`.

***

## Vision

Business OS is the business-operations vertical for solo founders, freelancers, consultants, and small shops (≤5 people). It maps the records and workflows that turn a person into a sole-proprietor or small-team business: contacts and the deals between them, billable time against client projects, the invoices that close those deals, the expenses that erode the margin, the documents that bind the engagement, and an advisory coach that helps the user make pricing / sales / strategy decisions instead of guessing.

The OS deliberately stops well short of full ERP. It does not host the user's own multi-tenant SaaS billing for their own customers (Stripe owns that surface), it does not file taxes (point users to a CPA), it does not do HRIS-grade payroll (out of scope until a small-team cohort asks), and it does not host email marketing automation at Mautic scale (a minimal Listmonk-style broadcast lives at Phase 6 if Cristian wants it in v1 — otherwise it slides to Phase 8). What it does do is keep every record a solo operator actually creates — contacts, deals, projects, time, invoices, expenses, contracts — in one place, audited the same way every other Pantheon OS is audited, exportable as PDF, and within arm's reach of an AI advisor that knows the user's pricing history and client list.

Workflow shape is **capture → track → invoice → reflect**. Phase 1 lays the org-profile + CRM contacts/companies foundation (carrying the existing stub forward with proper CHECKs and a clean per-OS UUID contract). Phase 2 promotes deals + pipeline + activities into first-class records. Phase 3 introduces business projects + tasks + time entries (separate from Maker projects per locked decision §5). Phase 4 ships quotes, invoices, line items, and payment tracking. Phase 5 adds expenses + P&L rollup + PDF export. Phase 6 introduces documents + in-app e-signature (no DocuSign integration per locked decision §6). Phase 7 is the AI coach with five modes: `pricing_advisor`, `sales_coach`, `marketing_advisor`, `business_strategist`, `general`.

**Why this decomposition over the legacy 30-EPIC layout.** The legacy plan front-loaded "Organization Profile + adaptive sidebar + multi-user-mode + co-process container stack" as the foundational trifecta. That trifecta solves problems v1 doesn't have: solo users don't need role-aware permission tables, the adaptive sidebar can be deferred until we know which modules users actually toggle off, and the co-process stack (Twenty + Invoice Ninja + Solidtime + DocuSeal + ...) duplicates pantheon's own schema-and-routes pattern. By dropping those three foundational systems and reusing the established Pantheon OS shape, Phase 1 collapses from EPIC-01 through EPIC-06 (six EPICs across scaffold / DB / auth / org profile / shell / dashboard) into a single migration + CRM polish.

***

## Locked Decisions (resolved 2026-05-12)

These eight architectural decisions were resolved by Cristian on 2026-05-12 and the plan below reflects them.

1. **Co-process services vs native: NATIVE.** No Twenty / Invoice Ninja / Solidtime / DocuSeal / Plane / Listmonk / Mautic / Baserow / Frappe HR / OrangeHRM / n8n containers. All data in `agos_business_*` tables, all routes under `app/api/tiresias/agentic-os/business/`. The legacy doc's container fleet is discarded.

2. **Auth: SOULAUTH.** Reuses pantheon's existing `getCurrentBusinessUser` / `getBusinessPool` helpers in `lib/agentic-os/business/session.ts`. No next-auth.

3. **Database: REUSE PANTHEON POSTGRES.** All `agos_business_*` tables live alongside every other Pantheon OS on the pantheon alembic chain. Migration `0010_business_os` already established this.

4. **Scope at v1: SOLO-FIRST.** Single `user_id` ownership on every row, no roles / permissions / tenant layer, no Organization Profile wizard, no adaptive sidebar. RBAC + team invites reserved for a future Phase 8+.

5. **Project taxonomy overlap with Maker: SEPARATE.** New `agos_business_projects` with client-engagement-focused taxonomy (status: `proposed / active / on_hold / completed / cancelled / archived`; billing_model: `hourly / fixed / retainer / milestone / free`). Optional `metadata.maker_project_id` pointer for users on both OSes (per the v0.1.30 platform contract — no FK).

6. **E-signature: IN-APP CANVAS.** Signature image stored at URL (URL-only per MCP storage transfer contract); audit trail on the `agos_audit` row chain. No DocuSeal / DocuSign integration.

7. **Email / marketing: OMIT FROM V1, SHIP AS PHASE 8.** The seven phases below run capture → invoice → reflect → coach without it. A future Phase 8 adds Listmonk-style broadcast (subscriber list + manual broadcast + template). Hub registry placeholder card "Newsletter — coming soon" preserves visibility.

8. **AI Coach modes: FIVE MODES.** `pricing_advisor`, `sales_coach`, `marketing_advisor`, `business_strategist`, `general`. The `marketing_advisor` mode is added beyond the original four-mode recommendation. Since email broadcast is deferred to Phase 8 (per D7), `marketing_advisor` focuses on customer-acquisition signals already in Business OS: deal sources, contact patterns, service tags from invoices, interaction velocity per contact. Each mode's context loader is mode-shaped and capped at 50 KB (Maker convention).

***

## Non-Goals (Explicit)

- **Container co-processes.** No Twenty CRM, Invoice Ninja, Solidtime, DocuSeal, Plane, Listmonk, Mautic, Baserow, Frappe HR, OrangeHRM, or n8n. Everything is native pantheon. The shipped Pantheon stack runs inside the pantheon app — one Postgres, one SoulAuth, one deploy pipeline. Future integrations can be MCP-mediated if Cristian wants data import from any of those, but they are not the runtime.
- **Multi-tenant SaaS billing of end-customers.** Business OS records the user's own clients (who they invoice, who paid). It does not host the user's customers' multi-tenant subscriptions — Stripe owns that surface, and the user wires their Stripe payouts into a Business OS payment row as a manual record.
- **Tax filing, withholding, sales-tax compliance.** Out of scope. The invoicing layer records sales-tax line items numerically when the user enters them; it does not file, calculate jurisdiction-aware rates, or generate tax forms. Direct users to a licensed CPA.
- **HRIS-grade payroll.** No `agos_business_employees` table in v1, no pay-run engine, no W-2 / 1099 issuance, no benefits / PTO accrual. Contractor payments are recorded as expenses; a full HR surface is a Phase 8+ addition.
- **Full ERP.** No purchasing / vendor management, no inventory tracking, no fixed-asset depreciation, no general ledger / journal entries. The legacy doc spec'd a vendor + PO module in EPIC-14; this is dropped from v1.
- **Email marketing automation in v1.** Per Open question §7 default.
- **Adaptive sidebar / feature-flag toggling per industry / team size.** Out of scope until there's evidence users actually disable modules. Every module ships visible to every user.
- **Real-time collaborative editing on invoices / contracts / notes.** Solo-target. Single-user writes with periodic save are fine.
- **Built-in receipt OCR.** Phase 5 expenses are URL-only attachments; parsing receipt images into structured line items is reserved for a later MCP-mediated importer.
- **CRM / accounting data import (QuickBooks, Xero, HubSpot, Salesforce, Pipedrive).** Out of scope. A future MCP-mediated importer would handle this; v1 is manual entry plus the existing stub.

***

## Phase 7 — AI Coach (pricing_advisor / sales_coach / marketing_advisor / business_strategist / general) (locked decisions)

**Migration:** `0061_business_phase7`, down_revision `0060_business_phase6`.

**Scope:** Streaming Anthropic-backed AI coach with five modes — `pricing_advisor`, `sales_coach`, `marketing_advisor`, `business_strategist`, and `general`. Mirrors Maker / Research / Autobiographer Phase 7 (single-table transcript with inline JSONB messages, no mutating coach tools, streaming wire format). No domain-output filter (academic / business prose isn't credential-sensitive the way Cyber output is, nor crisis-adjacent the way Health is). System-prompt guardrails for regulated advice (legal, tax, securities) refer the user to a licensed professional. The `marketing_advisor` mode focuses on customer-acquisition signals (deal sources, contact patterns, service tags from invoices) rather than email-broadcast workflows, because email/marketing surfaces are deferred to a future Phase 8 (per locked decision §7).

**Schema (1 new table, all under `agos_business_*`):**

1. `agos_business_coach_sessions` — one row per chat session, transcript stored as an inline JSONB array on the row (Maker / Autobiographer / Research shape, not the Filmmaker / Cyber split).

   Columns: `id UUID PK`, `user_id UUID NOT NULL`, `project_id UUID` nullable (per-OS UUID, NO FK — matches the v0.1.30 platform contract), `mode TEXT NOT NULL` CHECK in `('pricing_advisor','sales_coach','marketing_advisor','business_strategist','general')`, `title TEXT NOT NULL` (auto-summarized from first turn or user-set), `messages JSONB NOT NULL DEFAULT '[]'` (ordered array of `{ role, content, created_at }`), `metadata JSONB NOT NULL DEFAULT '{}'` (carries the system-prompt version + the deal-id / invoice-id / project-id slice the mode consumed), `created_at`, `updated_at`.

   Indexes: `(user_id, updated_at DESC)` (recent-sessions surface), partial `(project_id, updated_at DESC) WHERE project_id IS NOT NULL` (per-project session list), `(user_id, mode, updated_at DESC)` (mode-filtered list).

**Locked decisions:**

- **No domain output filter.** Matches Filmmaker / Maker / Research, not Cyber (which redacts secrets) or Health (crisis-safety wall).
- **System-prompt regulatory guardrail:** every mode is system-prompted to refuse legal, tax, securities, or licensed-professional advice and refer the user to a CPA / attorney / fiduciary as appropriate. Same pattern as Maker's "PPE / ventilation / training" rule and Research's "IRB / IACUC" rule.
- **`SYSTEM_PROMPT_VERSION = 'v1'`** — bump on material template edits.
- **Audit action names:** `business.coach.session_created`, `business.coach.session_renamed`, `business.coach.session_deleted`, `business.coach.message_appended`.

**Context loading (mode-shaped, hard-capped at 50 KB pre-prompt):**

- `pricing_advisor` (project optional, deal optional): the user's recent invoices (last 30; total cents, line-count, status, paid_at), active deals (title, stage, value_cents, expected_close_date), workshop-wide pricing history rollup (median invoice total cents per service-tag, p25/p75). If a deal is scoped, that deal's history + contact + linked project.
- `sales_coach` (deal optional): the user's open deals (Phase 2), recent interactions per deal (last 5; type + summary), pipeline stage distribution counts. If a deal is scoped, the full deal record + contact + linked project + interactions timeline.
- `marketing_advisor` (deal optional): deal-source distribution (`agos_business_deals.source` rollup — referral / cold_outreach / inbound / linkedin / etc.; counts + won-rate per source over last 12 months), recent won deals with their sources, service-tag distribution from invoices (Phase 4 — what offerings actually convert), contact tier distribution (Phase 1's `agos_business_people.stage` as free-form tier), interaction velocity (`agos_business_interactions` count per contact over last 90 days). If a deal is scoped, that deal's source + contact + linked invoices.
- `business_strategist` (project optional): workshop-wide rollups — monthly revenue last 6 months (Phase 4), monthly expense total last 6 months (Phase 5), gross margin (revenue - expenses) per month, active client count, top-3-clients-by-revenue, top-3-clients-by-time (Phase 3). If a project is scoped, that project's billable vs non-billable hours, budget vs spent.
- `general` (project optional): contact count, deal count by stage, active project count, open invoice count + outstanding cents, monthly expense total. Used for stuck-founder conversations.

**Routes (BFF, under `app/api/tiresias/agentic-os/business/coach/`):**

- `GET  /coach/sessions` — list. Filters: `?mode=`, `?project_id=`, `?scope=workshop`. Paginated.
- `POST /coach/sessions` — create. Body `{ mode, project_id?, title?, initial_message? }`. Returns 503 `coach_not_configured` if `ANTHROPIC_API_KEY` is missing. 404 if `project_id` doesn't belong to caller. Audited.
- `GET  /coach/sessions/[sessionId]` — fetch session + transcript.
- `PATCH /coach/sessions/[sessionId]` — rename. Audited.
- `DELETE /coach/sessions/[sessionId]` — drop. Audited.
- `POST /coach/sessions/[sessionId]/messages` — append user turn, stream assistant turn. Wire format matches Maker / Filmmaker / Cyber / Autobiographer / Research: plain UTF-8 deltas, U+001E sentinel, JSON trailer with `{ session_id }`.
- `POST /coach/quick` — one-shot quick prompt (no persistence).

All mutating routes audit via `recordAudit({ pool, osSlug: 'business', actorId, action: 'business.coach.<verb>', payload, projectId })` against the shared `_shared/audit.ts` writer.

**System prompts:** per-mode TypeScript constants under `lib/agentic-os/business/coach/system-prompt.ts`. Each mode carries a role framing on top of three shared hard rules:

1. Never invent client / deal / invoice facts (defer to "I don't have that on file yet").
2. Refuse to give regulated professional advice (legal / tax / securities / licensed-professional advice generally) and refer the user to a CPA / attorney / fiduciary.
3. Defer accounting-method opinions (cash vs accrual, depreciation schedules, sales-tax jurisdiction) to a licensed professional.

**Pages:**

- `/dashboard/business/coach` — coach hub. Lists recent sessions, mode picker + per-mode quick prompts + free-form start input. 503-aware empty state when `ANTHROPIC_API_KEY` unset.
- `/dashboard/business/coach/[sessionId]` — session view. Mode pill + scope pill on header.
- Deal detail (Phase 2), project detail (Phase 3), and invoice detail (Phase 4) pages all CTA into `/business/coach?<scope>_id=<id>&mode=<default>`.

**Cross-ownership safety:** every read filters by `user_id`. Session ownership checked before fetch / mutation. `project_id` belonging to another user returns 404.

**Phase N seam:** none — this is the terminal phase.

**Hub registry card:** add `AI coach` pointing at `/dashboard/business/coach`.

***

## Phase 6 — Documents and E-Signature (Lite) (locked decisions)

**Migration:** `0060_business_phase6`, down_revision `0059_business_phase5`.

**Scope:** Three new tables that turn a Business OS engagement into a signable document packet — templates (NDA / SOW / 1099 / proposal), documents (per-engagement instances), and signatures (in-app canvas capture, stored as image URL). No DocuSign / DocuSeal dependency. Phase 4 invoices and Phase 3 projects can optionally link to a document (e.g. a SOW pinned to a project).

**Schema (3 new tables, all under `agos_business_*`):**

1. `agos_business_doc_templates` — workshop-global library. `id UUID PK`, `user_id UUID NOT NULL`, `title TEXT NOT NULL`, `kind TEXT NOT NULL DEFAULT 'sow'` CHECK in `('nda','sow','msa','proposal','1099','invoice_terms','other')`, `body_md TEXT NOT NULL DEFAULT ''` (markdown with `{{client_name}}`, `{{project_title}}`, `{{rate}}`, `{{total}}` template variables), `version TEXT NOT NULL DEFAULT '1.0'`, `parent_template_id UUID` nullable (self-reference for "this is v1.1 of template X"; no FK to allow soft history), `tags TEXT[] NOT NULL DEFAULT '{}'`, `metadata JSONB`. Indexes `(user_id, kind)`, `(parent_template_id) WHERE parent_template_id IS NOT NULL`, GIN on `tags`.

2. `agos_business_documents` — per-engagement instances. `id UUID PK`, `user_id UUID NOT NULL`, `template_id UUID` nullable FK CASCADE → templates (null = ad-hoc document, no template), `project_id UUID` nullable (per-OS UUID, no FK), `deal_id UUID` nullable (per-OS UUID, no FK), `contact_id UUID` nullable FK SET NULL → `agos_business_people` (counterparty), `title TEXT NOT NULL`, `body_md TEXT NOT NULL DEFAULT ''` (rendered template with variables substituted; user can edit before send), `status TEXT NOT NULL DEFAULT 'draft'` CHECK in `('draft','sent','signed','declined','expired')`, `sent_at TIMESTAMPTZ`, `signed_at TIMESTAMPTZ`, `pdf_url TEXT` (URL-only per the MCP storage transfer contract; populated on `signed` by the Phase 6 PDF render route), `metadata JSONB`, `created_at`, `updated_at`. Indexes `(user_id, status, updated_at DESC)`, partial `(project_id) WHERE project_id IS NOT NULL`, partial `(deal_id) WHERE deal_id IS NOT NULL`.

3. `agos_business_signatures` — signature events. `id UUID PK`, `document_id UUID NOT NULL` FK CASCADE → documents, `user_id UUID NOT NULL` (owner of the document — for audit), `signer_role TEXT NOT NULL DEFAULT 'counterparty'` CHECK in `('self','counterparty','witness')`, `signer_name TEXT NOT NULL`, `signer_email TEXT`, `signature_image_url TEXT NOT NULL` (URL-only; data URL captured from the canvas widget and uploaded via MCP storage transfer), `signed_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `ip_address TEXT` (best-effort capture for audit), `user_agent TEXT` (same), `metadata JSONB`, `created_at`. Index `(document_id, signed_at DESC)`, partial UNIQUE `(document_id, signer_role) WHERE signer_role = 'self'` (only one self-signature per document).

**Locked decisions:**

- **In-app signature, not DocuSign / DocuSeal.** Per Open question §6. A canvas widget on the document detail page captures a signature image; the image is uploaded via the existing MCP storage transfer contract and the resulting URL is stored on the signature row.
- **Template variables are markdown-friendly.** Substitution is whole-token `{{name}}` regex replacement; no scripting / no conditionals / no loops. If a user needs richer templating they can edit `body_md` directly on the document before send.
- **Document lifecycle gates by status.** A `draft` document is fully editable; `sent` locks `body_md` (only `status` can change); `signed` is terminal and immutable; `declined` and `expired` are terminal except for re-creating a new document from the same template.
- **No native email send.** Documents are "sent" by status flip + a copy-link affordance; the user emails the link manually (or pastes the rendered markdown into their own email tool). A future MCP-mediated email send is reserved.
- **Signed PDF rendering** uses the `_shared/pdf/` primitives. On `signed`, the document body + signature images are rendered to PDF and stored at `pdf_url` for retrieval. Layout: title + counterparty + signed-at + body + signature image footer.
- **Audit action names:** `business.template.created`, `business.template.updated`, `business.template.version_bumped`, `business.document.created`, `business.document.sent`, `business.document.signed`, `business.document.declined`, `business.document.archived`, `business.signature.captured`.

**Routes:**

- `/api/tiresias/agentic-os/business/templates` (GET, POST). `/templates/[id]` (GET, PATCH, DELETE).
- `/api/tiresias/agentic-os/business/templates/[id]/versions` (POST bump — creates a new row with `parent_template_id = original.id`).
- `/api/tiresias/agentic-os/business/documents` (GET list — filterable by `?status=`, `?kind=`, `?project_id=`, `?deal_id=`, `?contact_id=`; POST create — accepts `template_id?` to pre-fill `body_md` with substituted variables).
- `/api/tiresias/agentic-os/business/documents/[id]` (GET, PATCH — 400 if `status != 'draft'`, DELETE).
- `/api/tiresias/agentic-os/business/documents/[id]/send` (POST) — flips `status` to `sent`, sets `sent_at`. Returns 409 if not in `draft`.
- `/api/tiresias/agentic-os/business/documents/[id]/signatures` (GET list, POST capture — body includes the data-URL canvas image, route uploads via MCP and stores returned URL). Returns 409 if document is not in `sent`. On the counterparty signature, flips document `status` to `signed`, sets `signed_at`, renders PDF, stores at `pdf_url`.
- `/api/tiresias/agentic-os/business/documents/[id]/decline` (POST) — flips to `declined`. Reason text in body.
- `/api/tiresias/agentic-os/business/documents/[id]/export.pdf` — fresh render of the current state (works at any status). Filename `<document-slug>-<YYYY-MM-DD>.pdf`.

**Pages:**

- `/dashboard/business/templates` — template library.
- `/dashboard/business/templates/[id]` — template editor with version history rail.
- `/dashboard/business/documents` — workshop document list with filter chips (status / kind / project / deal).
- `/dashboard/business/documents/[id]` — document detail. Three sections: meta (counterparty + template + status + dates), body editor (markdown when `draft`, read-only otherwise), signature panel (canvas widget when `sent` and the user is the counterparty; signature history otherwise).
- Deal detail (Phase 2) and project detail (Phase 3) pages — new `Documents` tab listing attached documents with add picker.

**Cross-ownership safety:** every read filters by `user_id`. Document mutation validates `project_id` / `deal_id` / `contact_id` / `template_id` ownership where supplied.

**Phase 7 seam:** Coach `business_strategist` mode can reference document counts and signed-at deltas as a deal-velocity signal in the context loader.

**Hub registry card:** add `Documents` pointing at `/dashboard/business/documents`.

***

## Phase 5 — Expenses, P&L Rollup, and PDF Export (locked decisions)

**Migration:** `0059_business_phase5`, down_revision `0058_business_phase4`.

**Scope:** Per-user expense ledger with receipt URL attachment, a small category taxonomy for P&L, a per-project / per-month rollup view, and PDF export of a financial summary (P&L for a date range, project profitability, or workshop summary). Mirrors Research Phase 5's PDF-plus-derived-rollup pattern.

**Schema (2 new tables + 1 derived view, all under `agos_business_*`):**

1. `agos_business_expenses` — per-user expense ledger. `id UUID PK`, `user_id UUID NOT NULL`, `project_id UUID` nullable (per-OS UUID, no FK — null = workshop-overhead expense), `category TEXT NOT NULL DEFAULT 'general'` CHECK in `('general','software','hardware','travel','meals','marketing','contractor','office','utilities','insurance','professional_services','education','taxes','other')`, `vendor TEXT`, `description TEXT NOT NULL DEFAULT ''`, `amount_cents BIGINT NOT NULL` (positive = expense, negative = refund / credit), `currency TEXT NOT NULL DEFAULT 'USD'`, `incurred_on DATE NOT NULL` (calendar-date semantics; user-facing reporting axis), `paid_on DATE` nullable (when payment cleared; used for cash-basis vs accrual rollup), `receipt_url TEXT` nullable (URL-only per the MCP storage transfer contract), `is_reimbursable BOOLEAN NOT NULL DEFAULT false`, `reimbursed_at TIMESTAMPTZ` nullable (when reimbursement was processed), `tags TEXT[] NOT NULL DEFAULT '{}'`, `metadata JSONB`, `created_at`, `updated_at`. Indexes `(user_id, incurred_on DESC)`, partial `(project_id, incurred_on DESC) WHERE project_id IS NOT NULL`, `(user_id, category, incurred_on DESC)`, GIN on `tags`, partial `(user_id) WHERE is_reimbursable = true AND reimbursed_at IS NULL` (open reimbursements feed).

2. `agos_business_pnl_snapshots` — append-only monthly snapshots for trend reporting. `id UUID PK`, `user_id UUID NOT NULL`, `period_kind TEXT NOT NULL DEFAULT 'month'` CHECK in `('month','quarter','year','custom')`, `period_start DATE NOT NULL`, `period_end DATE NOT NULL`, `revenue_cents BIGINT NOT NULL` (paid invoices in period — Phase 4), `expense_cents BIGINT NOT NULL` (expenses in period), `margin_cents BIGINT NOT NULL` (revenue - expense), `currency TEXT NOT NULL`, `is_locked BOOLEAN NOT NULL DEFAULT false` (lock prevents recomputation when subsequent invoice / expense edits happen in a closed period — Cristian can override by toggling), `notes TEXT`, `created_at`. UNIQUE `(user_id, period_kind, period_start)` — one snapshot per period per user. Index `(user_id, period_start DESC)`.

3. **Derived rollup endpoint** (no new table) — `GET /pnl/summary?period_start=&period_end=&group_by=month|project|category` returns a JSON aggregation computed live from invoices + expenses. Snapshots above are only persisted on explicit user-triggered "lock period" action.

**Locked decisions:**

- **Cash-basis is the default rollup.** Revenue counts on the date a payment record landed (Phase 4 `agos_business_payments.received_on`); expense counts on `paid_on` if set, else `incurred_on`. An accrual toggle is reserved for a future Phase 8 — solo founders almost universally file on cash basis.
- **Currency is per-row, not per-user.** Multi-currency support is baked in (Phase 4 invoices carry per-row currency too); rollups group by `(user_id, currency)` and the rollup endpoint returns a per-currency array, not a converted sum. FX conversion is out-of-scope for v1.
- **No automatic period close.** P&L snapshots are created when the user explicitly POSTs a period — a "Close September 2026" button on the rollup page. Once locked, edits to underlying invoices / expenses are still allowed but the snapshot's stored numbers don't shift until the user unlocks + re-snapshots.
- **Receipt OCR deferred.** Phase 5 expenses are URL-only attachments; parsing receipt images into structured line items is reserved for a later MCP-mediated importer.
- **PDF export** uses the `_shared/pdf/` primitives. Three templates: (a) **P&L summary** (period + revenue + expense + margin table + category breakdown + per-month bar chart), (b) **project profitability** (project meta + budget + billed hours + invoice total + expense total + net), (c) **expense report** (filterable list + totals by category). Footer "Generated by Pantheon Business OS".
- **Audit action names:** `business.expense.created`, `business.expense.updated`, `business.expense.deleted`, `business.expense.reimbursed`, `business.pnl.snapshot_created`, `business.pnl.snapshot_locked`, `business.pnl.snapshot_unlocked`, `business.pnl.export.pdf`.

**Routes:**

- `/api/tiresias/agentic-os/business/expenses` (GET list — filters `?category=`, `?project_id=`, `?from=`, `?to=`, `?tag=`, `?reimbursable=true`; POST create).
- `/api/tiresias/agentic-os/business/expenses/[id]` (GET, PATCH, DELETE).
- `/api/tiresias/agentic-os/business/expenses/[id]/reimburse` (POST) — flips `reimbursed_at = now()`. Audited.
- `/api/tiresias/agentic-os/business/pnl/summary` (GET — query params `period_start`, `period_end`, `group_by=month|project|category`).
- `/api/tiresias/agentic-os/business/pnl/snapshots` (GET list, POST create from a period). `/pnl/snapshots/[id]` (GET, PATCH `is_locked`, DELETE).
- `/api/tiresias/agentic-os/business/pnl/export.pdf` — Content-Type application/pdf, filename `pnl-<period_start>-<period_end>.pdf`. Query params select the template (a / b / c above).
- `/api/tiresias/agentic-os/business/projects/[id]/profitability.pdf` — convenience route for template (b).

**Pages:**

- `/dashboard/business/expenses` — workshop expense ledger with filter chips (category / project / date range / reimbursable toggle), running totals strip, "Add expense" CTA.
- `/dashboard/business/pnl` — P&L hub. Three panels: live summary (date-range picker + bar chart + category breakdown), snapshot history (locked-period list), export CTAs.
- Project detail (Phase 3) — Expenses tab + Profitability badge on header (live computed).

**Cross-ownership safety:** every read filters by `user_id`. Expense mutation validates `project_id` ownership when supplied.

**Phase 7 seam:** Coach `business_strategist` context loader reads the live P&L summary endpoint for the last 6 months when the mode opens.

**Hub registry cards:** add `Expenses` pointing at `/dashboard/business/expenses` and `P&L` pointing at `/dashboard/business/pnl`.

***

## Phase 4 — Quotes, Invoices, Line Items, and Payments (locked decisions)

**Migration:** `0058_business_phase4`, down_revision `0057_business_phase3`.

**Scope:** A first-class billing surface. **Quotes** are pre-sale estimates; **invoices** are post-engagement bills; **line items** are the row-level breakdown of either; **payments** record when an invoice was paid (manually entered — Stripe / bank-feed sync is reserved for Phase 8). Time entries from Phase 3 can be "rolled up" into invoice line items via a conversion route.

**Schema (4 new tables, all under `agos_business_*`):**

1. `agos_business_quotes` — pre-sale estimates. `id UUID PK`, `user_id UUID NOT NULL`, `deal_id UUID` nullable (per-OS UUID, no FK — links to Phase 2 deal), `contact_id UUID` nullable FK SET NULL → people (counterparty), `project_id UUID` nullable (no FK — Phase 3 project), `quote_number TEXT NOT NULL`, `title TEXT NOT NULL`, `description_md TEXT NOT NULL DEFAULT ''`, `status TEXT NOT NULL DEFAULT 'draft'` CHECK in `('draft','sent','accepted','rejected','expired','converted')` ("converted" = an invoice was created from this quote), `quote_date DATE NOT NULL DEFAULT current_date`, `expires_on DATE` nullable, `subtotal_cents BIGINT NOT NULL DEFAULT 0` (sum of line item amounts; denormalized for fast list rendering), `tax_cents BIGINT NOT NULL DEFAULT 0`, `total_cents BIGINT NOT NULL DEFAULT 0`, `currency TEXT NOT NULL DEFAULT 'USD'`, `converted_invoice_id UUID` nullable (set on conversion; no FK), `metadata JSONB`, `created_at`, `updated_at`. UNIQUE `(user_id, quote_number)`. Indexes `(user_id, status, quote_date DESC)`, partial `(deal_id) WHERE deal_id IS NOT NULL`, partial `(contact_id) WHERE contact_id IS NOT NULL`.

2. `agos_business_invoices` — post-engagement bills. `id UUID PK`, `user_id UUID NOT NULL`, `deal_id UUID` nullable, `contact_id UUID` nullable FK SET NULL, `project_id UUID` nullable, `quote_id UUID` nullable (if originating from a quote; no FK), `invoice_number TEXT NOT NULL`, `title TEXT NOT NULL`, `description_md TEXT NOT NULL DEFAULT ''`, `status TEXT NOT NULL DEFAULT 'draft'` CHECK in `('draft','sent','partial','paid','overdue','voided')`, `invoice_date DATE NOT NULL DEFAULT current_date`, `due_on DATE NOT NULL`, `terms TEXT NOT NULL DEFAULT 'net_30'` (free-form; the legacy doc's net_15 / net_30 / net_60 strings work), `subtotal_cents BIGINT NOT NULL DEFAULT 0`, `tax_cents BIGINT NOT NULL DEFAULT 0`, `total_cents BIGINT NOT NULL DEFAULT 0`, `paid_cents BIGINT NOT NULL DEFAULT 0` (denormalized sum of payments; reconciled on every payment write), `currency TEXT NOT NULL DEFAULT 'USD'`, `pdf_url TEXT` nullable (populated on PDF export, URL-only per the MCP storage transfer contract), `metadata JSONB`, `created_at`, `updated_at`. UNIQUE `(user_id, invoice_number)`. Indexes `(user_id, status, due_on ASC)`, partial `(deal_id) WHERE deal_id IS NOT NULL`, partial `(contact_id) WHERE contact_id IS NOT NULL`, partial `(user_id) WHERE status IN ('sent','partial','overdue')` (outstanding feed).

3. `agos_business_line_items` — per-quote OR per-invoice row breakdown (one of the parent IDs is set, never both). `id UUID PK`, `quote_id UUID` nullable FK CASCADE → quotes, `invoice_id UUID` nullable FK CASCADE → invoices, `user_id UUID NOT NULL`, `position INT NOT NULL` (display order within parent), `description TEXT NOT NULL`, `quantity NUMERIC(12,3) NOT NULL DEFAULT 1.0`, `unit_label TEXT NOT NULL DEFAULT 'hour'` (free-form; "hour", "unit", "month", "flat"), `unit_price_cents BIGINT NOT NULL`, `line_total_cents BIGINT NOT NULL` (denormalized = quantity * unit_price_cents, rounded), `tax_rate_bp INT NOT NULL DEFAULT 0` (basis points — 10000 = 100%; 875 = 8.75%), `line_tax_cents BIGINT NOT NULL DEFAULT 0`, `time_entry_ids UUID[] NOT NULL DEFAULT '{}'` (provenance — which Phase 3 time entries rolled into this line; no FK array — array-of-UUIDs is the established cross-table reference pattern), `metadata JSONB`, `created_at`. CHECK `(quote_id IS NULL) <> (invoice_id IS NULL)` (XOR). Indexes `(quote_id, position) WHERE quote_id IS NOT NULL`, `(invoice_id, position) WHERE invoice_id IS NOT NULL`, GIN on `time_entry_ids`.

4. `agos_business_payments` — payment records (manual entry). `id UUID PK`, `invoice_id UUID NOT NULL` FK CASCADE → invoices, `user_id UUID NOT NULL`, `amount_cents BIGINT NOT NULL`, `currency TEXT NOT NULL`, `method TEXT NOT NULL DEFAULT 'bank_transfer'` CHECK in `('bank_transfer','check','cash','card','stripe','paypal','wire','other')`, `received_on DATE NOT NULL`, `reference TEXT` (check number / transaction id / etc.), `notes TEXT`, `metadata JSONB`, `created_at`. Index `(invoice_id, received_on DESC)`, `(user_id, received_on DESC)` (cash-basis revenue feed for Phase 5).

**Locked decisions:**

- **Quote → invoice conversion** is a POST route on the quote that copies the quote fields + line items to a new invoice row, flips quote `status` to `converted`, and writes `converted_invoice_id`. The original quote remains readable for audit; line items on the new invoice are fresh rows (no FK shared) so the quote can be amended without affecting the invoice.
- **Invoice numbering is per-user, user-specified.** No auto-increment in v1 — the user types `INV-2026-001` themselves. UNIQUE `(user_id, invoice_number)` enforces no duplicates. A future `business_settings.invoice_number_template` for auto-format is reserved for Phase 8.
- **Time-entry rollup** is one-shot. The "Convert unbilled time entries to invoice line items" route reads the project's unbilled hours, groups by `task_id` (Phase 3), creates one line item per group with `quantity = sum(hours)`, `unit_label = 'hour'`, `unit_price_cents = task.billing_rate_cents` (Phase 3 records this), `time_entry_ids = [...]`, and flips each consumed time entry's `billed_at = now()`. Round-trip is recorded.
- **Status transitions are deterministic.** Invoice `draft → sent` on POST `/send`. `sent → partial` on first payment that doesn't cover total. `sent | partial → paid` when `paid_cents >= total_cents`. `sent | partial → overdue` is a derived display state (not stored) when `due_on < today AND status IN ('sent','partial')`. The derived-overdue convention matches Maker Phase 6's milestone "at_risk in 7 days" treatment.
- **Tax is per-line-item.** No global invoice-wide tax row. Sales-tax jurisdiction calculation, multi-locality rates, and tax-exemption flags are out-of-scope; the user types in the basis points per line. This avoids a CompliantTax-as-a-Service dependency.
- **PDF export** uses the `_shared/pdf/` primitives. Invoice template: page 1 = from/to header + invoice meta (number, dates, terms) + line item table with subtotal/tax/total + payment record table + outstanding amount footer. Quote template: same shape, no payments, "Valid through" instead of "Due on". Both templates accept a `business_settings.brand_block` field (logo URL + business name + address) that's set from a workshop-global settings row.
- **Audit action names:** `business.quote.created`, `business.quote.updated`, `business.quote.sent`, `business.quote.accepted`, `business.quote.rejected`, `business.quote.converted`, `business.invoice.created`, `business.invoice.updated`, `business.invoice.sent`, `business.invoice.voided`, `business.line_item.created`, `business.line_item.updated`, `business.line_item.deleted`, `business.payment.recorded`, `business.payment.voided`, `business.time_entries.billed`, `business.invoice.export.pdf`, `business.quote.export.pdf`.

**Routes:**

- `/api/tiresias/agentic-os/business/quotes` (GET, POST). `/quotes/[id]` (GET, PATCH, DELETE — 400 if `status != 'draft'`).
- `/api/tiresias/agentic-os/business/quotes/[id]/send` (POST).
- `/api/tiresias/agentic-os/business/quotes/[id]/convert` (POST) — creates the invoice.
- `/api/tiresias/agentic-os/business/quotes/[id]/line-items` (GET, POST). `/line-items/[itemId]` (PATCH, DELETE).
- `/api/tiresias/agentic-os/business/invoices` (GET — filter `?status=`, `?contact_id=`, `?project_id=`, `?from=`, `?to=`, `?outstanding=true`; POST).
- `/api/tiresias/agentic-os/business/invoices/[id]` (GET, PATCH, DELETE).
- `/api/tiresias/agentic-os/business/invoices/[id]/send` (POST).
- `/api/tiresias/agentic-os/business/invoices/[id]/void` (POST).
- `/api/tiresias/agentic-os/business/invoices/[id]/line-items` (GET, POST). `/line-items/[itemId]` (PATCH, DELETE).
- `/api/tiresias/agentic-os/business/invoices/[id]/payments` (GET, POST). `/payments/[paymentId]` (GET, PATCH, DELETE).
- `/api/tiresias/agentic-os/business/invoices/[id]/from-time-entries` (POST) — rolls up unbilled time entries for the linked project.
- `/api/tiresias/agentic-os/business/invoices/[id]/export.pdf`.
- `/api/tiresias/agentic-os/business/quotes/[id]/export.pdf`.

**Pages:**

- `/dashboard/business/quotes` — quote list with status filter chips. `/quotes/[id]` — quote detail with line-item editor.
- `/dashboard/business/invoices` — invoice list, default filter outstanding (sent + partial + derived-overdue). `/invoices/[id]` — invoice detail with line-item editor, payment ledger, export-PDF button, "Bill unbilled time" CTA when the linked project has unbilled entries.
- Deal detail (Phase 2), project detail (Phase 3), contact detail — new `Quotes` and `Invoices` tabs.

**Cross-ownership safety:** every read filters by `user_id`. Quote / invoice / line-item / payment mutation validates parent ownership (deal / project / contact / quote / invoice) before write.

**Phase 5 seam:** payments are the revenue source for Phase 5 P&L rollup. Invoice `status` and `paid_cents` are the materialized accrual side; Phase 5 uses `payments.received_on` for cash-basis revenue.

**Phase 7 seam:** Coach `pricing_advisor` reads recent invoices + their `total_cents` and `line_items.unit_price_cents` per service tag to ground pricing recommendations.

**Hub registry cards:** add `Quotes` and `Invoices`.

***

## Phase 3 — Projects, Tasks, and Time Tracking (locked decisions)

**Migration:** `0057_business_phase3`, down_revision `0056_business_phase2`.

**Scope:** Business-side **projects** (client engagements — separate from Maker projects per Open question §5), **tasks** within each project, and **time entries** logged against a task. Each time entry has a billable flag and a rate that feeds the Phase 4 invoice rollup.

**Schema (3 new tables, all under `agos_business_*`):**

1. `agos_business_projects` — client-engagement project. `id UUID PK`, `user_id UUID NOT NULL`, `contact_id UUID` nullable FK SET NULL → `agos_business_people` (primary point of contact; the `agos_business_orgs` link traverses through person.organization_id), `deal_id UUID` nullable (per-OS UUID, no FK — Phase 2 source deal), `title TEXT NOT NULL`, `slug TEXT NOT NULL`, `description_md TEXT NOT NULL DEFAULT ''`, `status TEXT NOT NULL DEFAULT 'active'` CHECK in `('proposed','active','on_hold','completed','cancelled','archived')`, `billing_model TEXT NOT NULL DEFAULT 'hourly'` CHECK in `('hourly','fixed','retainer','milestone','free')`, `default_rate_cents BIGINT` nullable (billing rate when billing_model = 'hourly' / 'retainer'; per-task override possible), `budget_cents BIGINT` nullable (fixed-price total or retainer-period total), `currency TEXT NOT NULL DEFAULT 'USD'`, `start_date DATE`, `target_completion_date DATE`, `cover_image_url TEXT` nullable (URL-only per the MCP storage transfer contract), `tags TEXT[] NOT NULL DEFAULT '{}'`, `metadata JSONB NOT NULL DEFAULT '{}'` (carries optional `maker_project_id` cross-reference per Open question §5), `archived_at TIMESTAMPTZ` nullable, `created_at`, `updated_at`. UNIQUE `(user_id, slug)`. Indexes `(user_id, status, updated_at DESC)`, partial `(user_id) WHERE archived_at IS NULL`, partial `(contact_id) WHERE contact_id IS NOT NULL`, GIN on `tags`.

2. `agos_business_tasks` — per-project task. `id UUID PK`, `user_id UUID NOT NULL`, `project_id UUID NOT NULL` FK CASCADE → `agos_business_projects` (this is the only intra-OS hard FK — the project-task boundary is owned entirely by this OS), `title TEXT NOT NULL`, `description_md TEXT NOT NULL DEFAULT ''`, `status TEXT NOT NULL DEFAULT 'todo'` CHECK in `('todo','in_progress','blocked','done','cancelled')`, `priority TEXT NOT NULL DEFAULT 'medium'` CHECK in `('low','medium','high','urgent')`, `assignee_text TEXT` nullable (free-form; this is solo-first so the assignee is usually the user — Phase 8+ multi-user surfaces a proper FK), `due_on DATE`, `completed_at TIMESTAMPTZ`, `billing_rate_cents BIGINT` nullable (override; null = use project.default_rate_cents), `is_billable BOOLEAN NOT NULL DEFAULT true`, `position INT NOT NULL DEFAULT 0` (display order), `tags TEXT[] NOT NULL DEFAULT '{}'`, `metadata JSONB`, `created_at`, `updated_at`. Indexes `(project_id, position)`, `(project_id, status)`, partial `(due_on) WHERE due_on IS NOT NULL AND status NOT IN ('done','cancelled')`, GIN on `tags`.

3. `agos_business_time_entries` — time logged against task. `id UUID PK`, `user_id UUID NOT NULL`, `task_id UUID NOT NULL` FK CASCADE → tasks, `project_id UUID NOT NULL` (denormalized for filter performance; matches task.project_id at insert), `description TEXT NOT NULL DEFAULT ''`, `started_at TIMESTAMPTZ NOT NULL`, `ended_at TIMESTAMPTZ` nullable (null = timer still running), `duration_minutes INT` nullable (denormalized; computed from started_at / ended_at on `ended_at` write; null while running), `is_billable BOOLEAN NOT NULL DEFAULT true`, `billing_rate_cents BIGINT` nullable (snapshot of the rate at log time — Phase 4 reads this rather than the live task / project rate so historical entries don't drift), `billed_at TIMESTAMPTZ` nullable (set when Phase 4 rolls up into a line item — `agos_business_line_items.time_entry_ids` is the reverse index), `invoice_id UUID` nullable (set on bill rollup; per-OS UUID, no FK), `metadata JSONB`, `created_at`, `updated_at`. CHECK `(ended_at IS NULL) OR (ended_at >= started_at)`. Indexes `(user_id, started_at DESC)`, `(task_id, started_at DESC)`, `(project_id, started_at DESC)`, partial `(user_id) WHERE ended_at IS NULL` (running-timer feed; expected cardinality 0–1 per user), partial `(project_id) WHERE is_billable = true AND billed_at IS NULL` (unbilled-time rollup query).

**Locked decisions:**

- **Project per engagement, not per Maker build.** Per Open question §5 default — Business projects are client engagements; Maker projects are workshop builds. The `metadata.maker_project_id` field is an optional pointer for users who want a cross-OS link, but there's no FK and no Business code reads from Maker tables.
- **Time entry billing rate is snapshot, not lookup.** Logging an entry copies the current task / project rate onto the entry. This insulates historical invoicing from later rate changes — important for any audit of "what did we agree to charge in March?".
- **Single running timer per user, soft-enforced.** The API rejects a new timer-start POST if any time entry for the user has `ended_at IS NULL`. A "stop timer" affordance is always visible in the header when a running entry exists.
- **Tasks are project-scoped only.** No workshop-global task list and no cross-project task dependencies in this phase (cross-project dependencies could come in a future Phase 8 mirroring Maker Phase 6, but solo-shop engagements rarely need it).
- **Audit action names:** `business.project.created`, `business.project.updated`, `business.project.status_changed`, `business.project.archived`, `business.project.restored`, `business.task.created`, `business.task.updated`, `business.task.completed`, `business.task.deleted`, `business.time.started`, `business.time.stopped`, `business.time.updated`, `business.time.deleted`.

**Routes:**

- `/api/tiresias/agentic-os/business/projects` (GET, POST). `/projects/[id]` (GET, PATCH, DELETE soft-archive, `?hard=true` reserved but not in UI).
- `/api/tiresias/agentic-os/business/projects/[id]/restore` (POST).
- `/api/tiresias/agentic-os/business/projects/[id]/tasks` (GET, POST). `/tasks/[taskId]` (GET, PATCH, DELETE).
- `/api/tiresias/agentic-os/business/projects/[id]/time-entries` (GET).
- `/api/tiresias/agentic-os/business/tasks/[id]/time-entries` (GET).
- `/api/tiresias/agentic-os/business/time-entries` (GET workshop feed, POST start — accepts `{ task_id, started_at?, description? }`; rejects with 409 if a running timer exists).
- `/api/tiresias/agentic-os/business/time-entries/[id]` (GET, PATCH — accepts `ended_at` to stop a running timer + recompute duration, DELETE).
- `/api/tiresias/agentic-os/business/time-entries/[id]/stop` (POST convenience — sets `ended_at = now()`).

**Pages:**

- `/dashboard/business/projects` — project grid with status filter chips, billing-model badges, archived toggle.
- `/dashboard/business/projects/[id]` — project detail. Tab strip: `Overview | Tasks | Time | Documents (P6) | Quotes (P4) | Invoices (P4) | Expenses (P5) | Coach (P7)`. Overview shows budget vs spent (billable hours × rate) when budget is set.
- `/dashboard/business/time` — workshop time-entry timeline with filters (project / task / billable toggle / date range).
- Header `RunningTimerPill` mounted on the dashboard shell — visible across all Business OS pages when a timer is running, CTAs to stop.

**Components:** `ProjectList`, `ProjectForm`, `ProjectDetailShell`, `ProjectStatusPill`, `ProjectBudgetGauge`, `TaskBoard` (kanban-style), `TaskRowEditor`, `TimeEntryRow`, `TimeEntryEditor`, `RunningTimerPill`, `TimerStartButton`.

**Cross-ownership safety:** every read filters by `user_id`. Task mutation validates `project_id` ownership; time entry mutation validates task ownership.

**Phase 4 seam:** Phase 4 invoice line-item rollup queries `agos_business_time_entries WHERE project_id = ? AND is_billable = true AND billed_at IS NULL`. The `billed_at` + `invoice_id` columns on time entries are written by the Phase 4 rollup route.

**Phase 5 seam:** Phase 5 project profitability rollup reads time entries' billable × rate as revenue accrual signal.

**Phase 7 seam:** Coach `business_strategist` mode loads top-3-projects-by-time + total billable hours when scope is workshop-wide.

**Hub registry cards:** add `Projects`, `Time tracking`.

***

## Phase 2 — Deals, Pipeline, and Activities (locked decisions)

**Migration:** `0056_business_phase2`, down_revision `0055_business_phase1`.

**Scope:** Promote the `stage` column on `agos_business_people` from an overloaded contact-state into a proper **deal** entity. A deal is an open opportunity tied to a contact (and optionally an organization), with its own pipeline stage, expected value, expected close date, and an activity log. The existing `agos_business_interactions` table becomes the activity log per-deal (it's already shaped for type + summary + occurred_at; Phase 2 adds an optional `deal_id` column).

**Schema (1 new table + 1 ALTER + 1 column-deprecation, all under `agos_business_*`):**

1. `agos_business_deals` — opportunity records. `id UUID PK`, `user_id UUID NOT NULL`, `contact_id UUID` nullable FK SET NULL → `agos_business_people` (the primary buyer-side contact), `organization_id UUID` nullable FK SET NULL → `agos_business_orgs` (denormalized for filter performance; usually = `person.organization_id` at deal creation but the user can override), `title TEXT NOT NULL`, `description_md TEXT NOT NULL DEFAULT ''`, `stage TEXT NOT NULL DEFAULT 'lead'` CHECK in `('lead','qualified','proposal','negotiation','won','lost','on_hold')`, `value_cents BIGINT` nullable (expected deal size in minor units), `currency TEXT NOT NULL DEFAULT 'USD'`, `probability_pct INT NOT NULL DEFAULT 50` CHECK in `(0..100)` (forecast weight), `expected_close_date DATE` nullable, `closed_at TIMESTAMPTZ` nullable (set when stage moves to won / lost), `lost_reason TEXT` nullable, `source TEXT` nullable (free-form: referral / cold_outreach / inbound / linkedin / etc.), `tags TEXT[] NOT NULL DEFAULT '{}'`, `metadata JSONB`, `created_at`, `updated_at`. Indexes `(user_id, stage, updated_at DESC)`, partial `(contact_id) WHERE contact_id IS NOT NULL`, partial `(user_id) WHERE stage NOT IN ('won','lost','on_hold')` (open-pipeline feed), partial `(user_id, expected_close_date ASC) WHERE stage NOT IN ('won','lost','on_hold')` (closing-soon feed), GIN on `tags`.

2. `agos_business_interactions` (ALTER) — additive only. Adds:
   * `deal_id UUID` nullable (per-OS UUID, no FK — links activity to a deal). Index partial `(deal_id, occurred_at DESC) WHERE deal_id IS NOT NULL`.

3. `agos_business_people.stage` column — **deprecated, kept in place**. The existing stage column has free-form values from migration 0010 (no CHECK constraint). Phase 2 does NOT migrate or drop the column, to avoid breaking the shipped `/contacts` page. The contacts CRM stops treating `stage` as semantically meaningful (the column becomes a free-form contact tier label like "active / inactive / VIP"; the actual sales pipeline lives on `agos_business_deals.stage`). Phase 1 of the migration adds a CHECK to the deals stage column; the people stage column stays unchecked. A future Phase 8 cleanup can rename the people column to `contact_tier` if needed.

**Locked decisions:**

- **Deal stages are CHECK-constrained.** The legacy people stage column was unchecked free-form (causing data drift); deals are rigorous from day one. CHECK list: `lead | qualified | proposal | negotiation | won | lost | on_hold`.
- **Probability is user-entered, not stage-derived.** No automatic "qualified = 25%, proposal = 50%, negotiation = 75%" mapping. Solo founders adjust per-deal.
- **Forecast revenue is derived, not stored.** A `?include=forecast` query parameter on the deals list endpoint returns each deal's `weighted_value_cents = value_cents * probability_pct / 100` and a pipeline-total rollup. No materialized snapshot — recompute on demand.
- **Activity log writes against the existing `agos_business_interactions` table.** Phase 2 adds the optional `deal_id` column; existing contact / org interactions remain visible on their parents. New interactions can target a deal directly.
- **Audit action names:** `business.deal.created`, `business.deal.updated`, `business.deal.stage_changed`, `business.deal.won`, `business.deal.lost`, `business.deal.reopened`, `business.deal.archived`, `business.interaction.created`, `business.interaction.updated`, `business.interaction.deleted`. (The interaction names already exist informally; Phase 2 standardizes them on the shared audit writer.)

**Routes:**

- `/api/tiresias/agentic-os/business/deals` (GET — filters `?stage=`, `?contact_id=`, `?organization_id=`, `?source=`, `?tag=`, `?open=true`, `?include=forecast`; POST create).
- `/api/tiresias/agentic-os/business/deals/[id]` (GET, PATCH, DELETE).
- `/api/tiresias/agentic-os/business/deals/[id]/stage` (POST) — convenience that flips stage, sets `closed_at = now()` when moving to won / lost, audits with `business.deal.stage_changed` plus `business.deal.won` / `business.deal.lost` as appropriate.
- `/api/tiresias/agentic-os/business/deals/[id]/interactions` (GET, POST).
- Existing `/api/tiresias/agentic-os/business/contacts/` routes extended to accept `?deal_id=` filter on the interactions endpoint.

**Pages:**

- `/dashboard/business/deals` — pipeline kanban view (one column per stage), filter chips (contact / org / source / tag / open toggle), forecast total strip on top. Drag-to-reorder column ordering moves stage (audited).
- `/dashboard/business/deals/[id]` — deal detail. Sections: meta (contact + org + value + probability + expected close + source), description, activity timeline (interactions filtered to `deal_id`), linked projects (Phase 3) + quotes / invoices (Phase 4) populated when later phases ship.
- `/dashboard/business/contacts/[id]` — contact detail page now added (previously only the contacts list existed). Sections: meta + interaction timeline + linked deals + linked projects (P3).
- `/dashboard/business/organizations/[id]` — org detail page added.

**Components:** `DealKanban`, `DealCard`, `DealForm`, `DealDetailShell`, `DealStagePicker`, `ForecastStrip`, `InteractionTimeline`, `InteractionEditor`, `ContactDetailShell`, `OrgDetailShell`.

**Cross-ownership safety:** every read filters by `user_id`. Deal mutation validates `contact_id` / `organization_id` ownership. Interaction with `deal_id` validates deal ownership.

**Phase 3 seam:** projects link to deals via `agos_business_projects.deal_id`. The Phase 3 "new project" flow offers a "create from deal" affordance that pre-fills project title / contact_id / organization_id / value (becomes budget_cents).

**Phase 4 seam:** invoices / quotes link to deals via `deal_id`. A deal page shows linked quotes + invoices once Phase 4 ships.

**Phase 7 seam:** Coach `sales_coach` mode reads open deals + recent interactions for context.

**Hub registry card:** add `Deals` pointing at `/dashboard/business/deals`.

***

## Phase 1 — Foundation + CRM Polish (locked decisions)

**Migration:** `0055_business_phase1`, down_revision `0054_research_phase7`.

**Scope:** Promote the shipped `agos_business_*` CRM stub from migration 0010 to the locked Pantheon contract. Specifically: (a) add proper CHECK constraints on the stage / org_type / interaction_type columns; (b) migrate the local `recordAudit` helper in `lib/agentic-os/business/repo.ts` to call the shared `_shared/audit.ts` writer with `os_slug = 'business'`; (c) add a small workshop-global **business settings** row (the user's own brand + default currency + invoice prefix + default payment terms — used by Phase 4 PDF render and Phase 6 document templates); (d) extend the contacts surface with `contact_id` detail page hooks, a tags column, and an `archived_at` soft-archive column for both people and orgs. No deal / pipeline / time / invoicing concepts — those land in Phases 2-4.

**Schema changes (2 ALTER + 1 new table, all under `agos_business_*`):**

1. `agos_business_orgs` (ALTER) — additive only. Adds:
   * `description_md TEXT NOT NULL DEFAULT ''` (longer-form notes; migration backfills from existing `notes` column where present by `description_md = COALESCE(notes, '')`).
   * `address TEXT` (free-form mailing block).
   * `tags TEXT[] NOT NULL DEFAULT '{}'`.
   * `archived_at TIMESTAMPTZ` nullable (soft-archive marker).
   * `metadata JSONB NOT NULL DEFAULT '{}'`.
   * CHECK on `org_type` IN `('company','non_profit','government','sole_trader','partnership','other')`. Pre-migration data is all defaulted to `'company'` so the CHECK is non-destructive; the migration also remaps any non-matching free-form values to `'other'` defensively before applying the CHECK.
   * Indexes: GIN on `tags`, partial `(user_id) WHERE archived_at IS NULL` (active-orgs default list).

2. `agos_business_people` (ALTER) — additive only. Adds:
   * `description_md TEXT NOT NULL DEFAULT ''`.
   * `address TEXT`.
   * `archived_at TIMESTAMPTZ` nullable.
   * `metadata JSONB NOT NULL DEFAULT '{}'`.
   * **`stage` column kept free-form**, NOT CHECKed. (Per Phase 2's deprecation plan: stage on `people` becomes a free-form contact-tier label; the sales-pipeline stage lives on `agos_business_deals` in Phase 2.) The `tags JSONB` column from migration 0010 is migrated to `tags TEXT[] NOT NULL DEFAULT '{}'` in a separate small migration step — the JSONB-array shape was a short-cut in the stub.
   * CHECK on `agos_business_interactions.interaction_type` IN the nine values from `INTERACTION_TYPES` in `crm.ts` (the constraint was missing in 0010). Pre-migration data is all defaulted to `'note'`; defensive remap before CHECK.
   * Indexes: GIN on `tags`, partial `(user_id) WHERE archived_at IS NULL`.

3. `agos_business_settings` — workshop-global settings (one row per user). `id UUID PK`, `user_id UUID NOT NULL UNIQUE`, `business_name TEXT NOT NULL DEFAULT ''`, `logo_url TEXT` nullable (URL-only per the MCP storage transfer contract), `address TEXT NOT NULL DEFAULT ''`, `tax_id TEXT` nullable (free-form: EIN, ABN, VAT, etc.), `default_currency TEXT NOT NULL DEFAULT 'USD'`, `invoice_number_prefix TEXT NOT NULL DEFAULT 'INV'`, `quote_number_prefix TEXT NOT NULL DEFAULT 'Q'`, `default_payment_terms TEXT NOT NULL DEFAULT 'net_30'`, `default_hourly_rate_cents BIGINT` nullable, `accent_color TEXT NOT NULL DEFAULT 'teal'` (drives PDF render chrome — Phase 4 / Phase 5 / Phase 6 read this), `metadata JSONB`, `created_at`, `updated_at`. Index `(user_id)`. The settings row is created lazily on first read — no explicit onboarding wizard in Phase 1.

**Locked decisions:**

- **No Organization Profile wizard.** The legacy plan front-loaded a multi-step wizard collecting team-size / industry / billing-model / geographic-scope to drive an adaptive sidebar. Phase 1 instead creates a settings row lazily, with sensible defaults, and surfaces a single `/dashboard/business/settings` page where the user can edit values when they care. No feature flags, no industry-conditional modules — every Business OS module ships visible to every user.
- **Audit migration to shared writer.** Every existing `lib/agentic-os/business/repo.ts` mutation flips from the local `recordAudit` to `import { recordAudit } from '../_shared/audit.ts'` with `osSlug: 'business'`. Audit action names get the `business.*` prefix in this phase.
- **Contacts page extensions.** The shipped `/contacts` page is expanded to a hub with three tabs: People, Organizations, Recent Interactions. The existing `ContactsCrm` component is split into three sub-components but retains the same data fetch.
- **Soft-archive everywhere.** Both people and orgs get `archived_at` columns; the existing list endpoint accepts `?archived=true|false` (default false). Existing data has `archived_at = NULL` and shows by default.
- **Audit action names:** `business.org.created`, `business.org.updated`, `business.org.archived`, `business.org.restored`, `business.person.created`, `business.person.updated`, `business.person.archived`, `business.person.restored`, `business.interaction.created`, `business.interaction.updated`, `business.interaction.deleted`, `business.settings.updated`.

**Routes:**

- Existing `/api/tiresias/agentic-os/business/contacts` route is split into three top-level resources:
  * `/api/tiresias/agentic-os/business/people` (GET list — filter `?archived=`, `?tag=`, `?organization_id=`, `?q=`; POST). `/people/[id]` (GET, PATCH, DELETE soft-archive). `/people/[id]/restore` (POST).
  * `/api/tiresias/agentic-os/business/organizations` (GET, POST). `/organizations/[id]` (GET, PATCH, DELETE soft-archive). `/organizations/[id]/restore` (POST).
  * `/api/tiresias/agentic-os/business/interactions` (GET workshop feed, POST). `/interactions/[id]` (GET, PATCH, DELETE).
- The legacy `/contacts` route is preserved as a deprecated GET passthrough that joins all three (no new POST) so the existing UI keeps working during the transition.
- `/api/tiresias/agentic-os/business/settings` (GET — lazy-creates if missing, PATCH).

**Pages:**

- `/dashboard/business` — hub page. Cards: `People`, `Organizations`, `Recent activity` (the interactions feed). Phase 2-7 cards land as those phases ship.
- `/dashboard/business/people` — people list with filter chips (tag / archived toggle / search). `/people/[id]` — person detail (Phase 2 adds the deal & activity sections; Phase 3 adds projects; Phase 4 adds invoices).
- `/dashboard/business/organizations` — orgs list. `/organizations/[id]` — org detail.
- `/dashboard/business/settings` — settings editor.
- Existing `/dashboard/business/contacts` page kept as a deprecated alias that redirects to `/dashboard/business` after a 100ms client-side redirect; the rendered loading state explains the new structure.

**Components:** existing `ContactsCrm` is split into `PeopleList`, `OrganizationsList`, `RecentInteractions`. New: `PersonForm`, `PersonDetailShell`, `OrganizationForm`, `OrganizationDetailShell`, `InteractionEditor`, `BusinessSettingsForm`, `BusinessHub` (the new landing page).

**Cross-ownership safety:** every read filters by `user_id`. Settings read returns 404 only on lookup failure — never returns another user's row.

**Phase 2 seam:** the existing `agos_business_interactions` table gets the optional `deal_id` column in Phase 2; Phase 1 leaves the existing interactions untouched and routes interactions through the shared audit writer so the deal-linking patch lands cleanly.

**Phase 4 seam:** the new `agos_business_settings` row is the brand / prefix / terms / rate source for Phase 4 quote + invoice generation.

**Phase 7 seam:** Coach `general` mode reads contact / org / interaction counts from this phase's tables.

***

## Reference paths

- Registry: `apps/platform-web/src/lib/agentic-os/registry.ts`
- Existing shipped surface: `apps/platform-web/src/app/(dashboard)/dashboard/business/`, `apps/platform-web/src/lib/agentic-os/business/`, `apps/platform-web/src/components/agentic-os/business/`, `apps/platform-web/src/app/api/tiresias/agentic-os/business/`
- Existing migration: `packages/database/alembic/versions/0010_business_os.py`
- Shared primitives: `apps/platform-web/src/lib/agentic-os/_shared/` (`audit.ts`, `crud-route.ts`, `session.ts`, `types.ts`, `pdf/`, `safety/`) and `apps/platform-web/src/components/agentic-os/_shared/`
- Coach pattern anchor: `apps/platform-web/src/lib/agentic-os/maker/coach/`
- PDF pattern anchor: `apps/platform-web/src/lib/agentic-os/_shared/pdf/` + `apps/platform-web/src/lib/agentic-os/maker/pdf/`
- Storage transfer contract: `docs/architecture/mcp-storage-transfer.md`
- Legacy Perplexity epic-style plan: `apps/platform-web/content/agentic-os/business.md.legacy-epic.md` (after rename — currently still at `business.md` pending Cristian's decision on the eight open questions).
