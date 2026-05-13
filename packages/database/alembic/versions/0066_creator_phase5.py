"""Creator OS Phase 5 — Video library.

Revision ID: 0066_creator_phase5
Revises: 0065_creator_phase4
Create Date: 2026-05-13

Phase 5 introduces the video asset table with HLS manifest URL storage,
thumbnail support, and a simple status lifecycle. URL-only contract — no
file upload, no ffmpeg, no transcoding.

Schema delta
------------

1. ``agos_creator_video_assets`` (NEW — video library)
     - ``id UUID PK DEFAULT gen_random_uuid()``
     - ``user_id TEXT NOT NULL`` (no FK — cross-OS contract)
     - ``title TEXT NOT NULL``
     - ``description TEXT``
     - ``url TEXT NOT NULL`` (HLS manifest URL — URL-only contract)
     - ``thumbnail_url TEXT``
     - ``duration_seconds INT``
     - ``status TEXT NOT NULL DEFAULT 'ready'``
     - ``created_at``, ``updated_at``

Indexes
-------
- ``idx_creator_videos_user`` on (user_id, status) for filtered list feeds.

Locked design decisions
-----------------------
- **No FK on user_id.** Ownership enforced at BFF route layer.
- **URL-only contract.** ``url`` holds an HLS manifest URL; no local file serving.
- **Default status is 'ready'.** No server-side media processing in this phase.
  The status column exists for future use.

Idempotency
-----------
CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DO $$ guard on
trigger. Safe to re-run on a partially-applied database.

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


revision: str = "0066_creator_phase5"
down_revision: Union[str, None] = "0065_creator_phase4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ═══ agos_creator_video_assets (NEW) ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agos_creator_video_assets (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          TEXT         NOT NULL,
    title            TEXT         NOT NULL,
    description      TEXT         NULL,
    url              TEXT         NOT NULL,
    thumbnail_url    TEXT         NULL,
    duration_seconds INT          NULL,
    status           TEXT         NOT NULL DEFAULT 'ready'
                                  CHECK (status IN ('processing','ready','failed')),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE agos_creator_video_assets IS
  'Creator OS video library. Stores HLS manifest URLs for playback via Video.js. URL-only contract — no file upload or server-side media processing in this phase.';

COMMENT ON COLUMN agos_creator_video_assets.user_id IS
  'Owning user. No FK — ownership is enforced at the BFF route layer per the v0.1.30 cross-OS contract.';

COMMENT ON COLUMN agos_creator_video_assets.title IS
  'Display title for the video asset.';

COMMENT ON COLUMN agos_creator_video_assets.description IS
  'Optional description or summary of the video content.';

COMMENT ON COLUMN agos_creator_video_assets.url IS
  'HLS manifest URL (e.g. https://cdn.example.com/videos/abc/index.m3u8). URL-only contract — no local file serving.';

COMMENT ON COLUMN agos_creator_video_assets.thumbnail_url IS
  'Optional thumbnail / poster image URL for the video card and player.';

COMMENT ON COLUMN agos_creator_video_assets.duration_seconds IS
  'Video duration in seconds. Nullable — may not be known at creation time.';

COMMENT ON COLUMN agos_creator_video_assets.status IS
  'Asset status. Defaults to ''ready'' — no server-side media processing in this phase. The ''processing'' and ''failed'' statuses are reserved for future transcoding workflows.';

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_creator_videos_user
    ON agos_creator_video_assets (user_id, status);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_creator_videos_updated_at'
    ) THEN
        CREATE TRIGGER trg_creator_videos_updated_at
            BEFORE UPDATE ON agos_creator_video_assets
            FOR EACH ROW
            EXECUTE FUNCTION agos_touch_updated_at();
    END IF;
END$$;
"""


_DOWNGRADE_SQL = r"""
DROP TRIGGER IF EXISTS trg_creator_videos_updated_at ON agos_creator_video_assets;
DROP TABLE IF EXISTS agos_creator_video_assets;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
