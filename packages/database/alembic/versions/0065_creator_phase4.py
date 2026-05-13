"""Creator OS Phase 4 — Podcast.

Revision ID: 0065_creator_phase4
Revises: 0064_creator_phase3
Create Date: 2026-05-13

Phase 4 introduces podcast show configuration, episode management with
season/episode numbering, and Podcasting 2.0 RSS feed generation.

Schema delta
------------

1. ``agos_creator_podcasts`` (NEW — show configuration)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id TEXT NOT NULL UNIQUE`` (one show per user)
     - ``title TEXT NOT NULL``
     - ``description TEXT``
     - ``author TEXT``
     - ``cover_image_url TEXT``
     - ``language TEXT NOT NULL DEFAULT 'en'``
     - ``category TEXT``
     - ``explicit BOOLEAN NOT NULL DEFAULT false``
     - ``website_url TEXT``
     - ``created_at``, ``updated_at``

2. ``agos_creator_episodes`` (NEW — podcast episodes)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``podcast_id UUID NOT NULL`` (no FK — referential handled at app layer)
     - ``title TEXT NOT NULL``
     - ``description TEXT``
     - ``notes_md TEXT`` (show notes in markdown)
     - ``audio_file_url TEXT`` (URL-only contract)
     - ``duration_seconds INT``
     - ``file_size_bytes BIGINT``
     - ``mime_type TEXT``
     - ``season_number INT``
     - ``episode_number INT``
     - ``episode_type TEXT NOT NULL DEFAULT 'full'`` CHECK (full/trailer/bonus)
     - ``status TEXT NOT NULL DEFAULT 'draft'`` CHECK (draft/published/archived)
     - ``published_at TIMESTAMPTZ``
     - ``created_at``, ``updated_at``

Indexes
-------
- ``idx_creator_podcasts_user`` on (user_id) for show lookup.
- ``idx_creator_eps_podcast`` on (podcast_id, season_number, episode_number) for ordered episode listing.
- ``idx_creator_eps_published`` partial WHERE status = 'published' for RSS feed queries.

Locked design decisions
-----------------------
- **One podcast per user.** UNIQUE constraint on user_id.
- **No FK on podcast_id.** Referential integrity handled at the application layer.
- **URL-only contract for audio.** ``audio_file_url`` is a TEXT field holding a URL; no file upload.
- **Episode auto-numbering.** When creating without episode_number, the BFF queries MAX + 1 per podcast.

Idempotency
-----------
CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS (for non-partial
indexes), and DO $$ guard on pg_indexes (for partial indexes). Safe to re-run
on a partially-applied database.

Bind-marker safety
------------------
Per prior-phase footgun: SQLAlchemy's ``text()`` parses ``:word`` patterns
as bind markers. This module uses ``op.execute`` with raw string constants
(NOT ``op.execute(text(...))``); the SQL bodies carry zero ``:<word>``
patterns.

License note: All DDL is original work under MIT.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0065_creator_phase4"
down_revision: Union[str, None] = "0064_creator_phase3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ═══ agos_creator_podcasts (NEW) ════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_creator_podcasts (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT         NOT NULL UNIQUE,
    title           TEXT         NOT NULL,
    description     TEXT         NULL,
    author          TEXT         NULL,
    cover_image_url TEXT         NULL,
    language        TEXT         NOT NULL DEFAULT 'en',
    category        TEXT         NULL,
    explicit        BOOLEAN      NOT NULL DEFAULT false,
    website_url     TEXT         NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE agos_creator_podcasts IS
  'Creator OS podcast show configuration. One show per user (UNIQUE on user_id). Stores iTunes-compatible metadata for Podcasting 2.0 RSS feed generation.';

COMMENT ON COLUMN agos_creator_podcasts.user_id IS
  'Owning user. UNIQUE — one show per user. No FK — ownership enforced at BFF route layer.';

COMMENT ON COLUMN agos_creator_podcasts.title IS
  'Podcast show title. Required. Used as <title> in RSS feed.';

COMMENT ON COLUMN agos_creator_podcasts.description IS
  'Podcast show description. Used as <description> and <itunes:summary> in RSS feed.';

COMMENT ON COLUMN agos_creator_podcasts.author IS
  'Podcast author name. Used as <itunes:author> in RSS feed.';

COMMENT ON COLUMN agos_creator_podcasts.cover_image_url IS
  'URL to podcast cover art. Used as <itunes:image href=""> in RSS feed. iTunes requires 1400x1400 minimum. URL-only contract.';

COMMENT ON COLUMN agos_creator_podcasts.language IS
  'ISO 639-1 language code (e.g. ''en'', ''es''). Default ''en''. Used as <language> in RSS feed.';

COMMENT ON COLUMN agos_creator_podcasts.category IS
  'Apple Podcasts category string (e.g. ''Technology''). Used as <itunes:category>.';

COMMENT ON COLUMN agos_creator_podcasts.explicit IS
  'iTunes explicit flag. Default false. Used as <itunes:explicit> in RSS feed.';

COMMENT ON COLUMN agos_creator_podcasts.website_url IS
  'Link to the show homepage. Used as <link> in RSS feed.';

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_creator_podcasts_user
    ON agos_creator_podcasts (user_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION agos_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_creator_podcasts_updated_at'
    ) THEN
        CREATE TRIGGER trg_creator_podcasts_updated_at
            BEFORE UPDATE ON agos_creator_podcasts
            FOR EACH ROW
            EXECUTE FUNCTION agos_touch_updated_at();
    END IF;
END$$;


-- ═══ agos_creator_episodes (NEW) ════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_creator_episodes (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    podcast_id       UUID         NOT NULL,
    title            TEXT         NOT NULL,
    description      TEXT         NULL,
    notes_md         TEXT         NULL,
    audio_file_url   TEXT         NULL,
    duration_seconds INT          NULL,
    file_size_bytes  BIGINT       NULL,
    mime_type        TEXT         NULL,
    season_number    INT          NULL,
    episode_number   INT          NULL,
    episode_type     TEXT         NOT NULL DEFAULT 'full',
    status           TEXT         NOT NULL DEFAULT 'draft',
    published_at     TIMESTAMPTZ  NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT agos_creator_episodes_type_check
        CHECK (episode_type IN ('full', 'trailer', 'bonus')),

    CONSTRAINT agos_creator_episodes_status_check
        CHECK (status IN ('draft', 'published', 'archived'))
);

COMMENT ON TABLE agos_creator_episodes IS
  'Creator OS podcast episodes. Each episode belongs to a podcast and stores metadata for Podcasting 2.0 RSS feed generation. Audio referenced by URL only — no file upload.';

COMMENT ON COLUMN agos_creator_episodes.podcast_id IS
  'Parent podcast. No FK — referential integrity handled at the application layer.';

COMMENT ON COLUMN agos_creator_episodes.title IS
  'Episode title. Required. Used as <title> in RSS <item>.';

COMMENT ON COLUMN agos_creator_episodes.description IS
  'Episode description. Used as <description> and <itunes:summary> in RSS <item>.';

COMMENT ON COLUMN agos_creator_episodes.notes_md IS
  'Show notes in markdown format. Rendered in the episode detail page.';

COMMENT ON COLUMN agos_creator_episodes.audio_file_url IS
  'HLS manifest or audio file URL. URL-only contract — no file upload handling. Used as enclosure url in RSS <item>.';

COMMENT ON COLUMN agos_creator_episodes.duration_seconds IS
  'Episode duration in seconds. Used as <itunes:duration> in RSS <item>.';

COMMENT ON COLUMN agos_creator_episodes.file_size_bytes IS
  'Audio file size in bytes. Used as enclosure length in RSS <item>.';

COMMENT ON COLUMN agos_creator_episodes.mime_type IS
  'Audio MIME type (e.g. ''audio/mpeg'', ''application/vnd.apple.mpegurl''). Used as enclosure type in RSS <item>.';

COMMENT ON COLUMN agos_creator_episodes.season_number IS
  'Podcast season number. Used as <podcast:season> in RSS <item> per Podcast Index namespace.';

COMMENT ON COLUMN agos_creator_episodes.episode_number IS
  'Episode number within the season. Auto-incremented (MAX + 1) when not provided on create. Used as <itunes:episode> in RSS <item>.';

COMMENT ON COLUMN agos_creator_episodes.episode_type IS
  'Episode type. CHECK-constrained: full (default), trailer, bonus. Used as <itunes:episodeType> in RSS <item>.';

COMMENT ON COLUMN agos_creator_episodes.status IS
  'Episode lifecycle status. CHECK-constrained: draft, published, archived. Only published episodes appear in the RSS feed.';

COMMENT ON COLUMN agos_creator_episodes.published_at IS
  'Timestamp when the episode was published. Used as <pubDate> in RSS <item>. Set automatically on first publish.';

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_creator_eps_podcast
    ON agos_creator_episodes (podcast_id, season_number, episode_number);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE indexname = 'idx_creator_eps_published'
    ) THEN
        CREATE INDEX idx_creator_eps_published
            ON agos_creator_episodes (podcast_id, published_at DESC)
            WHERE status = 'published';
    END IF;
END$$;

-- ─── updated_at trigger ───────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_creator_episodes_updated_at'
    ) THEN
        CREATE TRIGGER trg_creator_episodes_updated_at
            BEFORE UPDATE ON agos_creator_episodes
            FOR EACH ROW
            EXECUTE FUNCTION agos_touch_updated_at();
    END IF;
END$$;
"""


_DOWNGRADE_SQL = r"""
DROP TRIGGER IF EXISTS trg_creator_episodes_updated_at ON agos_creator_episodes;
DROP TABLE IF EXISTS agos_creator_episodes;
DROP TRIGGER IF EXISTS trg_creator_podcasts_updated_at ON agos_creator_podcasts;
DROP TABLE IF EXISTS agos_creator_podcasts;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
