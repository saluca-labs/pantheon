"""Autobiographer OS Phase 2 — people, relationships, and consent.

Revision ID: 0043_autobiographer_phase2
Revises: 0042_autobiographer_phase1
Create Date: 2026-05-11

Phase 2 of Autobiographer OS introduces the workshop-global ``people`` entity
and the N:M memory-people join table. The plan is anchored in
``apps/platform-web/content/agentic-os/autobiographer.md`` (Phase 2 section).

New tables (all under ``agos_autobiographer_*``)::

    agos_autobiographer_people          -- workshop-global people directory
    agos_autobiographer_memory_people   -- N:M join from memories to people

Scoping decision — workshop-global people
-----------------------------------------
A given person (mom, mentor, ex-colleague) recurs across multiple books in a
family-history workflow. Storing people per-book would force duplication and
break the Phase 6 redaction pass, which keys off consent state by canonical
person — not per book. The ``user_id`` filter on every read enforces tenant
isolation; cross-ownership is double-checked at the route layer when linking
a memory to a person.

Consent taxonomy
----------------
``consent_to_publish`` is one of:

    granted          -- explicit opt-in on file
    pending          -- default; capture is allowed, publication is gated
    withheld         -- explicit refusal; Phase 6 will hard-block publication
    deceased         -- person is deceased; downstream consent flows skip them
    public_figure    -- public-figure carve-out; commentary protected
    not_applicable   -- entity isn't a real person (e.g. pet, place rename)

``consent_recorded_at`` / ``consent_recorded_by`` are populated by the
``/consent`` convenience route when the author flips a state. They are
nullable because the default ``pending`` state has no acquisition event.

URL columns (MCP storage transfer contract)
-------------------------------------------
``image_url`` is URL-only — the platform never proxies bytes for the cover
image. Column comment references ``docs/architecture/mcp-storage-transfer.md``
to match the Phase 1 + Filmmaker convention.

Unique constraint — functional index
-------------------------------------
``(user_id, lower(canonical_name))`` is enforced as a functional UNIQUE
index rather than a table-level constraint. Postgres does not allow
expression unique constraints inline; the functional index is the standard
workaround and the planning doc explicitly calls for the functional form.

All DDL is idempotent (``CREATE TABLE IF NOT EXISTS``, ``CREATE INDEX IF
NOT EXISTS``, ``CREATE UNIQUE INDEX IF NOT EXISTS``). Downgrade drops the
join table first, then the people table, then the supporting indexes.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0043_autobiographer_phase2"
down_revision: Union[str, None] = "0042_autobiographer_phase1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- 1. agos_autobiographer_people -------------------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_people (
    id                   UUID        PRIMARY KEY,
    user_id              UUID        NOT NULL,
    canonical_name       TEXT        NOT NULL,
    aliases              TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    relation             TEXT        NULL,
    birth_year           INT         NULL,
    death_year           INT         NULL,
    consent_to_publish   TEXT        NOT NULL DEFAULT 'pending',
    consent_recorded_at  TIMESTAMPTZ NULL,
    consent_recorded_by  TEXT        NULL,
    notes                TEXT        NULL,
    image_url            TEXT        NULL,
    metadata             JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_autobiographer_people_consent_chk
        CHECK (consent_to_publish IN (
            'granted',
            'pending',
            'withheld',
            'deceased',
            'public_figure',
            'not_applicable'
        ))
);

-- Functional UNIQUE index on (user_id, lower(canonical_name)) to enforce
-- case-insensitive uniqueness of canonical names per user.
CREATE UNIQUE INDEX IF NOT EXISTS agos_autobiographer_people_user_name_uq
    ON agos_autobiographer_people (user_id, lower(canonical_name));

CREATE INDEX IF NOT EXISTS agos_autobiographer_people_user_consent_idx
    ON agos_autobiographer_people (user_id, consent_to_publish);

CREATE INDEX IF NOT EXISTS agos_autobiographer_people_aliases_gin_idx
    ON agos_autobiographer_people USING GIN (aliases);

COMMENT ON COLUMN agos_autobiographer_people.image_url IS
  'External URL. Asset upload via MCP-mediated storage transfer is a future workstream; see docs/architecture/mcp-storage-transfer.md.';

COMMENT ON COLUMN agos_autobiographer_people.aliases IS
  'Alternate names this person is referred to by. Phase 6 redaction consults this list when scrubbing or substituting names in draft text.';

COMMENT ON COLUMN agos_autobiographer_people.consent_to_publish IS
  'One of granted/pending/withheld/deceased/public_figure/not_applicable. Phase 6 publication gate keys off this state.';

COMMENT ON COLUMN agos_autobiographer_people.consent_recorded_by IS
  'Free-form attribution of how the consent state was acquired ("verbal, 2026-04-12", "email, on file", "n/a"). Populated by the /consent convenience route.';

-- 2. agos_autobiographer_memory_people ------------------------------------

CREATE TABLE IF NOT EXISTS agos_autobiographer_memory_people (
    memory_id  UUID NOT NULL
               REFERENCES agos_autobiographer_memories(id) ON DELETE CASCADE,
    person_id  UUID NOT NULL
               REFERENCES agos_autobiographer_people(id) ON DELETE CASCADE,
    role       TEXT NULL,
    notes      TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (memory_id, person_id)
);

CREATE INDEX IF NOT EXISTS agos_autobiographer_memory_people_person_idx
    ON agos_autobiographer_memory_people (person_id);

COMMENT ON COLUMN agos_autobiographer_memory_people.role IS
  'Free-form role of the person in the memory ("protagonist", "witness", "antagonist", "mentioned"). Phase 5 thematic analysis may key off this.';
"""


_DOWNGRADE_SQL = r"""
-- Drop join table first (FK depends on both tables).
DROP INDEX IF EXISTS agos_autobiographer_memory_people_person_idx;
DROP TABLE IF EXISTS agos_autobiographer_memory_people;

-- Then people.
DROP INDEX IF EXISTS agos_autobiographer_people_aliases_gin_idx;
DROP INDEX IF EXISTS agos_autobiographer_people_user_consent_idx;
DROP INDEX IF EXISTS agos_autobiographer_people_user_name_uq;
DROP TABLE IF EXISTS agos_autobiographer_people;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
