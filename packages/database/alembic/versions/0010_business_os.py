"""Business OS vertical tables — Contacts CRM.

Revision ID: 0010_business_os
Revises: 0009_autobiographer_os
Create Date: 2026-05-07

Adds the Business OS CRM schema: organizations, people (contacts), and
an interactions log. Stage/type taxonomy follows standard B2B sales practice
(HubSpot, Salesforce, Pipedrive):
  https://www.hubspot.com/crm
  https://www.salesforce.com/crm/what-is-crm/

All DDL is idempotent (CREATE TABLE IF NOT EXISTS).
License note: All DDL is original work under MIT. No GPL code is introduced.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0010_business_os"
down_revision: Union[str, None] = "0009_autobiographer_os"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
-- Business OS vertical tables — Contacts CRM ----------------------------

-- Organizations (companies, non-profits, government, etc.)
-- org_type: company | non_profit | government | sole_trader | partnership | other
CREATE TABLE IF NOT EXISTS agos_business_orgs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    org_type TEXT NOT NULL DEFAULT 'company',
    website TEXT,
    industry TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_business_orgs_user_idx
    ON agos_business_orgs (user_id, name ASC);

-- People (contacts): individual records optionally linked to an org.
-- stage: lead | qualified | proposal | negotiation | won | lost | inactive
-- Ref: HubSpot CRM pipeline stages — https://www.hubspot.com/crm
CREATE TABLE IF NOT EXISTS agos_business_people (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT,
    organization_id UUID REFERENCES agos_business_orgs(id) ON DELETE SET NULL,
    stage TEXT NOT NULL DEFAULT 'lead',
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_business_people_user_idx
    ON agos_business_people (user_id, last_name ASC, first_name ASC);
CREATE INDEX IF NOT EXISTS agos_business_people_org_idx
    ON agos_business_people (organization_id);

-- Interaction log: every touchpoint with a contact or org.
-- interaction_type: call | email | meeting | demo | proposal | follow_up | note | linkedin | other
CREATE TABLE IF NOT EXISTS agos_business_interactions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    person_id UUID REFERENCES agos_business_people(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES agos_business_orgs(id) ON DELETE SET NULL,
    interaction_type TEXT NOT NULL DEFAULT 'note',
    summary TEXT NOT NULL DEFAULT '',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agos_business_interactions_user_idx
    ON agos_business_interactions (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS agos_business_interactions_person_idx
    ON agos_business_interactions (person_id, occurred_at DESC);
"""

_DOWNGRADE_SQL = """
DROP INDEX IF EXISTS agos_business_interactions_person_idx;
DROP INDEX IF EXISTS agos_business_interactions_user_idx;
DROP TABLE IF EXISTS agos_business_interactions;

DROP INDEX IF EXISTS agos_business_people_org_idx;
DROP INDEX IF EXISTS agos_business_people_user_idx;
DROP TABLE IF EXISTS agos_business_people;

DROP INDEX IF EXISTS agos_business_orgs_user_idx;
DROP TABLE IF EXISTS agos_business_orgs;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
