"""Research OS Phase 3 — Hypothesis ledger integration.

Revision ID: 0050_research_phase3
Revises: 0049_research_phase2
Create Date: 2026-05-12

Phase 3 of Research OS promotes the hypothesis ledger from a flat list
to a real hypothesis-management surface. One additive ALTER on the
existing ``agos_research_hypotheses`` table plus four brand-new tables:

  1. ``agos_research_hypotheses`` (ALTER, additive only)
       + ``experiment_id   UUID``                — nullable soft "primary
                                                   experiment" pointer; the
                                                   new N:M join is the
                                                   authoritative linkage,
                                                   this column is legacy.
       + ``description_md  TEXT NOT NULL DEFAULT ''``  — longer-form
                                                   rationale, markdown.
       + ``archived_at     TIMESTAMPTZ``          — soft-archive marker.
       No CHECK changes, no FK on the new ``experiment_id`` column per
       v0.1.30 platform contract.

  2. ``agos_research_hypothesis_predictions`` — per-hypothesis predictions.
       ``hypothesis_id`` FK CASCADE → hypotheses. ``kind`` CHECK in
       ``('positive','negative','magnitude','direction')``. ``confidence``
       defaults to ``'medium'`` (low / medium / high — same enum the
       Phase 1 ``lib/hypotheses.ts`` already encodes).
       Index ``(hypothesis_id)``.

  3. ``agos_research_hypothesis_falsifiers`` — what observation would
       refute the hypothesis. ``hypothesis_id`` FK CASCADE. ``text`` and
       optional ``criterion_md`` (specific threshold). Index
       ``(hypothesis_id)``.

  4. ``agos_research_hypothesis_evidence`` — supporting/refuting evidence
       links. ``hypothesis_id`` FK CASCADE. Polymorphic via ``source_kind``
       CHECK in ``('notebook_entry','paper','dataset','external_url',
       'free_text')`` + nullable ``source_id`` (for the internal-row kinds)
       + nullable ``source_url`` (for ``external_url``). Mirrors Cyber's
       IOC pattern — single table, polymorphic body. Indexes
       ``(hypothesis_id)``; partial ``(source_kind, source_id) WHERE
       source_id IS NOT NULL`` (reverse-lookup seam — "what hypotheses
       cite paper X?" once Phase 4 ships).

  5. ``agos_research_experiment_hypotheses`` — N:M join. ``experiment_id``
       NO FK (platform v0.1.30 contract; the BFF enforces ownership via
       JOIN). ``hypothesis_id`` FK CASCADE. ``role`` CHECK in
       ``('tests','motivates','related')``. UNIQUE
       ``(experiment_id, hypothesis_id, role)`` — different roles between
       the same pair are allowed. Indexes ``(experiment_id)``,
       ``(hypothesis_id)``.

Locked design decisions
-----------------------
- **Hypotheses are workshop-global**, not experiment-scoped. The N:M
  join is authoritative; ``agos_research_hypotheses.experiment_id`` is a
  legacy soft pointer kept for back-compat (the existing 0005 schema
  treats the row-shape as ``hypothesis-as-parent``; we preserve it).
- **Evidence polymorphism via ``source_kind``** — one table, switch on
  the discriminator. Matches Cyber's IOC pattern.
- **No FK on either ``experiment_id`` column** — neither the hypothesis
  ALTER pointer nor the join's ``experiment_id`` carries a FK. Platform
  v0.1.30 dropped cross-OS UUID FKs; ownership lives at the BFF layer.
- **Status CHECK unchanged** on ``agos_research_hypotheses.status`` —
  Phase 1's helper enforces the transition graph at the app layer.
- **No FK on ``source_id``** in the evidence table — it's polymorphic
  (notebook entry / paper / dataset / nothing) and FKs cannot be
  conditional. The route layer validates the referent.

Idempotency
-----------
All DDL is idempotent: ``CREATE TABLE IF NOT EXISTS`` / ``CREATE INDEX
IF NOT EXISTS`` / ``ALTER TABLE ... ADD COLUMN IF NOT EXISTS``. Safe to
re-run on a partially-applied database.

Bind-marker safety
------------------
Per prior-phase footgun: SQLAlchemy's ``text()`` parses ``:word``
patterns as bind markers. This module uses ``op.execute`` with a raw
string constant (NOT ``op.execute(text(...))``); the SQL bodies carry
zero ``:<word>`` patterns (the test guard asserts this).

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0050_research_phase3"
down_revision: Union[str, None] = "0049_research_phase2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. ALTER agos_research_hypotheses (additive only) -------------------------
ALTER TABLE agos_research_hypotheses
    ADD COLUMN IF NOT EXISTS experiment_id  UUID,
    ADD COLUMN IF NOT EXISTS description_md TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS archived_at    TIMESTAMPTZ;

COMMENT ON COLUMN agos_research_hypotheses.experiment_id IS
  'Legacy soft pointer to a "primary" experiment. The many-to-many join table agos_research_experiment_hypotheses is the authoritative linkage. No FK per platform v0.1.30 contract.';

COMMENT ON COLUMN agos_research_hypotheses.description_md IS
  'Longer-form rationale beyond the if/then/because clauses. Markdown. Rendered server-side via react-markdown WITHOUT rehype-raw (XSS guard).';

COMMENT ON COLUMN agos_research_hypotheses.archived_at IS
  'Soft-archive marker. NULL = active; non-NULL = the timestamp the hypothesis was archived. Replaces hard delete.';

-- 2. agos_research_hypothesis_predictions ------------------------------------
CREATE TABLE IF NOT EXISTS agos_research_hypothesis_predictions (
    id            UUID PRIMARY KEY,
    hypothesis_id UUID NOT NULL REFERENCES agos_research_hypotheses(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL,
    text          TEXT NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'positive',
    confidence    TEXT NOT NULL DEFAULT 'medium',
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_hypothesis_predictions_kind_chk
        CHECK (kind IN ('positive','negative','magnitude','direction')),
    CONSTRAINT agos_research_hypothesis_predictions_confidence_chk
        CHECK (confidence IN ('low','medium','high'))
);

COMMENT ON TABLE agos_research_hypothesis_predictions IS
  'Predictions associated with a hypothesis: positive/negative effect, magnitude, or directional. Each prediction carries its own confidence label.';

CREATE INDEX IF NOT EXISTS agos_research_hypothesis_predictions_hypothesis_idx
    ON agos_research_hypothesis_predictions (hypothesis_id);

-- 3. agos_research_hypothesis_falsifiers --------------------------------------
CREATE TABLE IF NOT EXISTS agos_research_hypothesis_falsifiers (
    id            UUID PRIMARY KEY,
    hypothesis_id UUID NOT NULL REFERENCES agos_research_hypotheses(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL,
    text          TEXT NOT NULL,
    criterion_md  TEXT,
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE agos_research_hypothesis_falsifiers IS
  'Per-hypothesis falsifiers: observations that would refute the hypothesis. Pre-registers the refutation criterion at the time the hypothesis is formed (a Popperian rigor anchor).';

COMMENT ON COLUMN agos_research_hypothesis_falsifiers.criterion_md IS
  'Specific threshold or condition (markdown). The falsifier "text" is the headline; criterion_md carries the quantitative gate.';

CREATE INDEX IF NOT EXISTS agos_research_hypothesis_falsifiers_hypothesis_idx
    ON agos_research_hypothesis_falsifiers (hypothesis_id);

-- 4. agos_research_hypothesis_evidence ---------------------------------------
CREATE TABLE IF NOT EXISTS agos_research_hypothesis_evidence (
    id            UUID PRIMARY KEY,
    hypothesis_id UUID NOT NULL REFERENCES agos_research_hypotheses(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL,
    polarity      TEXT NOT NULL,
    source_kind   TEXT NOT NULL,
    source_id     UUID,
    source_url    TEXT,
    notes         TEXT,
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_hypothesis_evidence_polarity_chk
        CHECK (polarity IN ('supports','refutes','mixed')),
    CONSTRAINT agos_research_hypothesis_evidence_source_kind_chk
        CHECK (source_kind IN ('notebook_entry','paper','dataset','external_url','free_text'))
);

COMMENT ON TABLE agos_research_hypothesis_evidence IS
  'Polymorphic evidence links for a hypothesis. Single table with source_kind discriminator (notebook_entry / paper / dataset / external_url / free_text). Matches Cyber IOC pattern.';

COMMENT ON COLUMN agos_research_hypothesis_evidence.source_id IS
  'UUID pointer to the source row when source_kind in (notebook_entry, paper, dataset). NULL for external_url / free_text. No FK because the referent table varies by kind.';

COMMENT ON COLUMN agos_research_hypothesis_evidence.source_url IS
  'External URL when source_kind = external_url. NULL otherwise.';

CREATE INDEX IF NOT EXISTS agos_research_hypothesis_evidence_hypothesis_idx
    ON agos_research_hypothesis_evidence (hypothesis_id);

-- Reverse-lookup seam: "what hypotheses cite this paper?" once Phase 4 ships.
CREATE INDEX IF NOT EXISTS agos_research_hypothesis_evidence_source_idx
    ON agos_research_hypothesis_evidence (source_kind, source_id)
    WHERE source_id IS NOT NULL;

-- 5. agos_research_experiment_hypotheses (many-to-many join) ----------------
CREATE TABLE IF NOT EXISTS agos_research_experiment_hypotheses (
    id            UUID PRIMARY KEY,
    experiment_id UUID NOT NULL,
    hypothesis_id UUID NOT NULL REFERENCES agos_research_hypotheses(id) ON DELETE CASCADE,
    role          TEXT NOT NULL DEFAULT 'tests',
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_research_experiment_hypotheses_role_chk
        CHECK (role IN ('tests','motivates','related')),
    CONSTRAINT agos_research_experiment_hypotheses_unique_edge
        UNIQUE (experiment_id, hypothesis_id, role)
);

COMMENT ON TABLE agos_research_experiment_hypotheses IS
  'Many-to-many join between experiments and hypotheses. One experiment can test multiple hypotheses; one hypothesis can be tested across multiple experiments. Different roles between the same pair are allowed (e.g. tests + motivates).';

COMMENT ON COLUMN agos_research_experiment_hypotheses.experiment_id IS
  'Soft pointer to agos_research_experiments(id). No FK per platform v0.1.30 contract; the BFF route layer enforces ownership via JOIN.';

COMMENT ON COLUMN agos_research_experiment_hypotheses.role IS
  'Link role: tests (experiment tests this hypothesis), motivates (experiment was motivated by it), related (looser connection).';

CREATE INDEX IF NOT EXISTS agos_research_experiment_hypotheses_experiment_idx
    ON agos_research_experiment_hypotheses (experiment_id);

CREATE INDEX IF NOT EXISTS agos_research_experiment_hypotheses_hypothesis_idx
    ON agos_research_experiment_hypotheses (hypothesis_id);
"""


_DOWNGRADE_SQL = r"""
-- Reverse order vs upgrade. Drop join + leaf tables first, then the ALTER.
DROP INDEX IF EXISTS agos_research_experiment_hypotheses_hypothesis_idx;
DROP INDEX IF EXISTS agos_research_experiment_hypotheses_experiment_idx;
DROP TABLE IF EXISTS agos_research_experiment_hypotheses;

DROP INDEX IF EXISTS agos_research_hypothesis_evidence_source_idx;
DROP INDEX IF EXISTS agos_research_hypothesis_evidence_hypothesis_idx;
DROP TABLE IF EXISTS agos_research_hypothesis_evidence;

DROP INDEX IF EXISTS agos_research_hypothesis_falsifiers_hypothesis_idx;
DROP TABLE IF EXISTS agos_research_hypothesis_falsifiers;

DROP INDEX IF EXISTS agos_research_hypothesis_predictions_hypothesis_idx;
DROP TABLE IF EXISTS agos_research_hypothesis_predictions;

ALTER TABLE agos_research_hypotheses
    DROP COLUMN IF EXISTS archived_at,
    DROP COLUMN IF EXISTS description_md,
    DROP COLUMN IF EXISTS experiment_id;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
