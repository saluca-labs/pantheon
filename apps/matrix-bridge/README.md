# matrix-bridge

Synapse Matrix homeserver + Tiresias appservice. Provides the real-time inter-agent and agent↔user communication channel for the platform.

License: Apache 2.0 — matches `infrastructure/rules/` and the upstream Synapse + Matrix license.

## TL;DR

```
synapse/                      Matrix homeserver config (Apache 2.0, upstream image)
  homeserver.yaml             localhost-only listener; uses platform Postgres
  log.config.yaml             structured stdout logs for SoulWatch tail
appservice/                   Tiresias appservice — bridges Matrix → SoulWatch
  tiresias-appservice.yaml    Synapse appservice registration
  Dockerfile                  Multi-stage Python 3.11 image
  pyproject.toml              FastAPI + httpx; no GPL deps
  src/
    main.py                   /transactions/{txn_id} → SoulWatch ingest; lifespan seed-room bootstrap
    synapse_admin.py          Async httpx client for /_synapse/admin/v1 + /_matrix/client/v3
    seed_rooms.py             Bootstrap that mints canonical rooms on startup (PR F)
    user_provisioner.py       Stub — creates Matrix bot accounts from agent registry
    room_provisioner.py       RoomProvisioner.ensure() — idempotent alias-resolve-or-create (PR F)
    event_forwarder.py        Stub — fanout helper for outbound events
  tests/
    test_main.py              HS_TOKEN auth, transaction handler smoke
    test_synapse_admin.py     SynapseAdminClient against httpx.MockTransport
    test_seed_rooms.py        Bootstrap idempotency, power-level overlays, error tolerance
    test_provisioners.py      RoomProvisioner.ensure() resolve/create paths
```

## Why a separate app?

The integration plan ([tiresias-matrix-integration-plan.md](../../tiresias-matrix-integration-plan.md)) calls for one homeserver per deployment, bound to localhost, with the only entry being SoulGate. Keeping Synapse and the appservice in their own app:

- Lets us version their compose stanza and registration file together.
- Lets `infrastructure/rules/` ship Matrix detection rules without depending on Synapse images.
- Keeps the Tiresias appservice's Python deps isolated from `platform-api`.

## Boot order

```
db (Postgres)            ← shared with platform-api
   ↓
synapse                  ← reads homeserver.yaml; localhost-only listener
   ↓
matrix-bridge            ← FastAPI appservice; registers with Synapse via HS_TOKEN
   ↓
platform-api             ← future: receives /ingest/matrix posts (PR D)
```

## Local dev

The default Compose profile does **not** start Matrix. To bring it up:

```bash
docker compose --profile matrix up --build
```

You will need to supply secrets in `.env`:

```dotenv
MATRIX_SERVER_NAME=tiresias.local
MATRIX_HS_TOKEN=<openssl rand -hex 32>
MATRIX_AS_TOKEN=<openssl rand -hex 32>
MATRIX_REGISTRATION_SECRET=<openssl rand -hex 32>
```

See `.env.example` for the full reference.

## Seed rooms (PR F)

When `SEED_ROOMS_ON_BOOT=1`, the FastAPI lifespan hook mints four
canonical rooms on startup using `SynapseAdminClient` + `RoomProvisioner`.
All four are **idempotent**: re-running the bootstrap resolves existing
aliases via `GET /_matrix/client/v3/directory/room/{alias}` and reuses
the room rather than creating a duplicate.

| Alias                                  | Purpose                          | Power-level shape                                |
|----------------------------------------|----------------------------------|--------------------------------------------------|
| `#tiresias-console:${MATRIX_SERVER_NAME}` | Operator ↔ bot console        | Primary user invited; agents may write           |
| `#pantheon-ops:${MATRIX_SERVER_NAME}`     | Agent-only ops channel        | `m.room.message` PL=100 — humans cannot send    |
| `#notifications:${MATRIX_SERVER_NAME}`    | Agent-write / human-read feed | `events_default=50` — only agents+ may send     |
| `#tiresias-audit:${MATRIX_SERVER_NAME}`   | Bot-only audit log            | Only the appservice bot (PL=100) may write      |

All four enforce: `m.room.history_visibility=invited`,
`m.room.join_rules=invite`, `state_default=100` (state edits bot-only),
`m.room.power_levels`/`history_visibility`/`join_rules`/`canonical_alias`
bot-only. Bot=100, primary=75, agent_default=50, sub-agent=25.

The appservice registration (`tiresias-appservice.yaml`) reserves three
alias namespaces under `${MATRIX_SERVER_NAME}`: `#tiresias-.*`,
`#pantheon-.*`, `#notifications` — all `exclusive: true`. The Cedar
`pantheon-ops` policy (PR B, matrix-005) keys on the literal
`pantheon-ops` localpart, so this is the canonical alias for the
operationally-named `#pantheon` channel.

Env vars (see `.env.example`):

- `MATRIX_TENANT_ID` — embedded in seed-room topics; defaults to `default`
- `SEED_ROOMS_ON_BOOT` — `1`/`true`/`yes`/`on` enables bootstrap; default off
- `MATRIX_SERVER_NAME` — server-name half of the alias (existing)
- `MATRIX_AS_TOKEN` — used by the admin client to authenticate as the bot (existing)
- `SYNAPSE_URL` — base URL the admin client targets (existing)

For tests and bring-your-own-rooms deployments, leave `SEED_ROOMS_ON_BOOT=0`
(the default). Bootstrap is also opt-out at runtime by passing
`seed_bootstrap=` directly to `create_app()`.

## Element Web embed (V-08, PR E)

The Compose `matrix` profile also runs a `vectorim/element-web`
container (see `element/config.json` and the `element` service in
`docker-compose.yml`). It is reachable only from inside the Compose
network; `apps/platform-web/next.config.ts` adds a rewrite so
`/_matrix/element/*` proxies to it, keeping the dashboard iframe
same-origin. The console page lives at `/dashboard/matrix-console`
and is gated to `Role.ADMIN` via `RoleGate`.

## Status

Six of seven planned matrix PRs have shipped; PR G (hardening) is next:

- **PR A** — scaffold (Synapse config + appservice skeleton)
- **PR B** — Cedar `TiresiasMatrix` policies (matrix-001..matrix-007)
- **PR C** — detection rules (matrix-001..004) + `pb-007-isolate-matrix-room`
- **PR D** — `event_forwarder` → `/ingest/matrix` SoulWatch wiring
- **PR E** — Element Web dashboard embed (V-08)
- **PR F** — Seed rooms minted on appservice startup (this PR)
- **PR G** — hardening: structured logs, body-size cap, sender allowlist, health-vs-readiness split (planned)

## See also

- [tiresias-matrix-integration-plan.md](../../tiresias-matrix-integration-plan.md) — full APE/V plan
- [Cedar policy guide](../platform-app-proxy/docs/cedar-policy-guide.md) — schema extended in PR B
- [docs/security/auth-model.md](../../docs/security/auth-model.md) — the platform's auth surface that Matrix bot accounts plug into
- [element/README.md](./element/README.md) — V-08 Element Web embed details
