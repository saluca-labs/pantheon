"""Creator OS Phase 2 — Publishing / Newsletter.

Revision ID: 0063_creator_phase2
Revises: 0062_creator_phase1
Create Date: 2026-05-13

Phase 2 extends the existing ``agos_creator_posts`` table (created in
0011_creator_os) with publishing-focused columns and adds a subscriber
management table.

Schema delta
------------

1. ``agos_creator_posts`` (ALTER — existing table)
   - ADD ``slug TEXT`` (backfilled, then NOT NULL + UNIQUE)
   - ADD ``excerpt TEXT``
   - ADD ``content JSONB NOT NULL DEFAULT '{}'`` (TipTap JSON)
   - ADD ``cover_image_url TEXT``
   - ADD ``scheduled_at TIMESTAMPTZ``
   - ADD ``published_at TIMESTAMPTZ``
   - DROP ``channel`` (no longer needed — Phase 2 posts are blog/newsletter only)
   - DROP ``content_format`` (replaced by TipTap)
   - RENAME ``body`` → ``notes_md``
   - ADD CHECK on ``status`` for ('idea','draft','scheduled','published','archived')
   - Backfill ``slug`` from title + id prefix
   - Drop old indexes, create new ones
   - Add ``updated_at`` trigger

2. ``agos_creator_subscribers`` (NEW)
   - ``id UUID PK DEFAULT gen_random_uuid()``
   - ``user_id TEXT NOT NULL``
   - ``email TEXT NOT NULL``
   - ``name TEXT``
   - ``status TEXT NOT NULL DEFAULT 'active'`` CHECK (active|unsubscribed|bounced)
   - ``source TEXT``
   - ``created_at``, ``updated_at``
   - UNIQUE (user_id, email)
   - Index: ``idx_creator_subs_user`` on (user_id, status)

Idempotency
-----------
All ALTERs use IF NOT EXISTS / DO $$ guards. DROP uses IF EXISTS.
Safe to re-run on a partially-applied database.

Bind-marker safety
------------------
This module uses ``op.execute`` with raw string constants (NOT
``op.execute(text(...))``); the SQL bodies carry zero ``:<word>``
patterns.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0063_creator_phase2"
down_revision: Union[str, None] = "0062_creator_phase1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ═══ agos_creator_posts (ALTER existing table from 0011) ═══════════════════════════

-- 1. Add new columns ─────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'agos_creator_posts' AND column_name = 'slug'
    ) THEN
        ALTER TABLE agos_creator_posts ADD COLUMN slug TEXT;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'agos_creator_posts' AND column_name = 'excerpt'
    ) THEN
        ALTER TABLE agos_creator_posts ADD COLUMN excerpt TEXT;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'agos_creator_posts' AND column_name = 'content'
    ) THEN
        ALTER TABLE agos_creator_posts ADD COLUMN content JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'agos_creator_posts' AND column_name = 'cover_image_url'
    ) THEN
        ALTER TABLE agos_creator_posts ADD COLUMN cover_image_url TEXT;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'agos_creator_posts' AND column_name = 'scheduled_at'
    ) THEN
        ALTER TABLE agos_creator_posts ADD COLUMN scheduled_at TIMESTAMPTZ;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'agos_creator_posts' AND column_name = 'published_at'
    ) THEN
        ALTER TABLE agos_creator_posts ADD COLUMN published_at TIMESTAMPTZ;
    END IF;
END$$;

-- 2. Drop legacy columns ─────────────────────────────────────────────────────────

ALTER TABLE agos_creator_posts DROP COLUMN IF EXISTS channel;
ALTER TABLE agos_creator_posts DROP COLUMN IF EXISTS content_format;

-- 3. Rename body → notes_md ──────────────────────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'agos_creator_posts' AND column_name = 'body'
    ) THEN
        ALTER TABLE agos_creator_posts RENAME COLUMN body TO notes_md;
    END IF;
END$$;

-- 4. Map any legacy status values to the new constraint set ──────────────────────

UPDATE agos_creator_posts
   SET status = 'draft'
 WHERE status NOT IN ('idea', 'draft', 'scheduled', 'published', 'archived');

-- 5. Add the new CHECK constraint on status ──────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'agos_creator_posts_status_check'
    ) THEN
        ALTER TABLE agos_creator_posts DROP CONSTRAINT agos_creator_posts_status_check;
    END IF;
END$$;

ALTER TABLE agos_creator_posts
  ADD CONSTRAINT agos_creator_posts_status_check
  CHECK (status IN ('idea', 'draft', 'scheduled', 'published', 'archived'))
  NOT VALID;

ALTER TABLE agos_creator_posts VALIDATE CONSTRAINT agos_creator_posts_status_check;

-- 6. Backfill slug ───────────────────────────────────────────────────────────────

UPDATE agos_creator_posts
   SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(title, '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'))
              || '-'
              || substring(id::text, 1, 8)
 WHERE slug IS NULL;

-- 7. Enforce slug NOT NULL ───────────────────────────────────────────────────────

ALTER TABLE agos_creator_posts ALTER COLUMN slug SET NOT NULL;

-- 8. Add UNIQUE constraint on slug ───────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'agos_creator_posts_slug_unique'
    ) THEN
        ALTER TABLE agos_creator_posts ADD CONSTRAINT agos_creator_posts_slug_unique UNIQUE (slug);
    END IF;
END$$;

-- 9. Drop old indexes, create new ones ───────────────────────────────────────────

DROP INDEX IF EXISTS agos_creator_posts_user_idx;
DROP INDEX IF EXISTS agos_creator_posts_status_idx;

-- Main list feed: user's posts sorted by recent activity
CREATE INDEX IF NOT EXISTS idx_creator_posts_user
    ON agos_creator_posts (user_id, status, updated_at DESC);

-- Slug lookups
CREATE INDEX IF NOT EXISTS idx_creator_posts_slug
    ON agos_creator_posts (slug);

-- Published posts (for RSS feed and public list)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'idx_creator_posts_published'
    ) THEN
        CREATE INDEX idx_creator_posts_published
            ON agos_creator_posts (user_id, published_at DESC)
            WHERE status = 'published';
    END IF;
END$$;

-- 10. Add updated_at trigger ─────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_creator_posts_updated_at'
    ) THEN
        CREATE TRIGGER trg_creator_posts_updated_at
            BEFORE UPDATE ON agos_creator_posts
            FOR EACH ROW
            EXECUTE FUNCTION agos_touch_updated_at();
    END IF;
END$$;

COMMENT ON TABLE agos_creator_posts IS
  'Creator OS publishing posts. Blog/newsletter content with TipTap JSON body, slug for URLs, scheduled and published timestamps, and five-phase status workflow.';

COMMENT ON COLUMN agos_creator_posts.slug IS
  'URL-safe unique identifier derived from title. Backfilled from title || ''-'' || first-8-chars-of-id. Used for public URLs and RSS.';

COMMENT ON COLUMN agos_creator_posts.content IS
  'TipTap JSON document content (primary body). Replaces the old content_format column — format is now baked into the editor.';

COMMENT ON COLUMN agos_creator_posts.notes_md IS
  'Internal show-notes / scratch-pad for the author. Not published. Renamed from body (1:1 mapping).';

COMMENT ON COLUMN agos_creator_posts.scheduled_at IS
  'When the post is scheduled to publish. Set when status = scheduled. Published posts use published_at instead.';

COMMENT ON COLUMN agos_creator_posts.published_at IS
  'When the post was published. Set to now() on publish action. NULL until first publication.';

-- ═══ agos_creator_subscribers (NEW) ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_creator_subscribers (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT         NOT NULL,
    email       TEXT         NOT NULL,
    name        TEXT         NULL,
    status      TEXT         NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'unsubscribed', 'bounced')),
    source      TEXT         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (user_id, email)
);

COMMENT ON TABLE agos_creator_subscribers IS
  'Creator OS email subscriber list. One row per unique (user_id, email) pair. Supports active / unsubscribed / bounced status tracking and source attribution.';

COMMENT ON COLUMN agos_creator_subscribers.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_creator_subscribers.status IS
  'Subscription status: active (receives email), unsubscribed (opted out), bounced (email hard-bounced).';

COMMENT ON COLUMN agos_creator_subscribers.source IS
  'Acquisition source: e.g. ''website_form'', ''import'', ''substack_import'', ''manual''. Informational only.';

-- ─── Subscriber indexes ─────────────────────────────────────────────────────

-- User's subscribers filtered by status
CREATE INDEX IF NOT EXISTS idx_creator_subs_user
    ON agos_creator_subscribers (user_id, status);

-- ─── updated_at trigger for subscribers ─────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_creator_subscribers_updated_at'
    ) THEN
        CREATE TRIGGER trg_creator_subscribers_updated_at
            BEFORE UPDATE ON agos_creator_subscribers
            FOR EACH ROW
            EXECUTE FUNCTION agos_touch_updated_at();
    END IF;
END$$;
"""


