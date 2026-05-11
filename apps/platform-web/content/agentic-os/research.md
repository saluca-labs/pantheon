# Research OS — Execution Plan

> **Status:** Plan-only. No phase has shipped yet. The only on-disk artifact is
> the Phase 3 stub (hypothesis ledger) sitting on top of migration
> `0005_research_os`, which predates the agos sequence the rest of the
> Pantheon OSes use. The phase tables below are written in the Maker OS
> "locked decisions" style so they can be lifted into the per-phase
> commit messages verbatim once execution begins.
>
> **Migration numbering:** Maker OS took revisions `0033`–`0040`. **The next
> free revision is `0041`.** Each phase below names its target revision; if
> Cristian ships an unrelated platform migration in between, slide the whole
> Research stack forward — keep the chain contiguous.
>
> Legacy ticket-style EPIC content (the original Perplexity-built outline)
> is preserved at `research.md.legacy-epic.md` for reference.

***

## 1. Inventory

### Registry entry

`apps/platform-web/src/lib/agentic-os/registry.ts` — slug `research`,
status `live`, accent `sky`, tagline *"ELN + literature + experiments."*,
description *"Electronic lab notebook, literature mapping, hypothesis
ledger, and experiment design for solo PhDs and small labs."* One feature
card today: `/dashboard/os/research/hypotheses` → Hypothesis ledger.

### Shipped surface (what already exists)

| Path | Purpose |
|---|---|
| `apps/platform-web/src/app/(dashboard)/dashboard/os/research/hypotheses/page.tsx` | Server component; loads the user's hypotheses and renders the ledger. |
| `apps/platform-web/src/app/api/tiresias/agentic-os/research/hypotheses/route.ts` | BFF — GET list / POST create with Zod body validation + audit. |
| `apps/platform-web/src/app/api/tiresias/agentic-os/research/hypotheses/[id]/route.ts` | BFF — GET / PATCH / DELETE single hypothesis (status transitions audited). |
| `apps/platform-web/src/components/agentic-os/research/HypothesisLedger.tsx` | Client component — list + create/edit form for the ledger. |
| `apps/platform-web/src/lib/agentic-os/research/hypotheses.ts` | Pure-logic helpers — `HypothesisStatus`, `ConfidenceLevel`, `renderHypothesisStatement`, `validateHypothesis`, `isValidStatusTransition`. |
| `apps/platform-web/src/lib/agentic-os/research/repo.ts` | DB repository — `listHypotheses`, `getHypothesis`, `createHypothesis`, `updateHypothesis`, `listExperiments`, `recordAudit` (writes to `agos_audit` with `os_slug='research'`). |
| `apps/platform-web/src/lib/agentic-os/research/session.ts` | Per-OS session helper — `getCurrentResearchUser`, `getResearchPool`. |
| `apps/platform-web/src/__tests__/agentic-os/research/hypotheses.test.ts` | Vitest suite on the pure-logic helpers. |

### Shipped migrations touching `agos_research_*`

| Revision | Summary |
|---|---|
| `0005_research_os` | Creates `agos_research_hypotheses` (If/Then/Because ledger with status, confidence, tags) and `agos_research_experiments` (hypothesis-as-parent, FK to hypotheses with `ON DELETE CASCADE`, fields: independent / dependent / controls / protocol / success_criteria, status `planned\|running\|done`). Predates the Maker / Filmmaker / Cyber / Health agos sequence and uses the early hypothesis-as-parent shape. |

### What is NOT yet built (everything else)

- No experiment hub page or detail page. The `agos_research_experiments`
  table exists but has no UI surface and no POST/PATCH routes — only the
  internal `listExperiments(hypothesisId)` helper is wired.
- No lab notebook entries, no per-experiment timeline.
- No literature library — papers, authors, tags, DOIs.
- No datasets, protocols, or PDF export.
- No reproducibility checklist or cross-experiment dependency graph.
- No AI coach.
- No registry hub-feature surfaces beyond Hypothesis ledger.

***

## 2. Vision

The Research OS serves **solo PhDs, postdocs, and small labs (PI + a few
trainees)** running a mixed bench / computational workflow. It is **not**
designed for industrial-scale labs with dedicated LIMS, ELN, and data-stewardship
teams — those have built-out tooling already; this OS targets the user who is
their own PI, lab manager, librarian, and data steward.

The platform stitches together five core surfaces: an **electronic lab notebook
(ELN)** for timestamped entries per experiment, a **hypothesis ledger** for
explicit prediction + falsifier tracking, a **literature library** for paper
ingestion + reading notes + per-experiment citation links, **experiment design**
with datasets and protocols, and a **reproducibility tracker** that nudges raw
data archival, methods documentation, and code publication for every active
project. An **AI coach** assists with lit review, hypothesis critique, and
methods advice without filtering content (academic prose isn't credential-sensitive
the way Cyber output is, nor crisis-adjacent the way Health output is).

Where Research differs from existing OSes: project-as-parent works (Filmmaker /
Maker pattern), but **"project" maps to "experiment"** and several entities
(ELN entries, literature refs, hypotheses) span multiple experiments. Workshop-global
tables work for the literature library (Cyber pattern). The streaming coach uses
the same wire format as Filmmaker / Maker / Cyber / Health (UTF-8 deltas,
U+001E sentinel, JSON trailer). Crucially, **hypotheses pre-date experiments**
in this OS: the existing `0005_research_os` migration models experiments as
children of hypotheses (`hypothesis_id NOT NULL FK CASCADE`). Phase 1 inverts
that to mirror the rest of the platform — see Open Question #1.

***

## 3. Phased plan

### Phase 1 — SHIPPED (v0.1.x, 2026-05-11)

**Migration shipped:** `0041_research_phase1`, down_revision
`0040_maker_phase7`.

**What landed:**

- `agos_research_experiments` promoted to a first-class per-OS project
  entity. Legacy `hypothesis_id NOT NULL FK CASCADE` relaxed to nullable
  + FK dropped (kept as an optional polymorphic pointer; Phase 3
  introduces the authoritative N:M join).
