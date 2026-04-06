// ──────────────────────────────────────────────────────────────
// Tiresias App Proxy — Baseline Observation Policy
// ──────────────────────────────────────────────────────────────
// MODE: Advisory / Permit-all for baselining
// EXPIRES: 2026-04-12 (one week from deploy)
// PURPOSE: Observe all agent behavior, collect risk scores,
//          behavioral patterns, and audit trail without blocking.
//          Use data to craft production policies.
// ──────────────────────────────────────────────────────────────

// PERMIT ALL: Every agent, every action, every plugin.
// Risk scoring and behavioral analysis still run and log.
// Audit trail captures everything. Nothing is blocked.
permit (
    principal,
    action,
    resource
);
