"""CyberSec OS Phase 4 - vulnerabilities + exposures + IOCs + trends.

Also reconciles a Phase 3 enum drift: agos_cyber_detection_rules.log_source_kind
was created with values (siem/edr/ids/cloud_audit/firewall/osquery/syslog/webhook/other)
which do not match the canonical lib enum in `log-sources.ts`. This migration
remaps existing rows to the canonical set and replaces the CHECK constraint.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0031_cyber_phase4"
down_revision: Union[str, None] = "0030_cyber_phase3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = r"""
-- ────────────────────────────────────────────────────────────────────────
-- Phase 3 enum reconcile: detection_rules.log_source_kind
-- ────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'agos_cyber_detection_rules_log_source_kind_enum') THEN
        ALTER TABLE agos_cyber_detection_rules
            DROP CONSTRAINT agos_cyber_detection_rules_log_source_kind_enum;
    END IF;
END $$;

UPDATE agos_cyber_detection_rules SET log_source_kind = 'network_ids'
 WHERE log_source_kind = 'ids';
UPDATE agos_cyber_detection_rules SET log_source_kind = 'app_log'
 WHERE log_source_kind IN ('osquery', 'syslog');

ALTER TABLE agos_cyber_detection_rules
    ADD CONSTRAINT agos_cyber_detection_rules_log_source_kind_enum
    CHECK (log_source_kind IS NULL OR log_source_kind IN (
        'siem','edr','network_ids','cloud_audit','firewall',
        'app_log','identity_provider','webhook','other'
    ));

-- ────────────────────────────────────────────────────────────────────────
-- Vulnerabilities
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agos_cyber_vulnerabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    cve_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL DEFAULT 'medium',
    cvss_score NUMERIC(3,1),
    cvss_vector TEXT,
    cwe_id TEXT,
    vendor TEXT,
    product TEXT,
    affected_versions TEXT[] NOT NULL DEFAULT '{}',
    fixed_versions TEXT[] NOT NULL DEFAULT '{}',
    published_at TIMESTAMPTZ,
    "references" TEXT[] NOT NULL DEFAULT '{}',
    tags TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_vulnerabilities_severity_enum
        CHECK (severity IN ('critical','high','medium','low','info')),
    CONSTRAINT agos_cyber_vulnerabilities_cvss_range
        CHECK (cvss_score IS NULL OR (cvss_score >= 0 AND cvss_score <= 10))
);

CREATE INDEX IF NOT EXISTS agos_cyber_vulns_owner_idx
    ON agos_cyber_vulnerabilities (owner_id);
CREATE INDEX IF NOT EXISTS agos_cyber_vulns_owner_severity_idx
    ON agos_cyber_vulnerabilities (owner_id, severity);
CREATE INDEX IF NOT EXISTS agos_cyber_vulns_cve_id_idx
    ON agos_cyber_vulnerabilities (cve_id) WHERE cve_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agos_cyber_vulns_tags_gin_idx
    ON agos_cyber_vulnerabilities USING GIN (tags);

