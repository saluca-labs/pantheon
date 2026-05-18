# Architecture

This document has moved. For the current Pantheon system architecture, see:

- **[`docs/architecture/system-overview.md`](../../../docs/architecture/system-overview.md)** — top-level system overview
- **[`docs/architecture/module-boundaries.md`](../../../docs/architecture/module-boundaries.md)** — module ownership and dependency boundaries
- **[`docs/architecture/agentic-os.md`](../../../docs/architecture/agentic-os.md)** — Agentic OS layer architecture
- **[`docs/architecture/audit-log.md`](../../../docs/architecture/audit-log.md)** — cross-OS audit log model
- **[`docs/architecture/soul-stack.md`](../../../docs/architecture/soul-stack.md)** — SoulAuth / SoulKey / agent identity stack

The repo-root `docs/architecture/` tree is the canonical source of
truth and is Pantheon-native. The pre-Pantheon `apps/platform-api/`
architecture doc has been retired to avoid maintaining two
descriptions of the same system.

For platform-api's per-service surface (endpoints, code layout,
endpoints), see [`apps/platform-api/README.md`](../README.md).
