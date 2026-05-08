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

## Status

This is **PR A — scaffold only**. The provisioner and forwarder modules are stubs that import cleanly and have unit tests, but they don't talk to `platform-api` or `SoulWatch` yet. PR B adds the Cedar policies; PR C adds the detection rules; PR D wires the SoulWatch ingest.

## See also

- [tiresias-matrix-integration-plan.md](../../tiresias-matrix-integration-plan.md) — full APE/V plan
- [Cedar policy guide](../platform-app-proxy/docs/cedar-policy-guide.md) — how PR B will extend the schema
- [docs/security/auth-model.md](../../docs/security/auth-model.md) — the platform's auth surface that Matrix bot accounts plug into
