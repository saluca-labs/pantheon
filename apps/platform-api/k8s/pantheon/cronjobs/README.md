# Pantheon CronJobs

Native K8s CronJob plumbing for the `pantheon` namespace on `tiresias-prod`.
All scheduled work that runs inside the pantheon cluster lives here — no
external schedulers (n8n, Activepieces) participate. The CD pipeline builds
the images alongside the six core services and the `kubectl apply -k` phase
in CD picks up new manifests here automatically.

## Layout

| File                    | Purpose                                                 |
|-------------------------|---------------------------------------------------------|
| `rbac.yaml`             | `pantheon-cronjob` ServiceAccount + Role + RoleBinding. Every cronjob in this namespace runs as this SA. |
| `cronjob-template.yaml` | Reference manifest. Copy + replace `<<PLACEHOLDERS>>`. Not applied. |
| `<job>.yaml`            | One file per scheduled job. Each is a `kind: CronJob`. |
| `README.md`             | This file. |

## Naming conventions

- **CronJob `metadata.name`** → `pantheon-<job>` (kebab-case). Cap at 52
  chars so K8s has room to append its 11-char Job suffix.
- **Container name** → `<job>` (drop the `pantheon-` prefix inside the pod).
- **Label `app.kubernetes.io/component`** → stable string used by the
  Prometheus monitor + log filters. Pick once, never change it.
- **Image** → `us-central1-docker.pkg.dev/salucainfrastructure/pantheon/pantheon-<job>:<tag>`.
  Stored alongside the six core service images in the same Artifact Registry
  repo. CD patches the tag at apply time via `kustomize edit set image`.

## Schedule conventions

- **Pick non-round minutes.** Avoid `:00` and `:30` slots. Use the 7-23 or
  37-53 minute range so the pantheon cronjobs don't pile on top of external
  cron-emitting systems (Stripe webhooks, Cloud SQL backups, etc.).
- **Always set `timeZone: "Etc/UTC"` explicitly.** GKE Autopilot will
  otherwise use the node's local time, which can drift if the cluster is
  rebuilt.
- **Always set `startingDeadlineSeconds`.** A missed schedule older than this
  window is NOT retro-fired. Default to `3600` (1 hour) unless you have a
  reason to widen it.

## Concurrency + retries

- **`concurrencyPolicy: Forbid`** is the default. Only switch to `Allow` for
  fire-and-forget producers; never use `Replace` without explicit review.
- **`restartPolicy: OnFailure` + `backoffLimit: 2`** gives 3 total attempts
  before the Job is marked failed and the alert fires. Use `Never` only when
  retries are unsafe (non-idempotent writes).
- **`successfulJobsHistoryLimit: 3` / `failedJobsHistoryLimit: 3`** keep the
  last three Jobs of each kind so `kubectl logs job/...` works for
  post-mortem.

## Adding a new scheduled job

1. **Pick a job name** — kebab-case, ≤ 52 chars including the `pantheon-`
   prefix. e.g. `pantheon-agos-audit-retention`.
2. **Scaffold the Node entry** under `apps/cronjobs/<job-name>/`:
   - `package.json` with name `@pantheon-cronjobs/<job-name>`, a `build`
     script (`tsc`), a `typecheck` script (`tsc --noEmit`), and a `start`
     script (`node dist/index.js`).
   - `src/index.ts` — connect via `DATABASE_URL`, do the work, log a JSON
     line with row count + duration, `process.exit(0)`. Defensive defaults
     in env (retention floors, dry-run gates, etc.).
   - `Dockerfile` — `node:22-alpine` base, monorepo-aware pnpm install,
     build with `tsc`, copy `dist/` + `node_modules` into the runtime
     image, `USER app`, `CMD ["node", "apps/cronjobs/<job-name>/dist/index.js"]`.
3. **Add the kustomize manifest** at
   `apps/platform-api/k8s/pantheon/cronjobs/<job>.yaml`. Copy
   `cronjob-template.yaml` and replace every `<<PLACEHOLDER>>` token.
4. **Wire into kustomization.** Append the manifest to the `resources:`
   list in `apps/platform-api/k8s/pantheon/kustomization.yaml`. The
   `rbac.yaml` file is added once and shared by every cronjob.
5. **Wire into CD.** Add a row to the build matrix in
   `.github/workflows/cd.yml` under `build-and-push.strategy.matrix.include`
   pointing at the new Dockerfile + monorepo root as the build context, and
   add the new image short-name to the `for svc in` loop in the
   `Bump image tags via kustomize edit` step.
6. **Tag a release.** The CD pipeline picks up the new image automatically
   on the next `vX.Y.Z` tag push.

## Image expectations

- **Base image** — `node:22-alpine`. Smallest viable footprint; cronjobs
  start cold every time, image pull dominates wall-clock.
- **User** — runs as non-root (`USER app`, uid 1001) and matches the
  template's `securityContext: { runAsNonRoot: true, runAsUser: 1000 }`.
  If you need to write to disk, mount an `emptyDir`. The root filesystem
  is read-only per the template.
- **Healthcheck** — none. CronJobs aren't probed by K8s; the Job either
  exits 0 or it doesn't.
- **Logs** — write structured JSON to stdout. Fluent Bit ships them to the
  central log sink. One line per "event" (start, batch, end).

## Workload Identity bootstrap (one-time, per cluster)

The `pantheon-cronjob` ServiceAccount is annotated with a Workload Identity
binding to a separately-provisioned GCP SA. The Cloud SQL grants live
on that SA, not on `pantheon-sa`, so a compromised cronjob can't write
to anything other than the database.

The GCP-side SA provisioning is currently a TODO in the main RUNBOOK
(`apps/platform-api/k8s/pantheon/RUNBOOK.md`). Until the first cronjob
deploys to prod, the binding annotation is a no-op — the cronjob falls
back to the namespace default SA's IAM. Provision the GCP SA + IAM
bindings BEFORE the first scheduled run that needs database access.
