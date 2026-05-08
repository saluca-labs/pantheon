# Element Web — Tiresias Matrix Console

This directory ships the static configuration for the
[`vectorim/element-web`](https://hub.docker.com/r/vectorim/element-web)
container that backs **V-08** of the
[Matrix integration plan](../../tiresias-matrix-integration-plan.md).

## Why this exists

V-08 of the plan calls for:

> Element Web or Cinny renders in `platform-web` for primary user — Log
> in as primary user; confirm Matrix console loads in dashboard.

PR E (matrix sequence) implements this by:

1. Adding an Element Web service to the Compose `matrix` profile.
2. Mounting `apps/matrix-bridge/element/config.json` into the container
   so Element points at the **internal** Synapse URL (`http://synapse:8008`)
   and not at any public homeserver.
3. Adding a Next.js rewrite in `apps/platform-web/next.config.ts` so
   `/_matrix/element/*` proxies to the Compose service. This keeps the
   browser on the same origin as the dashboard and avoids iframe / CORS
   pain.
4. Rendering an `<iframe>` at
   `/dashboard/matrix-console` for **admin-role** primary users only.
   See `apps/platform-web/src/app/(dashboard)/dashboard/matrix-console/`.

## Config notes

- `disable_custom_urls: true` — users cannot point this Element instance
  at a different homeserver. Combined with `default_server_config`
  pinned to the internal Synapse, this enforces V-09 from the browser
  side as well.
- `disable_guests: true` and `disable_3pid_login: true` — only
  appservice-provisioned (Tiresias-owned) users can sign in. Aligns
  with the user provisioning rules from PR A.
- `room_directory.servers: []` — Element will not list rooms from
  external federated servers; combined with Synapse's own
  `federation_domain_whitelist: []` (PR A) this keeps the deployment
  self-contained.
- `default_theme: "dark"` matches the platform-web palette
  (`#0f1117` background, `#1a1d27` cards) so the embed feels native.

## Smoke procedure (V-08)

```bash
$ cp .env.example .env  # fill MATRIX_HS_TOKEN, MATRIX_AS_TOKEN, etc.
$ docker compose --profile matrix up -d
$ # In a separate terminal, start platform-web:
$ pnpm --filter @tiresias/platform-web dev
$ # Visit http://localhost:3000/dashboard/matrix-console as an admin user.
$ # Expect: Element renders inside the dashboard chrome, login prompt
$ # already pinned to "tiresias.local" homeserver.
```

A non-admin (member or viewer) visiting the same URL should see the
"Restricted to primary humans" card; no iframe is rendered.

License: Apache-2.0