_DOWNGRADE_SQL = r"""
-- ═══ subscribers (drop) ══════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_creator_subscribers_updated_at ON agos_creator_subscribers;
DROP TABLE IF EXISTS agos_creator_subscribers;

-- ═══ posts (revert to Phase 1 shape) ═════════════════════════════════════════════

-- Drop the trigger added in this phase
DROP TRIGGER IF EXISTS trg_creator_posts_updated_at ON agos_creator_posts;

-- Drop new indexes
DROP INDEX IF EXISTS idx_creator_posts_published;
DROP INDEX IF EXISTS idx_creator_posts_slug;
DROP INDEX IF EXISTS idx_creator_posts_user;

-- Drop new constraint
ALTER TABLE agos_creator_posts DROP CONSTRAINT IF EXISTS agos_creator_posts_slug_unique;
ALTER TABLE agos_creator_posts DROP CONSTRAINT IF EXISTS agos_creator_posts_status_check;

-- Drop new columns
ALTER TABLE agos_creator_posts DROP COLUMN IF EXISTS published_at;
ALTER TABLE agos_creator_posts DROP COLUMN IF EXISTS scheduled_at;
ALTER TABLE agos_creator_posts DROP COLUMN IF EXISTS cover_image_url;
ALTER TABLE agos_creator_posts DROP COLUMN IF EXISTS content;
ALTER TABLE agos_creator_posts DROP COLUMN IF EXISTS excerpt;
ALTER TABLE agos_creator_posts DROP COLUMN IF EXISTS slug;

-- Rename notes_md back to body
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'agos_creator_posts' AND column_name = 'notes_md'
    ) THEN
        ALTER TABLE agos_creator_posts RENAME COLUMN notes_md TO body;
    END IF;
END$$;

-- Restore dropped columns
ALTER TABLE agos_creator_posts ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT 'article';
ALTER TABLE agos_creator_posts ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'blog';

-- Restore old indexes
CREATE INDEX IF NOT EXISTS agos_creator_posts_user_idx
    ON agos_creator_posts (user_id, COALESCE(publish_at, updated_at) DESC);
CREATE INDEX IF NOT EXISTS agos_creator_posts_status_idx
    ON agos_creator_posts (user_id, status, publish_at);
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
