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

## Hardening (PR G)

The appservice ships a defense-in-depth pass on the request edge,
token handling, and observability surface:

- **Constant-time HS_TOKEN compare** — `_check_hs_token` uses
  `hmac.compare_digest` on UTF-8-encoded bytes, removing the timing
  side-channel that a plain `==` compare would expose.
- **Body-size cap** — `PUT /transactions/{txn_id}` rejects payloads
  larger than `MATRIX_TRANSACTION_MAX_BYTES` (default `5242880` = 5 MiB)
  with `413 Payload Too Large`. Enforced twice for defense in depth:
  once on the `Content-Length` header (cheap pre-read reject) and once
  on `len(raw)` after read (catches chunked / mis-stated bodies).
- **Sender allowlist** — within an authenticated transaction, each
  inbound `m.room.message` is filtered against an allowlist of senders
  scoped to `MATRIX_SERVER_NAME`: literal `@tiresias-bot:` and
  `@user-primary:`, plus the regex `^@agent-[A-Za-z0-9._\-]+:server$`.
  Disallowed events are dropped and counted; the rest forward to
  SoulWatch as normal. Set `MATRIX_SENDER_ALLOWLIST_DISABLED=1` to
  bypass (e.g. for one-off federation-debug deployments).
- **`/healthz` vs `/readyz` split** — `/healthz` is a cheap liveness
  probe (always 200 if the process is up). `/readyz` is a readiness
  probe: it issues an unauthenticated `GET` to Synapse's federation
  `/v1/version` (2 s timeout) and a `HEAD` against the configured
  SoulWatch ingest URL. Either failure returns `503` with a
  structured JSON body identifying the failing dep.
- **Structured JSON logs + redaction** — `configure_logging()`
  installs a `JsonFormatter` and a `RedactingFilter` on the root
  logger. The filter scrubs `Bearer <token>` patterns and known
  sensitive header names (`authorization`, `x-as-token`, `x-hs-token`)
  in both `record.msg` and `record.args`, replacing values with the
  literal string `[REDACTED]` so log shippers can detect that scrubbing
  occurred. Body excerpts in logs are truncated to 256 chars by
  default.
- **Forwarder lifecycle** — `EventForwarder` now keeps a long-lived
  `httpx.AsyncClient` (lazy-init via `_get_client()`) and closes it
  exactly once during the FastAPI lifespan shutdown. Tests can inject
  their own client; the forwarder leaves injected clients alone on
  `aclose()` (`_owns_client` flag).

Env vars added in PR G (see `.env.example`):

- `MATRIX_TRANSACTION_MAX_BYTES` — body-size cap in bytes; default
  `5242880` (5 MiB)
- `MATRIX_SENDER_ALLOWLIST_DISABLED` — `1`/`true`/`yes`/`on` disables
  the allowlist (default off — allowlist is **enabled**)

## Element Web embed (V-08, PR E)

The Compose `matrix` profile also runs a `vectorim/element-web`
container (see `element/config.json` and the `element` service in
`docker-compose.yml`). It is reachable only from inside the Compose
network; `apps/platform-web/next.config.ts` adds a rewrite so
`/_matrix/element/*` proxies to it, keeping the dashboard iframe
same-origin. The console page lives at `/dashboard/matrix-console`
and is gated to `Role.ADMIN` via `RoleGate`.

## Status

All seven planned matrix PRs have shipped:

- **PR A** — scaffold (Synapse config + appservice skeleton)
- **PR B** — Cedar `TiresiasMatrix` policies (matrix-001..matrix-007)
- **PR C** — detection rules (matrix-001..004) + `pb-007-isolate-matrix-room`
- **PR D** — `event_forwarder` → `/ingest/matrix` SoulWatch wiring
- **PR E** — Element Web dashboard embed (V-08)
- **PR F** — Seed rooms minted on appservice startup
- **PR G** — Hardening: structured logs, body-size cap, sender allowlist, `/healthz` vs `/readyz` split, `hmac.compare_digest` on HS_TOKEN

## See also

- [tiresias-matrix-integration-plan.md](../../tiresias-matrix-integration-plan.md) — full APE/V plan
- [Cedar policy guide](../platform-app-proxy/docs/cedar-policy-guide.md) — schema extended in PR B
- [docs/security/auth-model.md](../../docs/security/auth-model.md) — the platform's auth surface that Matrix bot accounts plug into
- [element/README.md](./element/README.md) — V-08 Element Web embed details
