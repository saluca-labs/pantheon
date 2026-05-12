# Autobiographer OS — Execution Plan (locked decisions)

## How to Read This Doc

Autobiographer OS is the seventh vertical to be planned in the Pantheon
agentic-os family, following the shape established by Maker OS:
the **most recent phase sits at the top**, earlier phases appended
chronologically below, every section a self-contained set of locked
decisions that an executor can take straight into a build prompt.

This document is **plan-only**. No migrations, routes, or pages have
been written; the Phase-1 work below is the first thing on the build
queue. The prior epic-style draft (with the EPIC-XX-A/P/E/V ticket
breakdown) was preserved alongside this file as
[`autobiographer.md.legacy-epic.md`](./autobiographer.md.legacy-epic.md)
for reference — its style-learning prompt skeletons feed directly
into Phase 3 / Phase 4 below.

***

## Inventory — What Already Exists

**Registry entry** (`apps/platform-web/src/lib/agentic-os/registry.ts`):

- `slug: 'autobiographer'`, `status: 'live'`, accent `indigo`, icon
  `BookOpenText`. Tagline "Capture, learn voice, ghostwrite." Description
  "Capture life events, learn the user's voice, and produce ghostwritten
  chapters with full provenance." One feature card listed today, pointing
  at `/dashboard/os/autobiographer/chapters` ("Chapter capture").

**Shipped surface** (1 stub feature only — pre-Phase-1 sketch):

- `apps/platform-web/src/app/(dashboard)/dashboard/os/autobiographer/chapters/page.tsx` —
  loads the most-recent chapter for the current user and mounts the
  `ChapterEditor` component. No book/project concept yet.
- `apps/platform-web/src/components/agentic-os/autobiographer/chapter-editor.tsx` —
  client editor for one chapter (title + body + life-event sidecar).
- `apps/platform-web/src/lib/agentic-os/autobiographer/chapters.ts` —
  domain types (`Chapter`, `LifeEvent`, `CHAPTER_STATUSES`,
  `EVENT_KINDS`), word-count + reading-time helpers, validator.
  Event kinds derive from McAdams (2001) life-story narrative
  categories: `milestone | turning_point | challenge | achievement |
  relationship | place | belief | other`.
- `apps/platform-web/src/lib/agentic-os/autobiographer/repo.ts` —
  CRUD against `agos_autobiographer_chapters` + `agos_autobiographer_events`,
  plus a local `recordAudit()` helper that writes to `agos_audit` with
  `os_slug = 'autobiographer'`.
- `apps/platform-web/src/lib/agentic-os/autobiographer/session.ts` —
  thin re-export of Health OS's session helpers (`getCurrentHealthUser`
  / `getHealthPool`) so every vertical shares the same cookie + pool
  layer.
- `apps/platform-web/src/app/api/tiresias/agentic-os/autobiographer/chapters/route.ts` —
  list / create / update endpoints for the single existing stub.
- `apps/platform-web/src/__tests__/agentic-os/autobiographer/chapters.test.ts` —
  word-count + validator unit tests for the existing domain helpers.

**Existing migrations touching `agos_autobiographer_*`:**

- `0009_autobiographer_os` (`packages/database/alembic/versions/0009_autobiographer_os.py`),
  down_revision `0008_filmmaker_os`. Creates two tables:
  - `agos_autobiographer_chapters` — `id`, `user_id`, `title`,
    `body_text` (default `''`), `period_label` (free-form, e.g.
    "Childhood, 1985-1995"), `status` default `'draft'`
    (`draft | in_review | final`), `word_count`, timestamps. Index on
    `(user_id, updated_at DESC)`.
  - `agos_autobiographer_events` — `id`, `chapter_id` FK CASCADE → chapters,
    `user_id`, `kind` default `milestone` (McAdams taxonomy), `headline`,
    `detail`, `occurred_year`, `created_at`. Index on
    `(chapter_id, occurred_year ASC NULLS LAST)`.

**What is NOT yet built:**

- No concept of a **book** (per-OS project). All chapters today are
  user-global, untied to any container. Phase 1 introduces this.
- No **memory capture** layer. The current `chapters` table conflates
  raw memory and authored chapter; we need a distinct memory-fragment
  table that can fuel multiple chapters.
- No **people** table, no **consent flags**, no third-party redaction.
- No **voice samples** / **voice profile**. The legacy doc spec'd a
  style-analysis prompt chain but nothing was implemented.
- No **ghostwriting** routes, no provenance graph from chapter prose
  back to source memories.
- No **timeline / arc** view; no cross-chapter narrative tooling.
- No **AI coach** for Autobiographer (`_shared/coach/` exists from
  Filmmaker / Health / Cyber / Maker; reuse).
- No PDF export of chapters or full book (`_shared/pdf/` ready to reuse).
- No registered `agos_autobiographer_*` tables linked from
  `recordAudit({ action: 'autobiographer.*' })` apart from the two
  stub-feature actions wired into the chapters CRUD repo.

***

## Vision

Autobiographer OS is for solo memoirists, amnesia-fearing seniors who
want their story committed before it dims, families consolidating a
grandparent's oral history, and executives drafting an authorized
auto-bio. The workflow is **capture → voice-learning → ghostwrite →
verify** with provenance preserved at every step. Every paragraph in a
generated chapter cites the memory entries that sourced it, so the
final manuscript can be audited line-by-line for factual integrity.

The OS deliberately avoids being a journaling tool (Health OS owns
emotional journaling) and a publishing platform (Creator OS owns
distribution). It also draws a soft privacy perimeter: third parties
who appear in a memoir get explicit consent state, sensitive content
(trauma, abuse, mental health, legal, financial) is tagged at capture
time, and a pre-publication checklist surfaces every consent +
sensitivity gate before a chapter is locked.

Voice learning is the differentiator. The AI learns the user's
speaking and writing voice from labeled samples (capture entries the
user marks "this sounds like me") and uses that profile as a style
blueprint when ghostwriting — never as a source of facts. Style
in, facts in, prose out, citations preserved.

***

## Phase 7 — AI Coach (interviewer / chapter-drafter / narrative-critic / general) (locked decisions)

