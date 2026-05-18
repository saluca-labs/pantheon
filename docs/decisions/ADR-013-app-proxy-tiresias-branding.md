# ADR-013: Tiresias App Proxy Branding Carve-Out (Pantheon Umbrella)

**Status:** Accepted  
**Date:** 2026-05-17  
**Deciders:** Cristian (sole maintainer at decision time)  
**Related:** [ADR-011 — Pantheon rename](./ADR-011-pantheon-rename.md)

## Context

[ADR-011](./ADR-011-pantheon-rename.md) renamed the umbrella platform
to **Pantheon**. The natural follow-up question is whether every
sub-product, every package, and every code namespace should also
adopt the Pantheon name.

The sub-product most affected by that question is the **Tiresias App
Proxy** (`apps/platform-app-proxy/`). The App Proxy is the
agent-facing zero-trust security proxy: it intercepts agent traffic,
enforces Cedar policy, exchanges SoulKeys for short-lived capability
tokens, and feeds SoulWatch observability. It has accumulated
distinct external positioning under the Tiresias name — partners
integrate against it, the published SDKs target it, and documentation
references it as a standalone product surface.

Renaming the App Proxy to "Pantheon Proxy" or similar would:

1. Break external SDK consumers (`tiresias-sdk` Python and Node
   packages reference the Tiresias proxy by name in their public
   APIs).
2. Invalidate published docs and partner integrations.
3. Confuse the carve-out story: the App Proxy is meaningfully
   different from the rest of Pantheon (agent-facing vs user-facing,
   zero-trust enforcement vs operator dashboard), and a distinct
   brand reflects that difference.

There are also related code-namespace artifacts that would be costly
to rename:

- The Python package namespace `apps/platform-api/src/tiresias/`
  contains the proxy, the dashboard, the encryption providers, the
  policy loader, the analytics emitter, etc.
- The service name `tiresias-proxy` is referenced in compose files,
  k8s manifests, internal DNS, and CI.
- Cedar policy identifiers like `TiresiasMatrix`, `TiresiasAuth`,
  etc., are code-namespace literals.

## Decision

The **Tiresias App Proxy is an intentional branding carve-out under
the Pantheon umbrella.** This carve-out covers:

1. **`apps/platform-app-proxy/`** — all docs, README, CHANGELOG,
   SECURITY, and integration guides keep "Tiresias App Proxy"
   branding. URL fixes and version bumps continue, but the name does
   not get changed to Pantheon.

2. **`apps/platform-api/src/tiresias/`** Python namespace — stays as
   the literal import path. Code touching this directory does not
   need to be renamed.

3. **`tiresias-proxy` service name** — stays as the compose service
   name, the k8s deployment name, and the internal hostname.

4. **Cedar policy identifiers** that include `Tiresias*` strings —
   stay as code-namespace literals.

5. **The SDKs** (`apps/platform-api/sdk/` Python and
   `apps/platform-api/sdk/node/`) keep the Tiresias name because
   they target the Tiresias App Proxy directly.

6. **Sigma detection rules** in `infrastructure/rules/` target the
   Tiresias App Proxy and reference Tiresias logsource identifiers;
   the README has been reframed as "Pantheon Detection Rules" but
   the rules themselves keep their Tiresias logsource bindings.

What is **not** covered by the carve-out (and therefore IS renamed to
Pantheon, per ADR-011):

- The umbrella platform name, the repo name, the GH org positioning.
- The platform-web dashboard, the platform-api FastAPI service
  prose, READMEs in `apps/platform-web/`, `apps/matrix-bridge/`,
  `apps/memory-service/`, `packages/*`, etc.
- The user-facing docs at `docs/` (root).
- The contributor docs at `docs/architecture/` and
  `docs/decisions/`.

## Consequences

**Positive:**

- SDK consumers and partners with existing Tiresias App Proxy
  integrations are unaffected by the Pantheon rename.
- The doc audit (`Z:/_planning/WAVE_I_DOC_AUDIT.md`) classified
  `apps/platform-app-proxy/docs/*` as FRESH on the name axis — this
  ADR makes that classification official and tells future doc passes
  not to rebrand the App Proxy.
- The carve-out is documented as a decision rather than treated as a
  bug or an inconsistency. Future contributors reading
  `apps/platform-app-proxy/README.md` and seeing "Tiresias" can find
  this ADR and understand why.

**Negative / trade-offs:**

- New contributors will encounter two names — Pantheon (umbrella)
  and Tiresias (App Proxy carve-out) — and need a one-paragraph
  explainer somewhere they can find quickly. The repo-root
  `CONTRIBUTING.md` covers this in its "Repo layout" section.
- Branding consistency across the monorepo is by design imperfect.
  Search-and-replace on "Tiresias" is the wrong tool — anyone doing
  it needs to know which files are carve-out and which are not.
- The Python namespace will keep showing up in stack traces and
  imports forever. This is a known cost; renaming it is not on the
  roadmap.

## Operational rules

1. **Do not bulk-rename "Tiresias" to "Pantheon" via sed.** Walk
   each file and decide based on this ADR.
2. **If a doc lives under `apps/platform-app-proxy/`, default to
   keeping Tiresias branding.** That directory is the carve-out.
3. **If a code path imports from `tiresias.*` or references the
   `tiresias-proxy` service name, leave it alone.** Those are
   literals.
4. **Everything else defaults to Pantheon.** When in doubt, the
   umbrella is Pantheon and only the App Proxy is the exception.

## See also

- [ADR-011](./ADR-011-pantheon-rename.md) — the umbrella rename
  decision that this ADR carves out from.
- `apps/platform-app-proxy/README.md` — the App Proxy README itself,
  intentionally Tiresias-branded.
- [`Z:/_planning/WAVE_I_DOC_AUDIT.md`](Z:/_planning/WAVE_I_DOC_AUDIT.md)
  — the audit that classified `apps/platform-app-proxy/docs/*` as
  FRESH on the name axis.
