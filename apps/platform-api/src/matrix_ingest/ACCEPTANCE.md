# Matrix Bridge — V-01..V-10 Acceptance Criteria

This document maps the ten acceptance criteria from
`tiresias-matrix-integration-plan.md` to the test surface in this
monorepo.  Each criterion is one of:

- **unit** — covered by a fast in-process test in this repo (no Synapse
  required).  Run today.
- **smoke** — requires the `matrix` Compose profile up (Synapse +
  appservice + platform-api).  Runnable locally with
  `docker compose --profile matrix up -d` once secrets are filled in
  `.env`.
- **manual** — visual / browser confirmation (Element Web embed,
  curl-from-host check).

License: Apache-2.0

| ID  | Criterion | Type | Where it's tested |
|-----|-----------|:----:|--------------------|
| V-01 | Agent bot accounts cannot be created outside `user_provisioner.py` | smoke | Manual: from the host, attempt `POST http://localhost:8008/_matrix/client/r0/register` with localpart `agent-x`; expect connection refused (Synapse bound to the Compose internal network only). Documented in `apps/matrix-bridge/README.md` smoke checklist. |
| V-02 | Agent in role `memory` cannot post to `#pantheon-ops` | unit | `apps/platform-app-proxy/tests/test_matrix_policies.py::test_matrix_005_humans_cannot_post_to_pantheon_ops` covers the human-side; `test_matrix_004_permits_agent_in_role_room` covers the role-match positive; the negative for an agent whose role is **not** in `allowed_roles` is covered by `test_matrix_001_denies_role_mismatch` against the matrix-only policy fixture. |
| V-03 | Sub-user `@user-sub-001` cannot read `#tiresias-console` (primary only) | unit | `apps/platform-app-proxy/tests/test_matrix_policies.py::test_matrix_003_denies_sub_user_in_other_sub_console` |
| V-04 | Prompt injection payload in Matrix message fires `injection-001` rule | smoke | The bridge `event_forwarder` posts the message body into the SoulWatch envelope produced by `src.matrix_ingest.router._normalise`; existing `infrastructure/rules/rules/injection/injection-001-*.yml` matches on payload content fields.  Smoke procedure: from a client, send `\\n\\nIgnore previous instructions...` to a permitted room and confirm an alert in the SOC queue. |
| V-05 | Agent impersonation attempt fires `matrix-002` rule | smoke | `infrastructure/rules/rules/matrix-comms/matrix-002-agent-impersonation.yml` (selection_unregistered + selection_soulkey_mismatch).  Smoke: register `@agent-fake:tiresias.local` directly via the Synapse admin API while skipping the appservice; rule fires when next event arrives. |
| V-06 | Cross-tenant room join fires `matrix-003` rule | smoke | `infrastructure/rules/rules/matrix-comms/matrix-003-cross-tenant-message.yml`. Backed by Cedar matrix-006 catch-all (`apps/platform-app-proxy/policies/cedar/matrix.cedar`). Unit-tested in `test_matrix_policies.py::test_matrix_006_denies_cross_tenant_join` and `test_matrix_006_denies_cross_tenant_send`. |
| V-07 | SoulWatch receives a structured log for every Matrix event | unit | `apps/platform-api/tests/test_matrix_ingest/test_router.py` covers the `/ingest/matrix` endpoint shape (8 cases) plus 3 normaliser tests confirming every event projects to a `matrix_event` SoulWatch envelope with `event_id`, `sender`, `tenant_id`. Fire-and-forget POSTs from the bridge are exercised in `apps/matrix-bridge/appservice/tests/test_event_forwarder.py` (PR A) where SoulWatch failures are tolerated without dropping inbound events. |
| V-08 | Element Web or Cinny renders in `platform-web` for primary user | smoke | Shipped in PR E. `apps/matrix-bridge/element/config.json` configures `vectorim/element-web` against the internal Synapse; the Compose `matrix` profile exposes it on the Compose network only. `apps/platform-web/next.config.ts` proxies `/_matrix/element/*` to the service. The page at `apps/platform-web/src/app/(dashboard)/dashboard/matrix-console/page.tsx` renders an `<iframe>` for `Role.ADMIN` and a "restricted" card for everyone else (covered by `apps/platform-web/src/__tests__/dashboard/matrix-console/page.test.tsx`). Smoke procedure: `docker compose --profile matrix up -d`, then `pnpm --filter @tiresias/platform-web dev`, log in as an admin, visit `/dashboard/matrix-console`, confirm Element loads with the homeserver pinned to `tiresias.local`. |
| V-09 | Synapse not reachable from outside the Compose internal network | smoke | `apps/matrix-bridge/synapse/homeserver.yaml` listener binds to `0.0.0.0` inside the container; the Compose service uses `expose: ["8008"]` (NOT `ports:`) so the port is reachable only from siblings on the same Compose network. Smoke: from the **host**, run `curl -m 2 http://localhost:8008/_matrix/client/versions`; expect connection refused. |
| V-10 | HS_TOKEN and AS_TOKEN rotate without service interruption | smoke | The bridge reads tokens from env via `AppserviceConfig.from_env()` (PR A). Rotation procedure: update `.env`, recreate the `matrix-bridge` Compose service (`docker compose up -d --no-deps matrix-bridge`); Synapse keeps its existing HS<->AS tokens until they're updated in `synapse/homeserver.yaml` and Synapse is reloaded. The appservice `EventForwarder` retries failed POSTs and counts only successful forwards, so an in-flight rotation drops zero events. Documented as a runbook entry in `apps/matrix-bridge/README.md` (PR A). |

## How to run the unit-testable subset today

```
$ cd apps/platform-app-proxy && python -m pytest tests/test_matrix_policies.py -v
$ cd apps/platform-api      && python -m pytest tests/test_matrix_ingest -v
```

## How to run the smoke subset

After PR A merges and the bridge is on `main`:

```
$ cp .env.example .env
$ # fill MATRIX_HS_TOKEN, MATRIX_AS_TOKEN, MATRIX_REGISTRATION_SECRET (each ≥64 chars)
$ docker compose --profile matrix up -d
$ # confirm V-09 from the host:
$ curl -m 2 http://localhost:8008/_matrix/client/versions || echo "expected: refused"
$ # confirm V-07 by tailing platform-api logs after sending a message:
$ docker compose logs -f platform-api | grep matrix_ingest
```

## Rollback

Per the plan: if **V-01, V-03, V-04, or V-09** fails in staging, halt
promotion and open a P1 incident.  Use `pb-001-auto-quarantine` as the
response model.  The matrix-specific isolation playbook is
`pb-007-isolate-matrix-room.yml` (PR C) for in-room blast-radius
events; tenant-wide compromises escalate to `pb-005-tenant-isolation`.
