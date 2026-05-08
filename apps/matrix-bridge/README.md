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
    main.py                   /transactions/{txn_id} → SoulWatch ingest
    user_provisioner.py       Stub — creates Matrix bot accounts from agent registry
    room_provisioner.py       Stub — creates rooms from Cedar policy
    event_forwarder.py        Stub — fanout helper for outbound events
  tests/
    test_main.py              HS_TOKEN auth, transaction handler smoke
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

## Element Web embed (V-08, PR E)

The Compose `matrix` profile also runs a `vectorim/element-web`
container (see `element/config.json` and the `element` service in
`docker-compose.yml`). It is reachable only from inside the Compose
network; `apps/platform-web/next.config.ts` adds a rewrite so
`/_matrix/element/*` proxies to it, keeping the dashboard iframe
same-origin. The console page lives at `/dashboard/matrix-console`
and is gated to `Role.ADMIN` via `RoleGate`.

## Status

All five matrix PRs have shipped:

- **PR A** — scaffold (Synapse config + appservice skeleton)
- **PR B** — Cedar `TiresiasMatrix` policies (matrix-001..matrix-007)
- **PR C** — detection rules (matrix-001..004) + `pb-007-isolate-matrix-room`
- **PR D** — `event_forwarder` → `/ingest/matrix` SoulWatch wiring
- **PR E** — Element Web dashboard embed (V-08)

## See also

- [tiresias-matrix-integration-plan.md](../../tiresias-matrix-integration-plan.md) — full APE/V plan
- [Cedar policy guide](../platform-app-proxy/docs/cedar-policy-guide.md) — schema extended in PR B
- [docs/security/auth-model.md](../../docs/security/auth-model.md) — the platform's auth surface that Matrix bot accounts plug into
- [element/README.md](./element/README.md) — V-08 Element Web embed details
