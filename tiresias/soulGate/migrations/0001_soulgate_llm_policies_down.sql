-- Rollback for 0001_soulgate_llm_policies.sql.
-- Drops the RLS policy, then the table.  Reversible: re-running the up
-- migration restores identical schema (index names, constraints).

BEGIN;

DROP POLICY IF EXISTS soulgate_llm_policies_tenant_isolation
    ON _soulgate_llm_policies;

DROP INDEX IF EXISTS idx_soulgate_llm_policies_lookup;
DROP INDEX IF EXISTS idx_soulgate_llm_policies_tenant;

DROP TABLE IF EXISTS _soulgate_llm_policies;

COMMIT;
