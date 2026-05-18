# Pantheon Platform Overview

Pantheon is a local-first, open-source platform for running personal
and small-team agentic software. It bundles a FastAPI core
(platform-api), a Next.js dashboard (platform-web), and a set of nine
domain-specific "Agentic OS" modules into one repo you can clone,
configure, and run on your own machine.

## What's in it

- **Agentic OS layer** — nine product surfaces (Health, Maker,
  Filmmaker, CyberSec, Secure Dev, Research, Business, Creator,
  Autobiographer) sharing one dashboard shell, one audit log, and
  one identity boundary. See [`AGENTIC_OS_TOUR.md`](AGENTIC_OS_TOUR.md).
- **Agent platform** — first-class `Agent` + `Prompt` resources with
  per-tenant BYOK provider keys, `agent.yaml` bulk import, and an
  append-only prompt versioning model. See
  [`AGENTS_GUIDE.md`](AGENTS_GUIDE.md).
- **Configurable agent store** — adapter-pluggable persistence layer.
  Two adapters ship: `LocalPg` (default, no extra setup) and
  `Supabase` (managed Postgres via service-role key). See
  [`docs/operations/store-adapter-config.md`](../../../docs/operations/store-adapter-config.md).
- **BYOK provider keys** — bring your own Anthropic / OpenAI / Gemini
  / Groq / Ollama credentials per tenant; Pantheon stores only a
  `secret_ref` URI (e.g. `env://VAR_NAME`), never the resolved value.
  See [`docs/operations/byok-provider-keys.md`](../../../docs/operations/byok-provider-keys.md).
- **SoulAuth federated identity** — separate Python service for user
  auth; supports local accounts (bcrypt), LDAP / Active Directory,
  and OIDC. See
  [`docs/operations/soulauth-integration.md`](../../../docs/operations/soulauth-integration.md).
- **Tiresias App Proxy** — a separately-branded sub-product
  (`apps/platform-app-proxy/`) for policy-mediated AI app routing.
  Stays Tiresias-branded by design; see its
  [README](../../platform-app-proxy/README.md).

## What's not in it

- **No license key, no tier gate.** All features are available in
  every deployment.
- **No required external service.** Supabase is one of two store
  adapters, not a requirement. No required Stripe, no required
  enterprise IdP.
- **No partner program, no MSSP layer.** Pantheon is for one operator
  (or one small team) running their own stack.
- **No compliance certifications claimed.** The audit trail and
  policy engine are tools you can use to meet your own compliance
  obligations; Pantheon itself ships no certifications.

## Run it

```bash
git clone https://github.com/salucallc/pantheon.git
cd pantheon
cp .env.example .env
pnpm bootstrap
pnpm docker:up
```

15-minute quickstart: [`docs/operations/quickstart.md`](../../../docs/operations/quickstart.md).

## Documentation map

- **End users** — [`USER_GUIDE.md`](USER_GUIDE.md),
  [`AGENTS_GUIDE.md`](AGENTS_GUIDE.md),
  [`AGENTIC_OS_TOUR.md`](AGENTIC_OS_TOUR.md)
- **Self-hosters** — [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md) and
  [`docs/operations/`](../../../docs/operations/)
- **Contributors** — [`docs/architecture/system-overview.md`](../../../docs/architecture/system-overview.md)
  and [`docs/decisions/`](../../../docs/decisions/)

## Historical note

This codebase shipped previously as "Tiresias Platform v3.x" — a
closed-source enterprise SaaS with three branded sub-products
(SoulAuth, SoulWatch, SoulGate) and a tiered license model. The repo
has been renamed to Pantheon and reoriented around local-first OSS
deployment. The `tiresias` code namespace (the App Proxy and the
`tiresias-proxy` service) stays Tiresias-branded as a separate
sub-product. SoulAuth, SoulWatch, and SoulGate remain real subsystems
inside platform-api but are not foregrounded as separate products.

See [`CHANGELOG.md`](../CHANGELOG.md) for the version history.