- New project-shape columns: `cover_image_url`, `description`,
  `target_completion_date`, `team_size`, `tags TEXT[]`, `phase_progress
  JSONB`, `archived_at`, `metadata JSONB`. MCP-storage column comment on
  `cover_image_url`.
- Status taxonomy widened to
  `planning | running | analysis | writeup | published | archived` with
  a CASE remap on upgrade (legacy `done` → `published`; unrecognized →
  `planning`).
- Indexes: `(user_id, status, updated_at DESC)`, GIN on `tags`, partial
  `(archived_at) WHERE archived_at IS NOT NULL`.
- BFF routes under `app/api/tiresias/agentic-os/research/experiments/`:
  GET / POST list+create, GET / PATCH / DELETE detail (soft-archive by
  default, hard delete on `?hard=true`), POST `restore`. Audited on
  every mutation with `projectId = experiment.id`.
- Pages: hub page replaced (experiments grid + quick-link to hypothesis
  ledger), standalone `/dashboard/os/research/experiments` list, and
  per-experiment detail at `/experiments/[id]` with Overview / Notebook
  (Phase 2 placeholder) / Hypotheses (Phase 3 placeholder) tabs.
  Legacy hypotheses page kept functional with a Phase 3 notice.
- Components under `components/agentic-os/research/`:
  `experiment-card.tsx`, `experiment-form.tsx`, `experiment-filters.tsx`,
  `experiment-list.tsx`, `experiment-phase-progress.tsx`.
- Registry updated: research's `features` now lists
  `Experiments hub` + `Hypothesis ledger`.
- Tests: ~120 new Vitest cases covering migration shape, experiment
  pure-helpers, repo CRUD, route gating + cross-ownership, status
  remap, soft-archive vs hard-delete, NULL `hypothesis_id` acceptance,
  GIN-on-tags filter path, registry contract.

**Open question resolutions for Phase 1:** Q1 (relax `hypothesis_id`) —
**yes**. Q2 (workshop-global hypotheses) — **yes**, prepared by Phase 1's
FK relaxation; concrete join lands Phase 3.

***

### Phase 1 — Experiment Hub + Foundation Polish

**Migration:** `0041_research_phase1`, down_revision `0040_maker_phase7`.

**Scope:** Promote `agos_research_experiments` from a child-of-hypothesis
table to the **per-OS parent** the rest of the platform expects. Mirror
Maker Phase 1 / Filmmaker Phase 1 — cover image, status enum, lifecycle,
hub page, per-experiment detail page. The current Phase 3 stub
(hypothesis ledger) remains live; this phase adds the experiment surface
without breaking it.

**Schema changes (1 ALTER + retention, all under `agos_research_*`):**

