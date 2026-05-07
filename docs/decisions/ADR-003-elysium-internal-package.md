# ADR-003: Elysium — Vendor In as Internal Package

**Status:** Accepted  
**Date:** 2026-01  
**Deciders:** Platform team  

## Context

`saluca-labs/elysium` (published as `@saluca/asphodel`) provides agent memory capabilities: topic-indexed FTS, hybrid vector search (BM25 + embeddings + RRF), and temporal decay. The platform needs these capabilities in `apps/platform-web` (TypeScript).

Three integration options were considered:

| Option | Description |
|--------|-------------|
| A: npm dependency | Add `@saluca/asphodel` to `package.json`, consume from npm |
| B: Git submodule | Add elysium as a git submodule |
| C: Vendor in | Copy source into `packages/memory`, private package, no npm publish |

## Decision

**Option C: Vendor in** as `@platform/memory` (private, internal-only).

## Rationale

**npm dependency rejected:**
- Public npm package from an org-controlled repo — coupling release cycles
- Package name `@saluca/asphodel` not aligned with `@platform/*` naming
- Any breaking change upstream requires an immediate response
- `publishConfig: { access: "public" }` was set — we don't want accidental re-publication

**Git submodule rejected:**
- Submodules are notoriously poor DX (nested git state, separate clone required)
- History fragmentation — changes to elysium and platform in different repos
- CI complexity: must handle recursive clone or manual submodule update

**Vendor-in chosen:**
- Simple `cp -r` of source at a known commit (`758a4a5`)
- Pinned: no unexpected upstream changes
- Private: `"private": true`, no `publishConfig`, name `@platform/memory`
- Full history of the vendored code is not needed — it's a snapshot
- Changes needed for platform integration can be made directly without upstream coordination

## Implementation

```bash
# Source
elysium commit: 758a4a5

# Destination
packages/memory/
  src/       (from elysium/src)
  tests/     (from elysium/tests)
  tsconfig.json
  vitest.config.ts
  LICENSE
  package.json  (name: @platform/memory, private: true)
  README.md     (notes vendored commit)
```

## Python Access (resolved)

Python services (`apps/platform-api`) consume memory capabilities through a thin Node sidecar:

- **`apps/memory-service/`** — Fastify HTTP service that wraps `@platform/memory`. Exposes `POST /v1/memories`, `GET /v1/memories`, `GET /v1/memories/recall`, `GET /v1/memories/search`, `DELETE /v1/memories/:id`, plus `/health/{live,ready}`. Auth via shared `MEMORY_SERVICE_KEY` header. Refuses to start in production without a key.
- **`packages/memory-client/python/`** — Async `httpx` client (`platform_memory_client.MemoryClient`) that mirrors the JS `Asphodel` API surface. Used by `apps/platform-api`.
- **Compose wiring** — `memory-service` is part of the `default` and `full` profiles. `platform-api` `depends_on: memory-service: service_healthy` so it cannot start before memory is reachable.

This was the recommended follow-up from the original ADR. Other options considered and rejected:

| Option | Why not |
|---|---|
| Python port of the algorithms | Doubles maintenance surface; drifts from upstream elysium. |
| Shared SQLite file across runtimes | Lock contention; SQLite-only (we want Postgres path too); breaks containerization where each service has its own filesystem. |

## Consequences

**Positive:**
- No external registry or network dependency for memory package
- Pinned at a stable version
- Can modify source for platform-specific needs without upstream PRs
- Private package — not accidentally published

**Negative / Tradeoffs:**
- Must manually sync upstream changes (check elysium releases periodically)
- Python services cannot use memory in v1
- Vendored LICENSE must be preserved (Apache-2.0 from elysium)

## Sync Policy

When upstream `saluca-labs/elysium` releases a new version:
1. Review the diff: `git diff 758a4a5..{new-commit} -- src/`
2. Apply relevant changes to `packages/memory/src/`
3. Update `packages/memory/README.md` with new commit hash
4. Run `pnpm --filter @platform/memory test` to verify