**Migration:** `0048_autobiographer_phase7`, down_revision
`0047_autobiographer_phase6`. (Offsets relative to the Autobiographer
chain; the parallel Research OS planning sub is also drafting against
the same `0041+` band — orchestrator will rebase one chain after the
other lands. The intra-OS sequence is what's locked.)

**Scope:** Streaming Anthropic-backed AI coach with four modes —
`interviewer`, `chapter_drafter`, `narrative_critic`, and `general`.
Mirrors Maker OS Phase 7 (single-table transcript, no mutating tools,
streaming wire format) and Filmmaker's coach scaffolding under
`_shared/coach/`. Lighter than Health's crisis wall, heavier than
Filmmaker's because of memoir-safety guardrails (see Coach safety
below).

**Schema (1 new table, all under `agos_autobiographer_*`):**

1. `agos_autobiographer_coach_sessions` — one row per chat session,
   transcript stored as an inline JSONB array on the row (same shape
   as Maker, not the Filmmaker / Cyber split).

   Columns: `id UUID PK`, `user_id UUID NOT NULL`, `book_id UUID`
   nullable (per-OS project UUID, NO FK — matches the v0.1.30
   platform contract), `mode TEXT NOT NULL` CHECK in
   `('interviewer','chapter_drafter','narrative_critic','general')`,
   `title TEXT NOT NULL` (auto-summarized from first turn or
   user-set), `messages JSONB NOT NULL DEFAULT '[]'` (ordered array
   of `{ role, content, created_at }`), `metadata JSONB NOT NULL
   DEFAULT '{}'` (carries the system-prompt version, the source memory
   IDs the chapter_drafter run consumed, and the voice profile id),
   `created_at`, `updated_at`.

   Indexes: `(user_id, updated_at DESC)` (recent-sessions surface),
   partial `(book_id, updated_at DESC) WHERE book_id IS NOT NULL`
   (per-book session list), `(user_id, mode, updated_at DESC)`
   (mode-filtered list).

**Coach safety policy (medium-weight — between Filmmaker and Health):**

No domain-output filter, no PII classifier — but three system-prompt
hard rules that the chapter_drafter mode in particular must honor:

1. **No fabrication.** The drafter must not invent memories, names,
   dates, or events that don't appear in the supplied memory cluster.
   If the cluster is too thin to support the requested word count,
   the model says so and offers to ask the user a clarifying question
   instead of padding.
2. **Third-party privacy.** When a person referenced in the memory
   cluster has `consent_to_publish ∈ {pending, withheld}`, the drafter
   either renders them by pseudonym (per Phase 6 redaction config) or
   refuses to name them and asks the user to resolve the consent
   state. `deceased` and `public_figure` are treated as soft-allow
   with a one-line caveat in the response footer.
3. **Trauma + sensitive material.** When a memory carries any
   `sensitive_kind` tag (sexual / abuse / mental-health / legal /
   financial / death — see Phase 6), the coach appends a footer
   recommending the user review the draft with a trusted reader or
   professional editor before locking. It does **not** refuse the
   work; the user is the authority over their own memoir. This is the
   open question — see "Open questions" §5.

**Context loading (mode-shaped, hard-capped at 50 KB pre-prompt):**