1. `agos_research_experiments` — promoted to per-OS parent. Existing
   columns retained. The `hypothesis_id UUID NOT NULL REFERENCES
   agos_research_hypotheses(id) ON DELETE CASCADE` **constraint is
   relaxed to nullable + FK dropped** (per the v0.1.30 platform contract
   — per-OS UUIDs are not FK-enforced across cross-cutting tables).
   `hypothesis_id` survives as an optional polymorphic link; the
   hypothesis-experiment join is moved to a dedicated table in Phase 3
   so an experiment can ladder multiple hypotheses.

   New columns:
   * `description TEXT NOT NULL DEFAULT ''`.
   * `cover_url TEXT` (URL-only; column comment references
     `docs/architecture/mcp-storage-transfer.md`).
   * `target_date DATE` (nullable; analogous to Maker's `target_date`).
   * `tags TEXT[] NOT NULL DEFAULT '{}'`.
   * `metadata JSONB NOT NULL DEFAULT '{}'`.
   * `archived_at TIMESTAMPTZ` (nullable; soft-archive marker).

   The existing `status` CHECK is widened from `(planned, running, done)`
   to the locked taxonomy below.

   New indexes: `(user_id, updated_at DESC)`, partial
   `(user_id) WHERE archived_at IS NULL` (active-experiments default
   list), GIN on `tags`.

**Locked decisions:**

- **Status taxonomy:** `planning \| running \| analysis \| writeup \| published \| archived`.
  Existing `done` rows migrate to `published` on upgrade (best guess for
  the bench-side meaning of the legacy value); downgrade collapses the
  new tier back to the legacy three before dropping the CHECK
  (`planning` → `planned`, `running` → `running`,
  `analysis\|writeup\|published` → `done`, `archived` → `planned`).
- **Lifecycle:** soft-archive via `archived_at` timestamp (matches
  Maker / Filmmaker). No hard delete from the UI.
- **Audit action names:** `research.experiment.created`,
  `research.experiment.updated`, `research.experiment.status_changed`,
  `research.experiment.archived`, `research.experiment.restored`.

**Routes (BFF, under `app/api/tiresias/agentic-os/research/`):**

- `GET  /experiments` — list current user's experiments. Filters:
  `?status=`, `?tag=`, `?archived=true\|false` (default false). Paginated.
- `POST /experiments` — create. Body `{ title, description?, cover_url?,
  target_date?, status?, tags? }`. Audited.
- `GET  /experiments/[id]` — full experiment payload + derived counts
  (notebook entries, hypotheses linked, references linked, datasets, etc.
  Phase-dependent fields return zero until the relevant phase ships).
- `PATCH /experiments/[id]` — title / description / cover / target_date
  / status / tags edits. Status-change writes a separate audit row.
- `DELETE /experiments/[id]` — soft archive (sets `archived_at`); a
  query parameter `?hard=true` is reserved but **not** exposed in the UI.
- `POST /experiments/[id]/restore` — clears `archived_at`.

All mutating routes audit via `recordAudit({ actorId, action:
'research.experiment.<verb>', projectId: experiment.id, payload })`.

**Pages:**

- `/dashboard/os/research` — hub. Two-column responsive grid:
  experiment list + feature cards (existing Hypothesis ledger card stays;
  later phases add cards beneath it).
- `/dashboard/os/research/experiments` — full experiment list with
  status filter chips + archived toggle.
- `/dashboard/os/research/experiments/[id]` — per-experiment detail
  with tab strip — `Overview \| Notebook \| Hypotheses \| Literature \|
  Datasets \| Protocols \| Reproducibility \| Coach`. Tabs render the
  Phase-3+ placeholder until those phases ship.

**Components:** `ExperimentList`, `ExperimentForm` (create + edit modal),
`ExperimentDetailShell`, `ExperimentStatusPill`,
`ExperimentTargetDateBadge`, `ExperimentTagInput`.

***

### Phase 2 — Lab Notebook Entries

**Migration:** `0042_research_phase2`, down_revision `0041_research_phase1`.

**Scope:** Per-experiment ELN entries — timestamped markdown body with
URL-only attachment list (figures, raw-data links, screenshots), an author
column, and a soft `entry_kind` taxonomy. Mirrors Maker Phase 3's build
step / build log shape but with two-way ENL-style framing (entries are
chronological, not phased).

**Tables (1 new, all under `agos_research_*`):**

1. `agos_research_notebook_entries` — per-experiment. `user_id NOT NULL`
   (author / lab member), `experiment_id UUID NOT NULL` (no FK — per
   platform contract; the API enforces ownership via JOIN against
   `agos_research_experiments`), `entry_kind TEXT NOT NULL DEFAULT 'note'`
   CHECK in `(note, observation, result, decision, question, todo)`,
   `title TEXT NOT NULL`, `body_md TEXT NOT NULL DEFAULT ''`,
   `attached_urls TEXT[] NOT NULL DEFAULT '{}'` (URL-only; column
   comment references the MCP storage transfer contract), `tags TEXT[]
   NOT NULL DEFAULT '{}'`, `entry_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   (separately editable from `created_at` so backfilling a paper journal
   into the system preserves the lab-time), `metadata JSONB`,
   `created_at`, `updated_at`.

   Indexes: `(experiment_id, entry_at DESC)` (timeline view),
   `(user_id, entry_at DESC)` (cross-experiment author timeline), GIN on
   `tags`, partial `(experiment_id) WHERE entry_kind = 'todo'` (open-todos
   widget).

**Locked decisions:**

- **No hard delete.** Notebook entries are append-only by tradition.
  PATCH allows edits; DELETE sets `archived_at` on the row (add nullable
  `archived_at TIMESTAMPTZ` column). Archived entries hide from the
  default timeline; the API exposes them with `?archived=true`.
- **Markdown rendering:** server-side render of `body_md` using the
  same `react-markdown` pipeline Maker uses in build-step descriptions.
  No raw HTML allowed (no `rehype-raw`).
- **Audit action names:** `research.notebook.created`,
  `research.notebook.updated`, `research.notebook.archived`,
  `research.notebook.restored`.

**Routes:**

- `/api/tiresias/agentic-os/research/experiments/[id]/notebook` (GET
  list + POST create — 404 cross-ownership).
- `/api/tiresias/agentic-os/research/notebook/[entryId]` (GET, PATCH,
  DELETE — DELETE soft-archives).
- `/api/tiresias/agentic-os/research/notebook/[entryId]/restore` (POST).

**Pages:**

- `/dashboard/os/research/experiments/[id]` → Notebook tab — chronological
  reverse-time timeline with per-entry "edit" + "archive" affordances.
  Entry composer pinned to top (collapsible). Filter chips by
  `entry_kind`.

**Components:** `NotebookTimeline`, `NotebookEntryCard`,
`NotebookEntryEditor` (markdown textarea + URL list editor +
entry_kind picker + tag input), `NotebookEntryArchivedRow`.

***

### Phase 3 — Hypothesis Ledger Integration

**Migration:** `0043_research_phase3`, down_revision `0042_research_phase2`.

**Scope:** Promote the existing stub from a flat list to a real
hypothesis-management surface. Per-hypothesis detail page with
predictions, falsifiers, and evidence links. A join table connects
hypotheses to experiments N:M (one experiment can test multiple
hypotheses; one hypothesis can be tested across multiple experiments).

**Tables (3 new + 1 ALTER, all under `agos_research_*`):**

1. `agos_research_hypotheses` (ALTER) — additive only. Adds:
   * `experiment_id UUID` (nullable; soft "primary experiment" pointer —
     legacy field for the old hypothesis-as-parent shape; new N:M join is
     authoritative).
   * `description_md TEXT NOT NULL DEFAULT ''` (longer-form rationale
     beyond the three clauses; markdown-safe).
   * `archived_at TIMESTAMPTZ` (nullable).
   No CHECK changes.

2. `agos_research_hypothesis_predictions` — per-hypothesis predictions.
   `hypothesis_id UUID NOT NULL` FK CASCADE → hypotheses, `user_id`,
   `text TEXT NOT NULL`, `kind TEXT NOT NULL DEFAULT 'positive'` CHECK
   in `(positive, negative, magnitude, direction)`, `confidence TEXT NOT
   NULL DEFAULT 'medium'` (low / medium / high — reuses the existing
   confidence enum), `metadata JSONB`, `created_at`, `updated_at`.
   Index `(hypothesis_id)`.

3. `agos_research_hypothesis_falsifiers` — what observation would
   refute. `hypothesis_id` FK CASCADE, `user_id`, `text TEXT NOT NULL`,
   `criterion_md TEXT` (the specific threshold / condition), `metadata`,
   `created_at`, `updated_at`. Index `(hypothesis_id)`.

4. `agos_research_hypothesis_evidence` — supporting/refuting evidence
   links. `hypothesis_id` FK CASCADE, `user_id`, `polarity TEXT NOT NULL`
   CHECK in `(supports, refutes, mixed)`, `source_kind TEXT NOT NULL`
   CHECK in `(notebook_entry, paper, dataset, external_url, free_text)`,
   `source_id UUID` (nullable — references the underlying row for the
   first three kinds; null for `external_url` / `free_text`),
   `source_url TEXT` (used when `source_kind = external_url`),
   `notes TEXT`, `metadata`, `created_at`. Indexes `(hypothesis_id)`,
   `(source_kind, source_id) WHERE source_id IS NOT NULL`.

5. `agos_research_experiment_hypotheses` — N:M join. `experiment_id UUID
   NOT NULL` (no FK — per platform contract), `hypothesis_id UUID NOT
   NULL` FK CASCADE → hypotheses, `role TEXT NOT NULL DEFAULT 'tests'`
   CHECK in `(tests, motivates, related)`, optional `notes`, `created_at`.
   UNIQUE `(experiment_id, hypothesis_id, role)` — no duplicate edges of
   the same role. Indexes `(experiment_id)`, `(hypothesis_id)`.

**Locked decisions:**

- **Hypotheses are workshop-global, not experiment-scoped.** (See Open
  Question #2 — this is the recommendation.) Rationale: solo PhDs
  recycle hypotheses across multiple experiments; locking each
  hypothesis to a single experiment created the legacy
  hypothesis-as-parent confusion the existing `0005_research_os`
  migration codified. Workshop-global keeps a single, dedupable ledger
  that experiments link into via the join.
- **Evidence polymorphism via `source_kind`** instead of separate
  tables for each source — matches Cyber's IOC pattern and keeps the
  join table count down. The composite `(source_kind, source_id)` index
  supports reverse-lookup ("what hypotheses cite this paper?").
- **Status transition rules** for `agos_research_hypotheses.status`
  (already locked in the shipped `hypotheses.ts` helper) are kept
  as-is. Phase 3 adds no new statuses.
- **Audit action names:** `research.hypothesis.created`,
  `research.hypothesis.updated`, `research.hypothesis.status_changed`,
  `research.hypothesis.archived`, `research.prediction.created`,
  `research.prediction.updated`, `research.falsifier.created`,
  `research.falsifier.updated`, `research.evidence.linked`,
  `research.evidence.unlinked`, `research.experiment.hypothesis.linked`,
  `research.experiment.hypothesis.unlinked`.

**Routes:**

- Existing `/hypotheses` routes accept the new optional fields on POST
  + PATCH (`description_md`, `archived`). PATCH `archived=true` sets
  `archived_at`; restore via `POST /hypotheses/[id]/restore`.
- `/api/tiresias/agentic-os/research/hypotheses/[id]/predictions` (GET
  list, POST create) + `/predictions/[predId]` (PATCH, DELETE).
- `/api/tiresias/agentic-os/research/hypotheses/[id]/falsifiers`
  (GET list, POST create) + `/falsifiers/[falsId]` (PATCH, DELETE).
- `/api/tiresias/agentic-os/research/hypotheses/[id]/evidence`
  (GET list, POST create — 400 on `source_kind=external_url` without
  `source_url`; 400 on the three internal kinds without `source_id`) +
  `/evidence/[evId]` (DELETE).
- `/api/tiresias/agentic-os/research/experiments/[id]/hypotheses` (GET
  joined, POST link — returns 409 on duplicate per the UNIQUE
  constraint) + `/[hypothesisId]` (PATCH role/notes, DELETE unlink).

**Pages:**

- `/dashboard/os/research/hypotheses` — existing list page, augmented
  with archived toggle + link to the new detail page.
- `/dashboard/os/research/hypotheses/[id]` — per-hypothesis detail
  (new). Sections: statement banner (If/Then/Because formatted),
  description, predictions list + editor, falsifiers list + editor,
  evidence panel grouped by polarity, linked experiments.
- `/dashboard/os/research/experiments/[id]` → Hypotheses tab —
  attached-hypotheses list with add picker (workshop-scoped) and
  per-row role pill + remove affordance.

**Components:** `HypothesisDetailHeader`, `PredictionEditor`,
`FalsifierEditor`, `EvidenceLinkPicker` (polymorphic — switches body
based on `source_kind`), `ExperimentHypothesisLinker`.

***

### Phase 4 — Literature Library

**Migration:** `0044_research_phase4`, down_revision `0043_research_phase3`.

**Scope:** Workshop-global literature library (mirrors Maker Phase 5
references). Papers with DOI / arXiv ID / URL, optional structured
authors, tags, reading notes per paper, and a per-experiment N:M
join. Citation-graph between papers is reserved for a future Phase 8 —
see Open Question #3.

**Tables (4 new, all under `agos_research_*`):**

1. `agos_research_papers` — workshop-global. `user_id NOT NULL`,
   `title TEXT NOT NULL`, `kind TEXT NOT NULL DEFAULT 'paper'` CHECK in
   `(paper, preprint, thesis, book, chapter, dataset_paper, report,
   blog, other)`, `doi TEXT`, `arxiv_id TEXT`, `url TEXT` (URL-only —
   column comment references the MCP storage transfer contract for the
   PDF itself), `authors_text TEXT` (free-form fallback; the structured
   authors join below is canonical when present), `venue TEXT`,
   `year INT`, `abstract_md TEXT`, `tags TEXT[] NOT NULL DEFAULT '{}'`,
   `metadata JSONB`. Indexes `(user_id, updated_at DESC)`, GIN on
   `tags`, partial UNIQUE `(user_id, doi) WHERE doi IS NOT NULL` (dedupe
   on DOI per user), partial UNIQUE `(user_id, arxiv_id) WHERE arxiv_id
   IS NOT NULL`. The DOI / arXiv UNIQUE constraints catch the common
   "I clipped this paper twice" case without blocking the manual
   no-identifier flow.

2. `agos_research_authors` — workshop-global. `user_id NOT NULL`,
   `display_name TEXT NOT NULL`, `given_name TEXT`, `family_name TEXT`,
   `orcid TEXT`, `affiliation TEXT`, `metadata JSONB`. Partial UNIQUE
   `(user_id, orcid) WHERE orcid IS NOT NULL`. Index
   `(user_id, family_name)`.

3. `agos_research_paper_authors` — join. `paper_id UUID NOT NULL` FK
   CASCADE → papers, `author_id UUID NOT NULL` FK CASCADE → authors,
   `position INT NOT NULL` (author order). UNIQUE `(paper_id, position)`
   (one author per position) + UNIQUE `(paper_id, author_id)` (no dup).

4. `agos_research_experiment_references` — join. `experiment_id UUID
   NOT NULL` (no FK), `paper_id UUID NOT NULL` FK CASCADE → papers,
   `relevance TEXT NOT NULL DEFAULT 'cites'` CHECK in `(cites, methods,
   prior_art, contradicts, builds_on)`, optional `notes`, `created_at`.
   UNIQUE `(experiment_id, paper_id, relevance)`. Indexes
   `(experiment_id)`, `(paper_id)`.

**Locked decisions:**

- **Reading notes live on Phase 2 notebook entries**, not on a separate
  `reading_notes` table. A notebook entry with `entry_kind='note'` and
  an attached `agos_research_evidence` row of kind `paper` is the
  canonical "this is what I learned from paper X" record. Reduces
  schema sprawl; reuses the Phase 2 attachment pipeline.
- **Citation graph deferred to Phase 8.** The `_references` join is
  experiment↔paper only; paper↔paper edges (citation graph view) are
  out of scope until we have a working library to graph.
- **No automatic metadata fetch from DOI / arXiv** in Phase 4 — user
  pastes the structured fields manually or uses an MCP-mediated
  importer in a later phase. This avoids carrying a CrossRef /
  arXiv-API dependency in this phase.
- **Audit action names:** `research.paper.created`,
  `research.paper.updated`, `research.author.created`,
  `research.author.linked`, `research.author.unlinked`,
  `research.paper.archived`, `research.experiment.reference.linked`,
  `research.experiment.reference.unlinked`.

**Routes:**

- `/api/tiresias/agentic-os/research/papers` (GET list — filterable by
  `kind`, `tag`, `year`, free-text search across title + authors_text;
  POST create — 409 on duplicate DOI/arXiv for the user).
- `/api/tiresias/agentic-os/research/papers/[id]` (GET, PATCH, DELETE).
- `/api/tiresias/agentic-os/research/papers/[id]/authors` (GET, POST
  link by author_id or by `{ display_name, ... }` — auto-creates author
  if no ID), `/[authorId]` (PATCH position, DELETE).
- `/api/tiresias/agentic-os/research/authors` (GET list — filter by
  `family_name` prefix; POST create).
- `/api/tiresias/agentic-os/research/authors/[id]` (GET, PATCH, DELETE
  — 409 if any paper still links).
- `/api/tiresias/agentic-os/research/experiments/[id]/references` (GET
  joined, POST link — 409 on duplicate) + `/[paperId]` (PATCH
  relevance/notes, DELETE).

**Pages:**

- `/dashboard/os/research/library` — workshop-global papers list with
  filter chips + free-text search + tag heatmap (reuses
  `_shared/components/tag-heatmap`).
- `/dashboard/os/research/library/[id]` — paper detail (metadata,
  authors, tags, abstract, linked experiments, related notebook
  entries via Phase 3 evidence rows).
- `/dashboard/os/research/authors` — workshop-global authors list.
- `/dashboard/os/research/experiments/[id]` → Literature tab —
  linked-papers list with add picker (filterable + create-new
  fallback).

**Components:** `PaperList`, `PaperForm`, `AuthorPicker`,
`PaperReferenceLinker`, `PaperAbstractCollapsible`, `AuthorChipList`.

**Hub registry card:** add `Literature library` pointing at
`/dashboard/os/research/library`.

***

### Phase 5 — Datasets + Protocols + PDF Export

**Migration:** `0045_research_phase5`, down_revision `0044_research_phase4`.

**Scope:** Per-experiment dataset registry (URL-only, MCP contract) and
workshop-global protocols / methods documents with version pinning.
Plus PDF export of an experiment summary, mirroring Maker Phase 5's
project export.

**Tables (3 new, all under `agos_research_*`):**

1. `agos_research_datasets` — per-experiment. `user_id NOT NULL`,
   `experiment_id UUID NOT NULL` (no FK), `name TEXT NOT NULL`,
   `kind TEXT NOT NULL DEFAULT 'tabular'` CHECK in `(tabular, image,
   timeseries, sequence, sim, other)`, `url TEXT NOT NULL` (URL-only;
   MCP contract — Zenodo / Dataverse / Figshare / S3 / etc.),
   `version TEXT`, `size_bytes BIGINT`, `checksum TEXT`,
   `archived BOOLEAN NOT NULL DEFAULT false` (was raw data archived
   externally — drives the reproducibility checklist in Phase 6),
   `published_doi TEXT`, `notes_md TEXT`, `tags TEXT[]`, `metadata
   JSONB`, `created_at`, `updated_at`. Indexes `(experiment_id)`,
   `(user_id, archived)`, GIN on `tags`.

2. `agos_research_protocols` — workshop-global. `user_id NOT NULL`,
   `title TEXT NOT NULL`, `version TEXT NOT NULL DEFAULT '1.0'`,
   `body_md TEXT NOT NULL DEFAULT ''`, `kind TEXT NOT NULL DEFAULT
   'method'` CHECK in `(method, sop, analysis, code_pipeline, other)`,
   `attached_urls TEXT[]`, `tags TEXT[]`, `parent_protocol_id UUID`
   (nullable; self-reference for "this is v1.1 of protocol X" — no FK
   to allow soft history), `metadata`, `created_at`, `updated_at`.
   Indexes `(user_id, kind)`, `(parent_protocol_id) WHERE
   parent_protocol_id IS NOT NULL`, GIN on `tags`.

3. `agos_research_experiment_protocols` — join. `experiment_id UUID
   NOT NULL` (no FK), `protocol_id UUID NOT NULL` FK CASCADE →
   protocols, `pinned_version TEXT NOT NULL` (the version string at
   link time — pins reproducibility), `notes`, `created_at`. UNIQUE
   `(experiment_id, protocol_id, pinned_version)`.

**Locked decisions:**

- **Datasets are per-experiment, not workshop-global.** A "dataset" in
  this OS means "the data this experiment produced (or directly
  consumed)" — that scoping is the value. A workshop-global "data
  catalogue" is out of scope; a future Saluca-built Data OS would own
  that surface.
- **Protocols pin by string, not FK.** Pinning `pinned_version =
  '1.2.0'` makes the experiment reproducible against the methods doc
  even after the protocol's `body_md` evolves. Loading a pinned
  protocol returns the parent's content unless an exact version match
  exists in the parent-protocol tree.
- **PDF export uses `_shared/pdf` primitives.** Page 1: experiment
  title, status, target date, description, tags, linked-hypothesis
  count, linked-paper count, dataset count, protocol count.
  Subsequent pages: notebook timeline (last 50 entries), hypotheses
  with predictions + falsifiers, references (grouped by relevance),
  datasets, protocols (with pinned version). Footer "Generated by
  Pantheon Research OS".
- **Audit action names:** `research.dataset.created`,
  `research.dataset.updated`, `research.dataset.archived`,
  `research.protocol.created`, `research.protocol.updated`,
  `research.protocol.version_bumped`, `research.experiment.protocol.pinned`,
  `research.experiment.protocol.unpinned`, `research.experiment.export.pdf`.

**Routes:**

- `/api/tiresias/agentic-os/research/experiments/[id]/datasets`
  (GET, POST) + `/datasets/[datasetId]` (GET, PATCH, DELETE).
- `/api/tiresias/agentic-os/research/protocols` (GET, POST) +
  `/[id]` (GET, PATCH, DELETE).
- `/api/tiresias/agentic-os/research/protocols/[id]/versions` (POST
  bump — creates a new row with `parent_protocol_id = original.id` and
  the supplied `version` + `body_md`).
- `/api/tiresias/agentic-os/research/experiments/[id]/protocols` (GET
  joined, POST pin — 409 on duplicate pin), `/[protocolId]` (PATCH
  notes, DELETE).
- `/api/tiresias/agentic-os/research/experiments/[id]/export.pdf` —
  `Content-Type: application/pdf`, `Content-Disposition: attachment;
  filename="<experiment-slug>-<YYYY-MM-DD>.pdf"`. Returns 400 when the
  experiment has no notebook entries / hypotheses / datasets /
  protocols.

**Pages:**

- `/dashboard/os/research/protocols` — workshop-global library.
- `/dashboard/os/research/protocols/[id]` — protocol detail with
  version history.
- `/dashboard/os/research/experiments/[id]` → Datasets tab + Protocols
  tab (move out of placeholders). Export-PDF button on the experiment
  header.

**PDF template:** `lib/agentic-os/research/pdf/experiment-export.tsx`
— composes the OS-agnostic `_shared/pdf` primitives.

**Hub registry cards:** add `Protocols` and `Reproducibility export`
(the latter being a thin landing page that explains the PDF flow and
shows recent exports — surfaced fully in Phase 6).

***

### Phase 6 — Reproducibility + Deadlines + Dependencies

**Migration:** `0046_research_phase6`, down_revision `0045_research_phase5`.

**Scope:** Three additive surfaces. Per-experiment **deadlines /
milestones** (mirrors Maker Phase 6), **cross-experiment dependencies**
(experiment A's results feed experiment B), and a per-experiment
**reproducibility checklist** that tracks "raw data archived", "methods
doc pinned", "code published", "preregistration filed", and friends.

**Tables (3 new + 1 ALTER, all under `agos_research_*`):**

1. `agos_research_experiment_milestones` — per-experiment.
   `experiment_id UUID NOT NULL` (no FK), `user_id`,
   `title TEXT NOT NULL`, `due_at DATE` (DATE semantics chosen on the
   same grounds as Maker Phase 6 — calendar dates round-trip cleanly
   through the routing layer), `status TEXT NOT NULL DEFAULT 'pending'`
   CHECK in `(pending, at_risk, blocked, on_track, done, missed)`,
   `priority TEXT NOT NULL DEFAULT 'medium'` CHECK in `(low, medium,
   high, critical)`, `is_blocker BOOLEAN NOT NULL DEFAULT false`,
   `blocked_reason TEXT`, `notes_md TEXT`, `completed_at TIMESTAMPTZ`,
   `metadata`. Indexes mirror Maker exactly.

2. `agos_research_experiment_dependencies` — directed edges in a
   per-user cross-experiment graph. `user_id NOT NULL`,
   `from_experiment_id UUID NOT NULL`, `to_experiment_id UUID NOT
   NULL`, `kind TEXT NOT NULL DEFAULT 'feeds'` CHECK in `(feeds,
   blocks, informs, replicates)`, `status TEXT NOT NULL DEFAULT 'open'`
   CHECK in `(open, cleared)`, `notes`, `metadata`, `created_at`,
   `updated_at`. UNIQUE `(from_experiment_id, to_experiment_id, kind)`,
   CHECK `from != to`. Indexes mirror Maker.

3. `agos_research_reproducibility_checks` — per-experiment.
   `experiment_id UUID NOT NULL` (no FK), `user_id`,
   `item_key TEXT NOT NULL` (machine name — e.g.
   `raw_data_archived`, `methods_pinned`, `code_published`,
   `preregistration_filed`, `ethics_filed`, `data_dictionary_written`,
   `analysis_reproducible`), `state TEXT NOT NULL DEFAULT 'pending'`
   CHECK in `(pending, in_progress, done, not_applicable, waived)`,
   `evidence_url TEXT` (URL-only; link to the artifact),
   `notes TEXT`, `completed_at TIMESTAMPTZ`, `metadata`. UNIQUE
   `(experiment_id, item_key)` (one row per item per experiment).
   Index `(experiment_id, state)`.

4. `agos_research_experiments` (ALTER) — adds nothing schema-wise; the
   migration adds a comment documenting the new derived rollup view
   exposed by the API (e.g. `reproducibility_score = done / (pending +
   in_progress + done)` with `not_applicable` and `waived` excluded
   from the denominator).

**Locked decisions:**

- **Checklist items are user-extensible.** The seven canonical
  `item_key`s above are seeded on experiment creation as `pending`
  rows. Users can POST additional items with arbitrary `item_key`s
  (validated as `^[a-z0-9_]+$`, max 60 chars). No CHECK constraint on
  `item_key`.
- **"Top blockers" feed (cross-experiment) is workshop-wide**, exactly
  like Maker Phase 6 — milestones in `missed`/`blocked`/overdue/
  `at_risk-within-7-days` plus `open` `blocks` dependencies. Severity
  ranking deterministic per Maker's recipe.
- **Reproducibility rollup is read-only on the API** — clients can
  fetch `/experiments/[id]/reproducibility` and get
  `{ score, items, blocking_items }`. No mutate route writes a score —
  the score is always derived from the item states.
- **Audit action names:** `research.milestone.created`,
  `research.milestone.updated`, `research.milestone.completed`,
  `research.dependency.created`, `research.dependency.cleared`,
  `research.dependency.deleted`, `research.reproducibility.updated`.

**Routes:**

- Milestones: `/api/tiresias/agentic-os/research/experiments/[id]/milestones`
  (GET, POST), `/milestones/[mid]` (PATCH, DELETE).
- Dependencies: `/api/tiresias/agentic-os/research/experiments/[id]/dependencies`
  (GET both directions, POST — 400 self-loop, 404 cross-ownership, 409
  duplicate), `/[depId]` (PATCH, DELETE).
- Top blockers: `/api/tiresias/agentic-os/research/blockers` (GET,
  `?limit=` default 25 max 100).
- Reproducibility: `/api/tiresias/agentic-os/research/experiments/[id]/reproducibility`
  (GET rollup + items), `POST` (create a new item), `PATCH /items/[itemKey]`
  (update state / evidence_url / notes / completed_at).

**Pages:**

- `/dashboard/os/research` hub → Top Blockers widget mounted alongside
  any prior widgets.
- `/dashboard/os/research/blockers` — full workshop blockers list.
- `/dashboard/os/research/experiments/[id]` → Reproducibility tab
  (move out of placeholder) with checklist UI + score badge. The
  Overview tab gets a Reproducibility score pill in the header.
- Per-experiment Dependencies tab — upstream / downstream lists with
  add picker.
- Per-experiment Milestones strip on Overview.

**Hub registry card:** add `Top blockers` pointing at
`/dashboard/os/research/blockers`.

***

### Phase 7 — AI Coach

**Migration:** `0047_research_phase7`, down_revision `0046_research_phase6`.

**Scope:** Streaming Anthropic-backed AI coach with four modes —
`lit_reviewer`, `hypothesis_critic`, `methods_advisor`, `general`. Same
one-table-with-inline-JSONB-messages shape as Maker Phase 7. No domain
output filter — see Open Question #4.

**Schema (1 new table, all under `agos_research_*`):**

1. `agos_research_coach_sessions` — `id UUID PK`, `user_id UUID NOT NULL`,
   `experiment_id UUID` nullable (per-OS UUID, no FK), `mode TEXT NOT
   NULL` CHECK in `(lit_reviewer, hypothesis_critic, methods_advisor,
   general)`, `title TEXT NOT NULL`, `messages JSONB NOT NULL DEFAULT
   '[]'` (ordered array of `{ role, content, created_at }`),
   `metadata JSONB NOT NULL DEFAULT '{}'`, `created_at`, `updated_at`.

   Indexes: `(user_id, updated_at DESC)`, partial `(experiment_id,
   updated_at DESC) WHERE experiment_id IS NOT NULL`,
   `(user_id, mode, updated_at DESC)`.

**Locked decisions:**

- **No domain output filter.** Matches Filmmaker / Maker, not Cyber
  (which redacts secrets) or Health (crisis-safety wall). Academic
  prose isn't credential-sensitive; users opt in by typing.
- **System-prompt-only guardrail** for `methods_advisor`: refuse to
  give regulated professional advice (clinical, human-subjects IRB,
  animal-use IACUC, hazardous-materials handling) and refer the user
  to their institution's review board or licensed professional. Same
  pattern as Maker's "PPE / ventilation / training" prompt rule.
- **Context loading (mode-shaped, hard-cap 50 KB pre-prompt):**
  * `lit_reviewer` (experiment optional): user's most recent 30 papers
    (title, authors_text, year, tags, abstract truncated to 400 chars)
    + the experiment's linked-references if scoped + any open
    `prior_art` `_references` rows across the workshop.
  * `hypothesis_critic` (experiment optional): user's hypotheses
    (statement + status + confidence + tags) + predictions + falsifiers
    + recent evidence. If experiment is scoped, filter to that
    experiment's linked hypotheses.
  * `methods_advisor` (experiment required): the experiment's
    description + status + linked protocols (titles + versions; first
    1 KB of body_md) + datasets summary + reproducibility item states.
  * `general` (experiment optional): experiment meta + counts only
    + workshop counts.
- **Streaming wire format:** identical to Filmmaker / Maker / Cyber /
  Health — UTF-8 deltas, U+001E sentinel, JSON trailer with
  `{ session_id }`. Returns 503 `coach_not_configured` if
  `ANTHROPIC_API_KEY` is unset (the platform-wide pattern).
- **`SYSTEM_PROMPT_VERSION = 'v1'`** — bump on material template
  edits so historical sessions can be replayed deterministically.
- **Audit action names:** `research.coach.session_created`,
  `research.coach.session_renamed`, `research.coach.session_deleted`,
  `research.coach.message_appended`.

**Routes (BFF, under `app/api/tiresias/agentic-os/research/coach/`):**

- `GET  /coach/sessions` — list. Filters `?mode=`, `?experiment_id=`,
  `?scope=workshop`. Paginated.
- `POST /coach/sessions` — create. Body `{ mode, experiment_id?,
  title?, initial_message? }`. Returns 503 `coach_not_configured` if
  the key is missing. 404 if `experiment_id` doesn't belong to caller.
  Audited.
- `GET  /coach/sessions/[sessionId]` — fetch session + transcript.
- `PATCH /coach/sessions/[sessionId]` — rename. Audited.
- `DELETE /coach/sessions/[sessionId]` — drop. Audited.
- `POST /coach/sessions/[sessionId]/messages` — append + stream
  assistant turn.
- `POST /coach/quick` — one-shot quick prompt (no persistence).

**Pages:**

- `/dashboard/os/research/coach` — coach hub. Mode picker, recent
  sessions, mode-scoped quick prompts. 503-aware empty state when
  `ANTHROPIC_API_KEY` is missing.
- `/dashboard/os/research/coach/[sessionId]` — session view with
  rename + delete affordances and mode + scope pills.
- Per-experiment Coach tab — CTA into
  `/research/coach?experiment_id=<id>&mode=methods_advisor` (default
  mode for an experiment-scoped open).

**Hub registry card:** add `AI coach`.

***

## 4. Open questions for Cristian

1. **Should Phase 1 break `agos_research_experiments.hypothesis_id`?** The
   shipped `0005_research_os` migration models experiments as children of
   hypotheses (`hypothesis_id NOT NULL FK CASCADE`). The plan above relaxes
   this to nullable + drops the FK, and moves the relationship to a
   dedicated N:M join in Phase 3. Alternative: keep the child semantics
   ("an experiment is born from one primary hypothesis") and just add the
   join table on top. Recommendation: relax it. The rest of the platform
   treats per-OS parent UUIDs as cross-cutting without FK (v0.1.30
   contract), and one experiment regularly tests multiple hypotheses in
   practice.

2. **Hypotheses workshop-global vs experiment-scoped?** Plan above goes
   workshop-global. Alternative: scope each hypothesis to a single
   experiment (simpler ownership story; matches the legacy shape).
   Recommendation: workshop-global — solo PhDs recycle hypotheses across
   experiments, and the join table accommodates the simpler case.

3. **Citation graph in Phase 4 or Phase 8?** Plan above defers paper↔paper
   citation edges until a future Phase 8. Alternative: bake the
   `agos_research_paper_citations` table into Phase 4 from day one (cheap
   to add). Recommendation: defer — the value depends on having a
   library to graph, and the import flow (where citations come from) isn't
   designed yet.

4. **Coach safety filter?** Plan above ships no domain-output filter —
   matches Filmmaker / Maker. Alternative: a methods-advisor regulatory
   filter that scans output for "should this go through IRB?"-style
   triggers and inserts a referral banner. Recommendation: skip the
   filter; rely on the system-prompt guardrail. Academic prose isn't
   credential-sensitive.

5. **Notebook entry edit-history?** Plan above allows in-place PATCH on
   `agos_research_notebook_entries` with no history. Alternative: a
   `agos_research_notebook_entry_revisions` table that captures every
   prior `body_md` on update (real-ENL legal-defensibility pattern).
   Recommendation: skip for the solo-PhD audience; if a small lab needs
   IRB-grade audit, that's a Phase 8+ addition. Decision changes the
   shape of Phase 2 if Cristian wants the revisions table.

6. **Protocol versioning shape?** Plan above uses a `parent_protocol_id`
   self-reference (each version is its own row, with a soft chain back
   to the original). Alternative: store a single row and version
   `body_md` history in a sibling table. Recommendation: self-reference
   — simpler reads, the pinned-version flow on experiments needs a
   row-per-version anyway.

7. **Reproducibility default item set?** Plan above seeds seven items:
   `raw_data_archived`, `methods_pinned`, `code_published`,
   `preregistration_filed`, `ethics_filed`, `data_dictionary_written`,
   `analysis_reproducible`. Is this the right starter set? Cristian to
   confirm or hand a curated list.

8. **Phase 4 metadata fetch — defer or include?** Plan above ships
   without DOI / arXiv auto-fetch. Alternative: bundle a CrossRef +
   arXiv-API fetcher in Phase 4 (cheap; adds two no-auth HTTP
   dependencies). Recommendation: defer — keep Phase 4 schema-pure;
   add fetchers in a Phase 4.5 patch once we know the import volume.

***

## 5. Non-goals (explicit)

- **Wet-lab inventory tracking** (reagents, plasmids, antibodies,
  freezer locations, sample aliquot trees). That's Maker OS's parts
  catalogue or a future LIMS OS — not Research.
- **HIPAA / human-subjects IRB workflow management.** Compliance with
  human-subjects research review is a regulated workflow that belongs
  in Health OS or a future Compliance OS, not bolted onto the
  experiment hub. The reproducibility checklist item `ethics_filed` is
  a pointer (URL to the user's IRB approval letter), not a workflow.
- **Grant administration, budgets, indirect-cost tracking.** That's
  Business OS — the contacts + invoicing layer scales to grant-line-item
  tracking. Research OS doesn't carry budget columns.
- **Real-time collaborative editing on notebook entries or
  protocols.** Solo / small-lab target audience — single-user writes
  with periodic save are fine. Multi-cursor live editing is a
  significant infra add that pays off only with team scale; out of
  scope until a small-lab cohort asks for it.
- **Built-in PDF viewer.** Papers and protocols are URL-only links
  per the MCP storage transfer contract. Users open PDFs in their
  browser's native viewer; the OS stores the URL, not the bytes.
- **Citation-graph visualization (paper↔paper).** Reserved for Phase
  8; Phase 4 ships experiment↔paper edges only.
- **Statistical analysis, R / Python notebook execution, or
  computational-pipeline orchestration.** Out of scope. Users link to
  their JupyterHub / Colab / nbviewer URLs from notebook entries and
  datasets.
- **Public publication / preprint upload integration (arXiv submit,
  Zenodo publish).** Out of scope. Phase 5 stores published DOIs +
  URLs; the OS doesn't broker the submission.

***

## Reference paths

- Registry: `apps/platform-web/src/lib/agentic-os/registry.ts`
- Existing shipped surface: `apps/platform-web/src/app/(dashboard)/dashboard/os/research/`, `apps/platform-web/src/lib/agentic-os/research/`, `apps/platform-web/src/components/agentic-os/research/`
- Existing migration: `packages/database/alembic/versions/0005_research_os.py`
- Shared primitives: `apps/platform-web/src/lib/agentic-os/_shared/` (audit, session, pdf, safety, types, crud-route) and `apps/platform-web/src/components/agentic-os/_shared/` (checklist, combobox, dashboard-hub, data-table, stat-card, tag-heatmap, trend-chart, wizard-form)
- Coach pattern anchor: `apps/platform-web/src/lib/agentic-os/maker/coach/`
- PDF pattern anchor: `apps/platform-web/src/lib/agentic-os/_shared/pdf/` + `apps/platform-web/src/lib/agentic-os/maker/pdf/`
- Storage transfer contract: `docs/architecture/mcp-storage-transfer.md`
- Legacy Perplexity epic-style plan: `apps/platform-web/content/agentic-os/research.md.legacy-epic.md`