-- ────────────────────────────────────────────────────────────────────────
-- Exposures (vuln × asset junction with workflow)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agos_cyber_exposures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vulnerability_id UUID NOT NULL REFERENCES agos_cyber_vulnerabilities(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES agos_cyber_assets(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    remediated_at TIMESTAMPTZ,
    detected_by TEXT,
    assigned_to TEXT,
    priority TEXT NOT NULL DEFAULT 'p3',
    notes TEXT,
    evidence_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_exposures_status_enum
        CHECK (status IN ('open','in_progress','accepted','mitigated','resolved','false_positive')),
    CONSTRAINT agos_cyber_exposures_priority_enum
        CHECK (priority IN ('p1','p2','p3','p4','p5')),
    CONSTRAINT agos_cyber_exposures_vuln_asset_unique
        UNIQUE (vulnerability_id, asset_id)
);

CREATE INDEX IF NOT EXISTS agos_cyber_exposures_owner_status_idx
    ON agos_cyber_exposures (owner_id, status);
CREATE INDEX IF NOT EXISTS agos_cyber_exposures_asset_id_idx
    ON agos_cyber_exposures (asset_id);
CREATE INDEX IF NOT EXISTS agos_cyber_exposures_vulnerability_id_idx
    ON agos_cyber_exposures (vulnerability_id);
CREATE INDEX IF NOT EXISTS agos_cyber_exposures_owner_priority_idx
    ON agos_cyber_exposures (owner_id, priority);

-- ────────────────────────────────────────────────────────────────────────
-- IOCs (indicators of compromise)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agos_cyber_iocs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    kind TEXT NOT NULL,
    value TEXT NOT NULL,
    title TEXT,
    description TEXT,
    threat_type TEXT,
    confidence INT NOT NULL DEFAULT 50,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    source TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    "references" TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agos_cyber_iocs_kind_enum
        CHECK (kind IN ('ipv4','ipv6','domain','url','file_hash_md5','file_hash_sha1','file_hash_sha256','email','registry_key','mutex','user_agent','other')),
    CONSTRAINT agos_cyber_iocs_threat_type_enum
        CHECK (threat_type IS NULL OR threat_type IN ('malware','phishing','c2','exfil','exploit','scanning','brute_force','unknown')),
    CONSTRAINT agos_cyber_iocs_confidence_range
        CHECK (confidence BETWEEN 0 AND 100),
    CONSTRAINT agos_cyber_iocs_owner_kind_value_unique
        UNIQUE (owner_id, kind, value)
);

CREATE INDEX IF NOT EXISTS agos_cyber_iocs_owner_kind_idx
    ON agos_cyber_iocs (owner_id, kind);
CREATE INDEX IF NOT EXISTS agos_cyber_iocs_owner_threat_type_idx
    ON agos_cyber_iocs (owner_id, threat_type);
CREATE INDEX IF NOT EXISTS agos_cyber_iocs_owner_expires_idx
    ON agos_cyber_iocs (owner_id, expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS agos_cyber_iocs_tags_gin_idx
    ON agos_cyber_iocs USING GIN (tags);
"""


_DOWNGRADE_SQL = r"""
DROP INDEX IF EXISTS agos_cyber_iocs_tags_gin_idx;
DROP INDEX IF EXISTS agos_cyber_iocs_owner_expires_idx;
DROP INDEX IF EXISTS agos_cyber_iocs_owner_threat_type_idx;
DROP INDEX IF EXISTS agos_cyber_iocs_owner_kind_idx;
DROP TABLE IF EXISTS agos_cyber_iocs;

DROP INDEX IF EXISTS agos_cyber_exposures_owner_priority_idx;
DROP INDEX IF EXISTS agos_cyber_exposures_vulnerability_id_idx;
DROP INDEX IF EXISTS agos_cyber_exposures_asset_id_idx;
DROP INDEX IF EXISTS agos_cyber_exposures_owner_status_idx;
DROP TABLE IF EXISTS agos_cyber_exposures;

DROP INDEX IF EXISTS agos_cyber_vulns_tags_gin_idx;
DROP INDEX IF EXISTS agos_cyber_vulns_cve_id_idx;
DROP INDEX IF EXISTS agos_cyber_vulns_owner_severity_idx;
DROP INDEX IF EXISTS agos_cyber_vulns_owner_idx;
DROP TABLE IF EXISTS agos_cyber_vulnerabilities;

-- Revert detection_rules.log_source_kind constraint to the Phase 3 set.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'agos_cyber_detection_rules_log_source_kind_enum') THEN
        ALTER TABLE agos_cyber_detection_rules
            DROP CONSTRAINT agos_cyber_detection_rules_log_source_kind_enum;
    END IF;
END $$;
ALTER TABLE agos_cyber_detection_rules
    ADD CONSTRAINT agos_cyber_detection_rules_log_source_kind_enum
    CHECK (log_source_kind IS NULL OR log_source_kind IN (
        'siem','edr','ids','cloud_audit','firewall','osquery','syslog','webhook','other'
    ));
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
