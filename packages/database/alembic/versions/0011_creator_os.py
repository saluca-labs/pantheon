"""Creator OS vertical tables — Editorial Calendar.

Revision ID: 0011_creator_os
Revises: 0010_business_os
Create Date: 2026-05-07

Adds the Creator OS schema: editorial calendar posts with channel, content
format, status, and publish date.

Channel taxonomy is adapted from standard digital marketing practice:
  Buffer "Types of Content Marketing": https://buffer.com/resources/content-types/

Post status taxonomy mirrors WordPress REST API post status:
  https://developer.wordpress.org/rest-api/reference/posts/#schema-status

All DDL is idempotent (CREATE TABLE IF NOT EXISTS).
License note: All DDL is original work under MIT. No GPL code is introduced.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0011_creator_os"
down_revision: Union[str, None] = "0010_business_os"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Creator OS vertical tables — Editorial Calendar -----------------------

-- Posts: the primary unit of the editorial calendar.
-- status: idea | draft | scheduled | published | archived
-- channel: blog | newsletter | youtube | tiktok | instagram | twitter_x |
--          linkedin | podcast | substack | facebook | other
-- content_format: article | video | short_video | podcast_episode |
--                 newsletter_issue | image_post | thread | carousel | other
-- Ref: https://buffer.com/resources/content-types/
CREATE TABLE IF NOT EXISTS agos_creator_posts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idea',
    channel TEXT NOT NULL DEFAULT 'blog',
    content_format TEXT NOT NULL DEFAULT 'article',
    publish_at TIMESTAMPTZ,
    body TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_creator_posts_user_idx
    ON agos_creator_posts (user_id, COALESCE(publish_at, updated_at) DESC);
CREATE INDEX IF NOT EXISTS agos_creator_posts_status_idx
    ON agos_creator_posts (user_id, status, publish_at);

-- Content ideas: lightweight capture before a post is created
CREATE TABLE IF NOT EXISTS agos_creator_ideas (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    headline TEXT NOT NULL,
    channel TEXT,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_creator_ideas_user_idx
    ON agos_creator_ideas (user_id, captured_at DESC);
"""

_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_creator_ideas_user_idx;
DROP TABLE IF EXISTS agos_creator_ideas;

DROP INDEX IF EXISTS agos_creator_posts_status_idx;
DROP INDEX IF EXISTS agos_creator_posts_user_idx;
DROP TABLE IF EXISTS agos_creator_posts;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
