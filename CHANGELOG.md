# Changelog

All notable changes to the Tiresias App Proxy are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-05

Initial release of the Tiresias App Proxy.

### Added

- **Cedar policy engine** -- declarative authorization for every tool call. Supports `permit` and `forbid` rules with typed entity schema (Agent, Plugin, Tenant). Thread-safe evaluation with automatic hot-reload every 30 seconds. Schema validation prevents deployment of malformed policies.

- **MCP plugin dispatch** -- proxy layer between AI agents and MCP plugin servers. Plugin manifests define available tools, transport configuration, and classification. Health polling detects unresponsive plugins.

- **Risk scoring** -- contextual 0-100 risk assessment for every tool call. Six weighted factors: tool destructiveness (30), external exposure (25), sensitive data detection (20), off-hours operation (10), blast radius (10), and new agent status (5). Four risk levels (low, medium, high, critical) map to recommendations (allow, review, require approval, block).

- **Behavioral analysis** -- sliding-window threat pattern detection per agent. Five patterns: data exfiltration, privilege escalation, rapid destructive operations, reconnaissance, and approval circumvention. In-memory analysis with O(n) complexity, no database queries in the hot path.

- **Approval queue** -- human-in-the-loop workflow for high-risk and destructive actions. Configurable timeout with automatic denial. Webhook notifications for external integrations. Background sweeper for expired approvals.

- **Audit logging** -- immutable audit trail for every tool call with SHA-256 hash chain integrity. Records policy decisions, risk scores, behavioral alerts, and approval status. Configurable retention period.

- **Sensitive data detection** -- regex-based scanning for credit card numbers, SSNs, API keys, email addresses, URLs, and PII keywords. Detected patterns increase risk scores and trigger argument masking in audit logs.

- **Wasm plugin sandbox** -- WebAssembly runtime for isolated plugin execution via Wasmtime. Capability-based host function injection (only declared capabilities are available). Configurable fuel limits (default 1B instructions) and memory limits (default 16 MiB). Dual backend: wasmtime Python bindings (preferred) or CLI subprocess (fallback).

- **Compliance framework mappings** -- built-in control definitions for SOC 2 Type II (7 controls), NIST AI RMF 1.0 (6 controls), and EU AI Act Article 14 (4 controls). API endpoints for compliance report generation with evidence mapping and gap analysis.

- **Scheduled tool calls** -- cron-based scheduling of tool calls with full policy evaluation. Managed via REST API.

- **Authentication** -- API key authentication with SHA-256 hashing and timing-safe comparison. Separate admin key for privileged operations. Dev mode (no auth) when keys are not configured.

- **Structured logging** -- JSON-formatted logs via structlog with contextual fields (agent_id, tenant_id, plugin_id, action, decision, risk_score).

- **Docker deployment** -- multi-stage Dockerfile with unprivileged runtime user. SQLite default with PostgreSQL support for production. Health endpoint at `/health`.

- **Rate limiting** -- in-memory sliding window rate counter. Cedar policies reference `rate_count` to enforce per-agent rate limits.

### Security

- API keys stored as SHA-256 hashes only; raw keys never persisted.
- Timing-safe comparison (`hmac.compare_digest`) prevents side-channel attacks.
- Wasm plugins execute in isolated sandboxes with capability-based access control.
- Cedar policy validation prevents deployment of malformed authorization rules.
- Audit log hash chain provides tamper detection.
- Container runs as unprivileged `appproxy` user.

[0.1.0]: https://github.com/crisianxruvalcaba-coder/app-proxy/releases/tag/v0.1.0