- `interviewer` (book optional, person optional): book meta + last 10
  memory entries chronologically + (if scoped to a person) the
  person's relationship row + every memory referencing them.
  Generates open-ended elicitation prompts ("You mentioned the move
  to Albuquerque — what's the first smell that brings back?").
- `chapter_drafter` (book required, chapter required): the chapter
  outline + the N memory entries linked via the
  `agos_autobiographer_chapter_sources` join (Phase 4) + the active
  voice profile JSON + people referenced (with consent state). The
  model writes a paragraph at a time and emits a citation list mapping
  each paragraph to source memory IDs; the route persists the citation
  list on the resulting `chapter_revision` row.
- `narrative_critic` (book required): chapter list + arc edges (Phase 5)
  + the locked decisions about the book's arc kind
  (chronological / thematic / character-led). Critiques pacing, repetition,
  missing transitions, voice drift.
- `general` (book optional): book meta + counts only ("This book has 8
  chapters in `drafting`, 14 memories in `triaged`, voice profile
  trained on 23 samples"). Used for stuck-author conversations.

**Routes (BFF, under `app/api/tiresias/agentic-os/autobiographer/coach/`):**

- `GET  /coach/sessions` — list. Filters: `?mode=`, `?book_id=`,
  `?scope=workshop` (Autobiographer-wide).
- `POST /coach/sessions` — create. Body
  `{ mode, book_id?, title?, initial_message? }`. Returns 503
  `coach_not_configured` if `ANTHROPIC_API_KEY` is missing. 404 if
  `book_id` doesn't belong to caller. Audited.
- `GET  /coach/sessions/[sessionId]` — fetch session + transcript.
- `PATCH /coach/sessions/[sessionId]` — rename. Audited.
- `DELETE /coach/sessions/[sessionId]` — drop. Audited.
- `POST /coach/sessions/[sessionId]/messages` — append user turn,
  stream assistant turn. Wire format matches Maker / Filmmaker / Cyber:
  plain UTF-8 deltas, U+001E sentinel, JSON trailer.
- `POST /coach/quick` — one-shot quick prompt (no persistence).

All mutating routes audit via `recordAudit({ actorId, action:
'autobiographer.coach.<verb>', payload, projectId: bookId })`.

**System prompts:** per-mode TypeScript constants under
`lib/agentic-os/autobiographer/coach/system-prompt.ts`. Each mode
carries a role framing on top of four shared hard rules:

1. Never invent memories / names / dates / events the user did not
   supply.
2. Honor `consent_to_publish` state for every person referenced.
3. Append a sensitive-content footer when any source memory carries a
   `sensitive_kind` tag.
4. Recommend a licensed professional reader for trauma-heavy drafts
   (sexual / abuse / mental-health categories specifically).

`SYSTEM_PROMPT_VERSION = 'v1'`; bump when materially changed.

**Pages:**

- `/dashboard/os/autobiographer/coach` — coach hub. Lists recent
  sessions, mode picker + per-mode quick prompts + free-form start.
  503-aware empty state when `ANTHROPIC_API_KEY` unset.
- `/dashboard/os/autobiographer/coach/[sessionId]` — session view.
  Mode pill + book scope pill on header. The `chapter_drafter` mode
  renders the citation map alongside the streamed text (each paragraph
  shows its source memory chips).
- Book detail page — `AI Coach` tab CTAs into
  `/autobiographer/coach?book_id=<id>&mode=chapter_drafter` (default
  mode for a book-scoped open).

**Hub registry card:** add `AI coach` entry to Autobiographer OS
registry features alongside the Phase 1 `Books`, Phase 2 `People`,
Phase 3 `Voice studio`, Phase 4 `Chapters`, Phase 5 `Timeline`, and
Phase 6 `Privacy review` cards.

**Cross-ownership safety:** every read filters by `user_id`. Session
ownership checked before fetch / mutation. `book_id` belonging to
another user returns 404.

***

## Phase 6 — Privacy, Consent Audit, and Redaction (locked decisions)

**Migration:** `0047_autobiographer_phase6`, down_revision
`0046_autobiographer_phase5`.

**Scope:** Three additions that make the manuscript safe to hand to
an outside reader. (1) `sensitive_kind` tagging on memory entries
and chapter revisions. (2) Per-book pseudonym map so a third party
can be globally renamed across the manuscript without rewriting the
underlying source memories. (3) A pre-publication review checklist
surfaced before a chapter or full book can be marked `locked` or
exported as the "final" PDF.

**Schema (1 ALTER + 2 new tables, all under `agos_autobiographer_*`):**

1. `agos_autobiographer_memories` (from Phase 1) — gains
   `sensitive_kinds TEXT[] NOT NULL DEFAULT '{}'`. Allowed values
   (validated app-side; Postgres array CHECK omitted to keep the
   migration cheap): `sexual | abuse | mental_health | legal |
   financial | death | medical | other`. Same column added to
   `agos_autobiographer_chapter_revisions` (Phase 4) so the user can
   tag derived prose without having to back-tag every source memory.
   GIN index on the new column for both tables.

2. `agos_autobiographer_pseudonyms` — per-book rename map. Columns:
   `id UUID PK`, `book_id UUID NOT NULL`, `user_id UUID NOT NULL`,
   `person_id UUID NOT NULL` FK CASCADE → `agos_autobiographer_people`
   (the workshop-global person), `pseudonym TEXT NOT NULL`, `notes`,
   `applied BOOLEAN NOT NULL DEFAULT false` (true once the export
   layer has actually substituted on at least one revision),
   `created_at`. UNIQUE `(book_id, person_id)` — one pseudonym per
   person per book; if you need multiple, that's a separate person
   row.

3. `agos_autobiographer_review_checks` — per-chapter (and optionally
   per-book) checklist rows. Columns: `id`, `user_id`, `book_id`,
   `chapter_id` nullable (null = book-level), `kind TEXT NOT NULL`
   CHECK in `('consent_collected','sensitive_flagged','attribution_verified',
   'redaction_applied','third_party_disclaimer','legal_reviewed')`,
   `status TEXT NOT NULL DEFAULT 'pending'` CHECK in
   `('pending','passed','waived','failed')`, `notes`, `checked_at`,
   `checked_by` (user_id of the reviewer; for self-review this is the
   author). UNIQUE `(chapter_id, kind)` where `chapter_id IS NOT NULL`,
   UNIQUE `(book_id, kind)` where `chapter_id IS NULL`.

**Routes:**

- `/api/tiresias/agentic-os/autobiographer/memories/[id]` (PATCH)
  accepts `sensitive_kinds`.
- `/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/[revId]`
  (PATCH) accepts `sensitive_kinds`.
- `/api/tiresias/agentic-os/autobiographer/books/[bookId]/pseudonyms`
  (GET, POST). `/pseudonyms/[id]` (PATCH, DELETE). POST returns 409
  on duplicate `(book_id, person_id)`.
- `/api/tiresias/agentic-os/autobiographer/books/[bookId]/review-checks`
  (GET — joined view of all checks for the book, grouped by chapter)
  + `/review-checks/[id]` (PATCH status / notes).
- `/api/tiresias/agentic-os/autobiographer/chapters/[id]/lock` (POST)
  — 400 if any required `review_check` for the chapter is not in
  `('passed','waived')`. Default required set: `consent_collected`,
  `attribution_verified`. If the chapter or any source memory carries
  any `sensitive_kind`, `sensitive_flagged` is added to required.
- Export layer (Phase 4 PDF route) consumes the pseudonym map: every
  occurrence of a `agos_autobiographer_people.canonical_name` in the
  rendered chapter is substituted with the book's pseudonym before
  layout. Substitution is recorded on each pseudonym row by flipping
  `applied = true`.

**Redaction algorithm (deterministic, exercised by unit tests):**
exact-name match against the person's `canonical_name` plus the
`aliases TEXT[]` field on the person row (added in Phase 2). No NLP
entity scrubbing in Phase 6 — that's the "Open question" in §5. The
substitution is whole-token (word-boundary regex), case-preserving for
the first letter only, applied left-to-right.

**Pages:**

- `/dashboard/os/autobiographer/privacy` — per-book privacy hub.
  Three panels: people roster with consent state (links into Phase 2
  people page), pseudonym map editor, review checklist grouped by
  chapter.
- Chapter detail page — sensitive-content badge strip above the body;
  inline editor on each revision for `sensitive_kinds`. "Lock chapter"
  button surfaces the required-check shortfall as a blocking modal.
- Memory detail page — same `sensitive_kinds` editor.
- Hub registry card: `Privacy review` pointing at
  `/dashboard/os/autobiographer/privacy`.

**Cross-ownership safety:** pseudonym creation validates that
`person_id` belongs to the same user as the `book_id`; review-checks
ownership joined on `book_id`.

***

## Phase 5 — Themes, Arcs, and Timeline (locked decisions)

**Migration:** `0046_autobiographer_phase5`, down_revision
`0045_autobiographer_phase4`.

**Scope:** A book-level **arc** primitive (chronological / thematic /
character-led) with an ordered chapter set, plus a workshop-global
**theme** taxonomy that memories and chapters can tag into. A
**timeline** view across all memories (per-book and workshop-global)
unifies the McAdams-derived `kind` axis from Phase 1 with the new
theme tags and arc membership.

**Schema (4 new tables, all under `agos_autobiographer_*`):**

1. `agos_autobiographer_themes` — workshop-global. `id`, `user_id`,
   `name UNIQUE PER USER`, `slug`, `description`, `color` (tailwind
   accent name), `created_at`. UNIQUE `(user_id, slug)`.

2. `agos_autobiographer_memory_themes` — N:M join. `memory_id` FK
   CASCADE, `theme_id` FK CASCADE. UNIQUE `(memory_id, theme_id)`.
   Index `(theme_id)`.

3. `agos_autobiographer_chapter_themes` — N:M join. `chapter_id` FK
   CASCADE → `agos_autobiographer_chapters` (the Phase 4 chapter
   table, not the stub `agos_autobiographer_chapters` from migration
   0009 — see migration plan note below). `theme_id` FK CASCADE.
   UNIQUE `(chapter_id, theme_id)`. Index `(theme_id)`.

4. `agos_autobiographer_arcs` — per-book. `id`, `user_id`, `book_id`
   NOT NULL, `title`, `kind TEXT NOT NULL DEFAULT 'chronological'`
   CHECK in `('chronological','thematic','character_led','custom')`,
   `description`, `metadata JSONB`, `created_at`, `updated_at`. Plus
   companion `agos_autobiographer_arc_chapters` join with
   `arc_id`, `chapter_id`, `position INT NOT NULL`, UNIQUE
   `(arc_id, chapter_id)`, UNIQUE `(arc_id, position)`. Index
   `(arc_id, position)`.

**Migration plan note:** Phase 4 creates a new `chapters` table under
the book-scoped model; the legacy `agos_autobiographer_chapters` from
migration 0009 is renamed to `agos_autobiographer_chapters_legacy` in
the Phase 4 migration and its data is migrated forward into the new
schema. Phase 5 joins target the Phase 4 table.

**Routes:**

- `/api/tiresias/agentic-os/autobiographer/themes` (GET, POST).
  `/themes/[id]` (GET, PATCH, DELETE).
- `/api/tiresias/agentic-os/autobiographer/memories/[id]/themes`
  (GET joined, POST link — 409 duplicate) +
  `/memories/[id]/themes/[themeId]` (DELETE).
- `/api/tiresias/agentic-os/autobiographer/chapters/[id]/themes`
  symmetrical.
- `/api/tiresias/agentic-os/autobiographer/books/[bookId]/arcs`
  (GET, POST). `/arcs/[id]` (GET, PATCH, DELETE).
- `/api/tiresias/agentic-os/autobiographer/arcs/[id]/chapters`
  (GET joined ordered, POST attach with `position`, PATCH reorder via
  array of `{chapter_id, position}`, DELETE single chapter).
- `/api/tiresias/agentic-os/autobiographer/books/[bookId]/timeline`
  (GET) — composite endpoint returning memories ordered by
  `when_in_life_year ASC NULLS LAST, created_at ASC`, with arc
  membership and theme tags attached. `?scope=workshop` switch
  returns the cross-book feed.

**Pages:**

- `/dashboard/os/autobiographer/timeline` — vertical scroll timeline
  across all memories. Filter chips: theme, kind (McAdams), book,
  decade, person referenced. Workshop-wide by default; per-book filter
  in URL.
- Book detail page — new `Arcs` tab. Drag-to-reorder chapter list per
  arc (`@dnd-kit`-driven, same primitive Filmmaker storyboards use).
  Multiple arcs per book allowed; the user picks one as the "primary"
  arc which drives the default chapter ordering on the book hub.
- Memory + chapter edit pages — Themes picker (multi-select chip
  input).
- Hub registry cards: `Timeline` pointing at
  `/dashboard/os/autobiographer/timeline`.

**Cross-ownership safety:** all theme/arc operations filter by
`user_id`. Arc chapter attachment validates `chapter_id` belongs to
the same book as the arc (404 if not).

***

## Phase 4 — Chapters, Revisions, and Provenance (locked decisions)

**Migration:** `0045_autobiographer_phase4`, down_revision
`0044_autobiographer_phase3`.

**Scope:** A first-class **chapter** entity scoped to a book, with
versioned **revisions** (so a ghostwritten draft and the user's
hand-edit live side by side), and a **provenance join** mapping each
chapter revision to the memory entries that sourced it. PDF export
per chapter and per book using the `_shared/pdf/` primitive.

**Schema (3 new tables + 1 rename, all under `agos_autobiographer_*`):**

1. **Rename:** `agos_autobiographer_chapters` (from migration 0009) →
   `agos_autobiographer_chapters_legacy`. Data migration: for each
   legacy row, insert a corresponding new `agos_autobiographer_chapters`
   row (see #2) under the user's default book (created on demand;
   title "Untitled" if no book exists yet), and insert one
   `agos_autobiographer_chapter_revisions` row with `version = 1`
   carrying the legacy `body_text`. The legacy `agos_autobiographer_events`
   table is preserved as-is and remains the source of truth for
   structured event anchors (rebound via FK to the new chapters table).

2. `agos_autobiographer_chapters` (new) — book-scoped. Columns: `id`,
   `user_id NOT NULL`, `book_id UUID NOT NULL` FK CASCADE →
   `agos_autobiographer_books` (Phase 1), `title`, `slug` (per-book
   unique), `position INT NOT NULL` (default 0, used for default
   ordering when no arc is chosen), `status TEXT NOT NULL DEFAULT
   'outline'` CHECK in `('outline','drafting','revised','locked')`,
   `summary TEXT`, `target_word_count INT`, `metadata JSONB`,
   `created_at`, `updated_at`. UNIQUE `(book_id, slug)`, UNIQUE
   `(book_id, position)`. Index `(user_id, updated_at DESC)`.

3. `agos_autobiographer_chapter_revisions` — versioned prose.
   Columns: `id`, `chapter_id` FK CASCADE → chapters, `user_id NOT
   NULL`, `version INT NOT NULL`, `author TEXT NOT NULL DEFAULT
   'user'` CHECK in `('user','coach')` (a coach revision is what the
   ghostwriter produced; a user revision is hand-edited), `body_text
   TEXT NOT NULL DEFAULT ''`, `word_count INT NOT NULL DEFAULT 0`,
   `summary TEXT`, `citations JSONB NOT NULL DEFAULT '[]'` (array of
   `{paragraph_index, memory_ids:[...] }`), `coach_session_id UUID`
   nullable (when `author = 'coach'`, points at the Phase 7 session
   that produced it; no FK so the session table can be added later
   without circular ordering), `metadata`, `created_at`. UNIQUE
   `(chapter_id, version)`. Index `(chapter_id, version DESC)`.

4. `agos_autobiographer_chapter_sources` — N:M provenance join from
   chapter to memory. `id`, `chapter_id` FK CASCADE → chapters,
   `memory_id` FK CASCADE → `agos_autobiographer_memories` (Phase 1),
   `weight REAL NOT NULL DEFAULT 1.0` (used by the chapter_drafter
   coach to prioritize), `notes`. UNIQUE `(chapter_id, memory_id)`.
   Indexes `(chapter_id)`, `(memory_id)`. This is the table the
   provenance footnote system reads from.

**Routes:**

- `/api/tiresias/agentic-os/autobiographer/books/[bookId]/chapters`
  (GET ordered by position, POST create — assigns next position).
- `/api/tiresias/agentic-os/autobiographer/chapters/[id]` (GET, PATCH
  — title/slug/status/summary/target_word_count/position, DELETE).
- `/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions`
  (GET list, POST create — auto-bumps `version`). The chapter
  drafter coach (Phase 7) POSTs a revision with `author = 'coach'`,
  `coach_session_id`, and `citations`.
- `/api/tiresias/agentic-os/autobiographer/chapters/[id]/revisions/[revId]`
  (GET, PATCH body / citations / summary / sensitive_kinds —
  sensitive added in Phase 6, DELETE).
- `/api/tiresias/agentic-os/autobiographer/chapters/[id]/sources`
  (GET joined memories, POST link with weight, DELETE single).
- `/api/tiresias/agentic-os/autobiographer/chapters/[id]/export.pdf`
  — Content-Type application/pdf, filename
  `<book-slug>-ch<NN>-<chapter-slug>-<YYYY-MM-DD>.pdf`. Uses the
  latest revision (or `?revision=N`). Returns 400 if the chapter has
  no revisions.
- `/api/tiresias/agentic-os/autobiographer/books/[bookId]/export.pdf`
  — full-book PDF; concatenates chapters in arc order (Phase 5)
  falling back to `position` ordering, applies Phase 6 pseudonym map,
  appends a provenance appendix (every cited memory listed with its
  chapter reference).

**PDF template:** `lib/agentic-os/autobiographer/pdf/chapter-export.tsx`
and `book-export.tsx` — composes the `_shared/pdf/` primitives. Page 1
of a book covers title + author + status + chapter count + word count.
Chapter pages render the revision body with paragraph-level footnotes
linking to the cited memories ("¹ from memory M-2024-08-13 'first
move to Albuquerque'"). Footer per page: "Generated by Pantheon
Autobiographer OS — provenance preserved".

**Pages:**

- `/dashboard/os/autobiographer/books/[bookId]` — book detail. Chapter
  list with status pills + word count + last-updated. Drag-to-reorder
  by `position` (gated behind "primary arc is default").
- `/dashboard/os/autobiographer/chapters/[id]` — chapter detail.
  Three-column layout: revision history rail (left), active revision
  prose (center), source-memory chips with citation count (right).
- Existing `/dashboard/os/autobiographer/chapters` stub page — kept as
  a workshop-wide chapter index for backward compatibility, scope
  remains user-global with a book filter chip.
- Hub registry cards: `Chapters` pointing at the workshop chapter
  index (unchanged target), with the new book hub linked from the
  Phase 1 `Books` card.

**Cross-ownership safety:** every read filters by `user_id`. Chapter
creation requires `book_id` belongs to caller. Source linking requires
`memory_id` belongs to caller.

***

## Phase 3 — Voice Samples and Voice Profile (locked decisions)

**Migration:** `0044_autobiographer_phase3`, down_revision
`0043_autobiographer_phase2`.

**Scope:** Two tables. (1) Per-user **voice samples** — paragraphs
of the user's own writing labeled "this sounds like me", optionally
sourced from existing memory entries. (2) A versioned **voice
profile** that aggregates style markers across the samples into a
single JSON blueprint the Phase 7 chapter_drafter consumes.

**Architectural decision (locked, see Open Questions §5 for context):**
Voice profile is stored as **structured JSON style markers** (cadence,
vocabulary, common phrases, syntactic preferences, example openings)
— not a fine-tuned model, not a raw embedding. The Phase 7 drafter
also retrieves 1-2 short verbatim sample excerpts at generation time
(RAG-flavored few-shot), so the profile is the spine and the samples
are the flesh. The legacy doc's three-prompt chain
(analyze-sample → aggregate-profile → generate-with-profile) maps
directly onto this.

**Schema (2 new tables, all under `agos_autobiographer_*`):**

1. `agos_autobiographer_voice_samples` — `id`, `user_id NOT NULL`,
   `memory_id UUID` nullable FK CASCADE → memories (when sourced from
   an existing memory, this is the link; otherwise it's a free-typed
   sample), `title`, `body_text TEXT NOT NULL`, `word_count INT NOT
   NULL`, `is_archived BOOLEAN NOT NULL DEFAULT false`, `metadata
   JSONB`, `created_at`, `updated_at`. Index `(user_id, updated_at
   DESC)`, partial `(memory_id) WHERE memory_id IS NOT NULL`.

2. `agos_autobiographer_voice_profiles` — versioned. `id`, `user_id
   NOT NULL`, `version INT NOT NULL`, `is_active BOOLEAN NOT NULL
   DEFAULT false`, `style_summary TEXT NOT NULL` (3–6 sentence prose
   description), `style_adjectives TEXT[] NOT NULL DEFAULT '{}'`,
   `style_rules JSONB NOT NULL DEFAULT '[]'` (array of imperative
   strings), `example_openings JSONB NOT NULL DEFAULT '[]'` (array
   of short sample openings), `sample_count INT NOT NULL`,
   `sample_word_count INT NOT NULL`, `built_at TIMESTAMPTZ NOT NULL
   DEFAULT now()`, `builder TEXT NOT NULL DEFAULT 'coach'` (the model
   that built it, e.g. coach session id or "manual"), `metadata`. At
   most one row per user has `is_active = true` (enforced via partial
   UNIQUE index `(user_id) WHERE is_active = true`). Index `(user_id,
   version DESC)`.

**Routes:**

- `/api/tiresias/agentic-os/autobiographer/voice-samples` (GET, POST
  — body accepts `memory_id?` for backed samples or `body_text` for
  free-typed). `/voice-samples/[id]` (GET, PATCH, DELETE).
- `/api/tiresias/agentic-os/autobiographer/voice-profiles` (GET list,
  POST build — fires the analyze-and-aggregate prompt chain against
  the user's active samples and returns the new profile row).
- `/api/tiresias/agentic-os/autobiographer/voice-profiles/[id]` (GET,
  PATCH `is_active` flip, DELETE — soft archive).
- `/api/tiresias/agentic-os/autobiographer/voice-profiles/[id]/activate`
  (POST) — convenience that flips `is_active = true` on this row and
  `false` on all others in a single transaction.

**Voice profile builder:** `lib/agentic-os/autobiographer/voice/builder.ts`
implements the two-stage prompt chain from the legacy doc:

1. Per-sample style analysis (single-pass JSON extraction of tone,
   sentence structure, vocabulary, pacing, POV, imagery, dialogue
   usage, paragraph structure, style adjectives).
2. Multi-sample aggregation into a single profile (style_summary,
   style_rules, style_adjectives, example_openings).

Both stages go through the shared `_shared/coach/` LLM client so the
provider is swappable. The builder writes the new profile with
`builder = '<coach-session-id>'` and increments `version`.

**Pages:**

- `/dashboard/os/autobiographer/voice` — Voice Studio. Three panels:
  sample list (mark / unmark, source link to memory, archive),
  profile list (versions with built_at + sample_count, "Activate"
  CTA, "View JSON" expander), "Build profile from N active samples"
  CTA that fires the builder route.
- Memory detail page — "Mark as voice sample" toggle that creates a
  backed sample row pointing at the memory.
- Hub registry card: `Voice studio` pointing at
  `/dashboard/os/autobiographer/voice`.

**Cross-ownership safety:** all reads filter by `user_id`. Sample
backed by `memory_id` validates ownership.

***

## Phase 2 — People, Relationships, and Consent (locked decisions)

**Migration:** `0043_autobiographer_phase2`, down_revision
`0042_autobiographer_phase1`.

**Scope:** Workshop-global **people** table (mom, dad, siblings,
friends, mentors, public figures). Each person carries a
`consent_to_publish` state. N:M join from memories to people so a
memory like "first move to Albuquerque" can attribute mom + dad +
sibling without copying the relationship into every memory.
Workshop-global rather than per-book because the same person appears
across multiple books in a family-history workflow.

**Schema (2 new tables, all under `agos_autobiographer_*`):**

1. `agos_autobiographer_people` — workshop-global. `id`, `user_id
   NOT NULL`, `canonical_name TEXT NOT NULL`, `aliases TEXT[] NOT
   NULL DEFAULT '{}'` (used by Phase 6 redaction), `relation TEXT`
   (free-form: mother, friend, mentor, colleague, public_figure,
   etc.), `birth_year INT`, `death_year INT`, `consent_to_publish
   TEXT NOT NULL DEFAULT 'pending'` CHECK in
   `('granted','pending','withheld','deceased','public_figure',
   'not_applicable')`, `consent_recorded_at TIMESTAMPTZ`,
   `consent_recorded_by TEXT` (free-form attribution: "verbal,
   2026-04-12" / "email, on file" / "n/a"), `notes`, `image_url`
   (URL-only per `docs/architecture/mcp-storage-transfer.md`),
   `metadata JSONB`, `created_at`, `updated_at`. UNIQUE
   `(user_id, lower(canonical_name))`. Index `(user_id,
   consent_to_publish)`.

2. `agos_autobiographer_memory_people` — N:M. `memory_id` FK CASCADE,
   `person_id` FK CASCADE, `role TEXT` (free-form: protagonist,
   witness, antagonist, mentioned, etc.), `notes`. UNIQUE
   `(memory_id, person_id)`. Index `(person_id)`.

**Routes:**

- `/api/tiresias/agentic-os/autobiographer/people` (GET list,
  filterable by `consent_to_publish` / `relation` / search; POST
  create — 409 on duplicate canonical_name per user).
- `/api/tiresias/agentic-os/autobiographer/people/[id]` (GET with
  joined memory count, PATCH, DELETE — CASCADE removes joins).
- `/api/tiresias/agentic-os/autobiographer/people/[id]/consent`
  (POST) — convenience that flips `consent_to_publish`,
  `consent_recorded_at = now()`, and `consent_recorded_by = body`.
  Audited.
- `/api/tiresias/agentic-os/autobiographer/memories/[id]/people` (GET
  joined, POST link with optional role) +
  `/memories/[id]/people/[personId]` (PATCH role/notes, DELETE).

**Pages:**

- `/dashboard/os/autobiographer/people` — workshop people roster
  with consent badge per row, filter chips (pending / withheld /
  granted / deceased / public-figure / N/A), search.
- `/dashboard/os/autobiographer/people/[id]` — person detail.
  Cover image + relation + birth/death year, consent state + history,
  list of memories mentioning them with role chips, list of books
  they appear in (computed via memory→chapter→book).
- Memory detail page — People picker (multi-select with create-new
  affordance).
- Hub registry card: `People` pointing at
  `/dashboard/os/autobiographer/people`.

**Cross-ownership safety:** every read filters by `user_id`. Memory↔
person linking validates both rows belong to caller.

***

## Phase 1 — Shipped (locked decisions, build executed)

The Phase 1 plan below was carried out end-to-end. The locked decisions
that landed in code, with their concrete artifacts, are:

- **Books-as-projects.** `agos_autobiographer_books` is the per-OS project
  entity (5-status taxonomy: drafting / revising / done / paused / archived).
- **Workshop-global memories with optional book attachment.**
  `agos_autobiographer_memories` is keyed by `(user_id, optional book_id)`;
  `book_id` is `ON DELETE SET NULL` so memories survive book deletion.
- **Hard lock-chapter gate** — Phase 6 will enforce; Phase 1 plants the
  schema fields (`is_sensitive`, source taxonomy, era + emotion + content
  tag arrays) the gate will read.
- **Trauma coach policy** — Phase 7 will execute; Phase 1 unaffected.
- **Voice profile shape** (JSON markers + RAG few-shot) — Phase 3 will
  ship; Phase 1 unaffected.
- **Audio: transcript-only** for v1 — `transcript TEXT` + `audio_url TEXT`
  columns land on the memory row per MCP contract; no whisper integration.
- **Default coach mode: interviewer** — Phase 7 will ship; Phase 1 unaffected.
- **Phase progress mirror of Maker.** Books carry a `phase_progress JSONB`
  with one int 0-100 per non-archived status (drafting / revising / done /
  paused).

**Phase 1 deliverables (in branch `feat/autobiographer-phase1`):**

- Migration `0041_autobiographer_phase1` — two new tables under
  `agos_autobiographer_*`, idempotent DDL, reversible downgrade.
- Lib: `books.ts`, `books-repo.ts`, `memories.ts`, `memories-repo.ts`,
  plus an extended `recordAudit` that carries `projectId` for book-scoped
  audits.
- API routes:
  `/api/tiresias/agentic-os/autobiographer/books`,
  `/books/[id]`,
  `/books/[id]/memories`,
  `/memories`,
  `/memories/[id]`.
- Pages:
  `/dashboard/os/autobiographer` (hub),
  `/dashboard/os/autobiographer/books/[id]`,
  `/dashboard/os/autobiographer/memories`,
  `/dashboard/os/autobiographer/memories/[id]`,
  plus a soft-notice update on the legacy chapters page.
- Components: `book-card`, `book-list`, `book-form`, `book-actions`,
  `memory-card`, `memory-list`, `memory-filters`, `memory-form`,
  `memory-actions`, `memory-edit-button`.
- Registry entry updated — `Books` + `Memory captures` + retained
  `Chapter capture` (legacy).

**Legacy `agos_autobiographer_chapters`** table (from migration 0009) is
left in place. Phase 4 will introduce the book-scoped chapter entity in
a new table and migrate forward.

***

## Phase 1 — Books and Memory Capture (locked decisions)

**Migration:** `0041_autobiographer_phase1`, down_revision
`0040_maker_phase7`. (See migration band note at the top of this
doc — the parallel Research OS planner is also drafting against the
`0041+` band; orchestrator will rebase one chain after the other
merges. Intra-OS sequencing is locked: Autobiographer Phase 1 → Phase
7 is `0041 → 0048`.)

**Scope:** Promote a **book** to a first-class container (mirrors
Maker's project hub from Phase 1 there). Introduce a distinct
**memory captures** table — the raw atomic memory entries that fuel
ghostwriting later — separate from the legacy `chapters` table.
Memories carry markdown body, optional photo URL, optional audio URL,
free-form `when_in_life` label + parsed `when_in_life_year` integer,
location, and a `kind` taxonomy reusing the McAdams categories already
shipped in migration 0009. People links arrive in Phase 2; themes
arrive in Phase 5.

**Schema (2 new tables, all under `agos_autobiographer_*`):**

1. `agos_autobiographer_books` — per-user (per-OS project). Columns:
   `id UUID PK`, `user_id UUID NOT NULL`, `title TEXT NOT NULL`,
   `slug TEXT NOT NULL`, `subtitle TEXT`, `description TEXT`,
   `status TEXT NOT NULL DEFAULT 'drafting'` CHECK in
   `('drafting','revising','done','paused','archived')`,
   `target_word_count INT`, `cover_image_url TEXT`
   (URL-only per `docs/architecture/mcp-storage-transfer.md`),
   `tags TEXT[] NOT NULL DEFAULT '{}'`, `metadata JSONB NOT NULL
   DEFAULT '{}'`, `created_at`, `updated_at`. UNIQUE `(user_id,
   slug)`. Indexes `(user_id, status, updated_at DESC)`, GIN on
   `tags`.

2. `agos_autobiographer_memories` — atomic memory captures.
   Columns: `id UUID PK`, `user_id UUID NOT NULL`, `book_id UUID`
   nullable (memories can be workshop-global, attached later — see
   scope decision below), `kind TEXT NOT NULL DEFAULT 'milestone'`
   CHECK in `('milestone','turning_point','challenge','achievement',
   'relationship','place','belief','reflection','other')` (the
   McAdams set from migration 0009 plus a `reflection` bucket for
   non-event memories), `title TEXT NOT NULL`, `body_md TEXT NOT
   NULL DEFAULT ''`, `when_in_life TEXT` (free-form: "around 1985",
   "high school years"), `when_in_life_year INT` (parsed best-effort
   for timeline ordering — Phase 5 falls back to `created_at` when
   null), `location TEXT`, `photo_url TEXT`, `audio_url TEXT` (both
   URL-only per `docs/architecture/mcp-storage-transfer.md`),
   `transcript TEXT` (when audio is supplied, the transcript lives
   here — see Open Question §5 for the transcription pipeline),
   `is_voice_sample BOOLEAN NOT NULL DEFAULT false` (mirror flag,
   the source of truth is the Phase 3 voice-samples table; this is
   a denormalized read shortcut), `tags TEXT[] NOT NULL DEFAULT
   '{}'`, `metadata JSONB`, `created_at`, `updated_at`. Indexes
   `(user_id, updated_at DESC)`, partial `(book_id, when_in_life_year
   ASC NULLS LAST) WHERE book_id IS NOT NULL`, GIN on `tags`,
   GIN on `metadata`.

**Scoping decision — memories are workshop-global with optional book
attachment.** Justification: family-history use cases routinely have
the same memory cluster (a grandmother's wedding day) feed multiple
books (one daughter's memoir + one grandfather's bio). Per-book-only
storage would force the user to duplicate. Workshop-global with a
nullable `book_id` keeps the simple solo-memoirist case ergonomic
(everything they capture is just "my memories") while preserving the
family-history power case. The chapter_drafter coach (Phase 7) only
draws from memories where `book_id = <target_book>` OR `book_id IS
NULL`, so workshop-global memories are implicitly available to every
book.

**Routes:**

- `/api/tiresias/agentic-os/autobiographer/books` (GET, POST). `/books/[id]`
  (GET, PATCH, DELETE — CASCADE on memory rows where `book_id =
  <this>` is **not** applied; instead the migration's FK is `ON
  DELETE SET NULL`, so deleting a book detaches memories rather than
  destroying them).
- `/api/tiresias/agentic-os/autobiographer/memories` (GET list,
  filters: `?book_id=`, `?kind=`, `?year_from=`, `?year_to=`, `?tag=`,
  `?q=` (substring search over title + body_md), default page size 25;
  POST create).
- `/api/tiresias/agentic-os/autobiographer/memories/[id]` (GET, PATCH,
  DELETE).
- `/api/tiresias/agentic-os/autobiographer/memories/[id]/attach`
  (POST `{book_id}`) — convenience that sets `book_id` on a
  workshop-global memory. Returns 404 if the book doesn't belong to
  caller, 409 if the memory is already attached to a different book
  (the user must detach first by PATCHing `book_id` to null).

**Audit:** every mutating route calls `recordAudit({ actorId, action:
'autobiographer.book.<verb>' | 'autobiographer.memory.<verb>',
projectId: bookId, payload })` against the existing shared `agos_audit`
table.

**Pages:**

- `/dashboard/os/autobiographer/books` — book grid. Each card shows
  cover image, title, status, target word count + current word count
  rollup across chapters, last-updated. "New book" CTA.
- `/dashboard/os/autobiographer/books/[bookId]` — book detail. Lifts
  to live once Phase 4 ships chapters; in Phase 1 it shows book meta +
  the list of attached memories (and a quick "Attach existing memory"
  picker).
- `/dashboard/os/autobiographer/memories` — workshop memories list
  with filter chips (book / kind / decade / tag) and search.
- `/dashboard/os/autobiographer/memories/[memoryId]` — memory detail.
  Body editor (markdown), photo URL, audio URL + transcript text area,
  when_in_life + parsed year, location, kind picker, tag chips. Phase
  2 will mount the people picker here; Phase 3 the "Mark as voice
  sample" toggle; Phase 5 the themes picker; Phase 6 the
  sensitive-kinds editor.
- Existing `/dashboard/os/autobiographer/chapters` stub page — kept,
  but the editor is updated to require a `book_id` on the chapter
  row going forward (Phase 4 finishes the migration). Pre-Phase-4
  chapters from the legacy table render as before so we don't break
  the live registry card.
- Hub registry cards added: `Books` pointing at
  `/dashboard/os/autobiographer/books`, `Memories` pointing at
  `/dashboard/os/autobiographer/memories`. Existing `Chapter capture`
  card retained.

**Cross-ownership safety:** every read filters by `user_id`. Memory
`attach` route validates `book_id` ownership.

**URL columns** (`cover_image_url`, `photo_url`, `audio_url`) follow
the established URL-only convention with column comments referencing
`docs/architecture/mcp-storage-transfer.md`.

***

## Open Questions for Cristian

1. **Voice-profile architecture.** Locked Phase-3 choice is
   "structured JSON markers + RAG-style few-shot at generation time"
   over (a) fine-tuned model per user or (b) pure embedding/RAG over
   samples. JSON+RAG is portable across providers, cheap to rebuild,
   and easy to audit. Confirm — or flip to (a)/(b) before Phase 3
   build.

2. **Consent gate for "lock chapter".** Phase 6 currently requires
   `consent_collected` + `attribution_verified` (+ `sensitive_flagged`
   when any source carries a sensitive tag). Should `lock` be an
   actual block, or a soft warning the user can override (the existing
   plan blocks)? Soft override would match how Maker handles
   `is_blocker` milestones; hard block matches Health's crisis wall.
   Memoir consent feels closer to legal exposure than crisis safety —
   recommend keeping the hard block but want explicit signoff.

3. **Audio capture pipeline.** Phase 1 has `audio_url` + `transcript`
   columns but no opinion on how `transcript` gets populated. Three
   options: (a) **transcript-only** — the user pastes their own STT
   output, we never see the raw audio (cheapest, sovereignty-friendly);
   (b) **whisper-on-platform** — we call OpenAI Whisper / Anthropic /
   local whisper.cpp at upload time and store the result on the row;
   (c) **MCP-mediated** — the platform sends the URL to the user's
   MCP and the result comes back over the existing storage-transfer
   contract. (c) matches the established `mcp-storage-transfer.md`
   pattern but requires every user to have a Whisper-capable MCP.
   Recommend (a) for v1, (c) once the MCP catalogue includes a
   Whisper service.

4. **Third-party redaction strength.** Phase 6 ships exact-name +
   aliases token replacement (whole-word regex). Should v1 also do
   NLP entity scrubbing (spaCy/transformers NER pass to catch "Mom"
   / "my brother" / pronoun-bound references)? NER is materially more
   work, materially better at protecting privacy, and brings a new
   dependency. Recommend: ship exact-name in Phase 6, add an "NER
   review" tab in Phase 6.5 if Cristian wants it before the OSS
   launch.

5. **Trauma-content coach policy.** Phase 7 currently *appends a
   footer* recommending a human editor for sensitive-tagged drafts
   but does not refuse to write. Alternatives: (a) refuse outright
   (matches Health's crisis wall, but Autobiographer's user is the
   author of their own trauma — too paternalistic in my read), (b)
   refuse only for the `sexual` + `abuse` sensitive kinds, (c) require
   a one-time per-book opt-in toggle ("I am working through hard
   material intentionally") before the drafter will produce
   sensitive-tagged prose. Recommend (c); locks the answer at the
   book level so the user gives informed consent once.

6. **Coach default mode.** Phase 7 doesn't pick a default mode for
   "open coach on a new book". Options: `interviewer` (helps the user
   capture more) or `chapter_drafter` (helps the user draft). I'd
   default to `interviewer` until the book has ≥10 memories, then
   `chapter_drafter`. Want signoff.

7. **Migration ordering with Research OS.** Both plans claim
   `0041+`. Confirm orchestrator will rebase one chain after the
   other (this doc is internally consistent at `0041–0048` and trivial
   to bump).

***

## Non-Goals (Explicit)

- **Publishing / distribution / promotion.** PDF export per chapter
  and per book is the terminal artifact. Creator OS handles
  newsletters, blogs, social, audiobooks, distribution.
- **Emotional journaling for mental-health processing.** Health OS
  owns the daily journal, mood entries, CBT, screeners, and the
  crisis wall. Autobiographer memories are *facts the user wants to
  preserve in writing*, not *processing of a current emotional state*.
- **Family-tree genealogy / ancestor research.** No `agos_autobiographer_relatives`
  graph, no Gedcom import, no DNA / ancestry integrations. A future
  Genealogy OS would own this; Autobiographer people are limited to
  who is named in the author's memories.
- **Multi-author / collaborative books.** v1 is single-author. A
  family member can be granted view access via the existing
  org/tenant model if it lands, but co-authoring a book is out of
  scope.
- **Ghost-voice cloning (audio).** Whisper-style STT is in-scope for
  Phase 1; producing audio of the author reading their own book is
  Creator OS or a future Audiobook OS.
- **Print-on-demand fulfillment.** The Saluca Prints / Lulu pipeline
  belongs to the saluca-shop catalog skill, not Autobiographer.
