# `components/agentic-os/` — Per-OS Client UI

Client components for the [Agentic OS](../../../../../docs/architecture/agentic-os.md) layer. Each per-OS folder mirrors a slug in `src/lib/agentic-os/registry.ts`.

## Layout

```
plan-viewer.tsx         Renders content/agentic-os/<slug>.md (markdown + footnotes)
settings/               Per-user feature flag toggle list (drives /dashboard/os/settings)
audit/                  Cross-OS audit log table + filter chips
health/, maker/, …      Per-OS feature components (forms, lists, charts)
```

## Conventions

- **Server-first.** Default to RSC. Mark a component `'use client'` only when it needs state, effects, or browser APIs.
- **No direct DB / pool imports** — components call BFF routes (`/api/tiresias/agentic-os/<slug>/...`). See `src/lib/agentic-os/README.md` for the server side.
- **Slug parity.** Folder names match the slug in `registry.ts` exactly. Adding a new OS adds a new folder here only if it has bespoke UI; the generic plan viewer covers the default case.
- **Feature flag awareness.** Don't render an OS-specific surface without checking the flag. Resolution happens server-side ([feature-flags.md](../../../../../docs/architecture/feature-flags.md)); the client only needs the resolved boolean.

## See Also

- [agentic-os.md](../../../../../docs/architecture/agentic-os.md) — full topology
- [registry.ts](../../lib/agentic-os/registry.ts) — module list
- [plan-viewer.tsx](./plan-viewer.tsx) — generic per-slug plan renderer
