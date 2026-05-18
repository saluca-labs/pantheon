# soul-service / soul-mcp SPOF runbook

`apps/soul-service/` and `apps/soul-mcp/` are intentionally single-replica.
This document captures the operational posture around that constraint:
why it exists, what protects against incidents, how to plan disruptive
work, and how to recover when something goes wrong.

## The constraint, restated

Both services hold per-pod SQLite state:

| Service | DB file | What it holds |
|---|---|---|
| `soul-service` | `/app/data/active_kb.db` | Tier 0 memory buffer (LRU-evicting hot tier across all sessions) |
| `soul-mcp` | `/app/data/soul-mcp.db` | Mesh + nexus coordination state, session/CoT/transcript bookkeeping |

Scaling either to `replicas: 2+` would split that state across pods, so
both `Deployment` manifests pin `replicas: 1`. The architectural fix
(replicate via Litestream / LiteFS, or abstract storage so deployments
can swap in Postgres) was scoped in issue #150 and explicitly closed
as **not planned** — the operational mitigation in this runbook is the
chosen path instead.

## What protects against incidents

Three things, in order of cost:

1. **PodDisruptionBudget** (`minAvailable: 1`, see `k8s/pantheon/pdb.yaml`).
   Voluntary disruption — node drain, cluster maintenance, autoscaler
   eviction — is blocked unless the operator overrides. Surprise
   single-pod restarts mid-business-hours are off the table.
2. **PersistentVolumeClaim** (see `k8s/pantheon/soul-data-pvc.yaml`).
   Pod restarts no longer wipe state — the SQLite file is on the cluster
   storage layer (GKE `standard-rwo` by default), not in `emptyDir`.
3. **Snapshots** (see "Snapshot automation" below). Cap recovery point
   independent of pod uptime.

PDB + PVC are deployed as part of this change. Snapshots are operator-
provisioned per-cluster — instructions below.

## Planned restart procedure

Use this for: image upgrades, env-var changes, manual rolling restart.
Default rolling-update strategy already covers most cases (`maxSurge: 1,
maxUnavailable: 0`), but the PDB makes voluntary disruption explicit.

```bash
# 1. Take a snapshot first (see "Manual snapshot" below).
./snapshot-soul.sh

# 2. Restart soul-service. The PDB will block; override by deleting the
#    pod directly (the Deployment then recreates it). Same volume claim,
#    so /app/data survives.
kubectl -n pantheon delete pod -l app=soul-service --wait=true

# 3. Watch readiness — startup probe is generous (60s budget).
kubectl -n pantheon get pods -l app=soul-service -w

# 4. Same for soul-mcp.
kubectl -n pantheon delete pod -l app=soul-mcp --wait=true
kubectl -n pantheon get pods -l app=soul-mcp -w
```

Expected restart time per pod: **~10–30 seconds** (image pull cached;
init + DB open + startup probe).

## Manual snapshot procedure

Both DBs are SQLite, so `.dump` works. `soul-service` runs Python +
`sqlite3` module; `soul-mcp` runs Node + `better-sqlite3` against the
same on-disk format — `sqlite3` CLI reads both.

```bash
# Pre-req on the pod: sqlite3 CLI present in the image. The soul-service
# python:3.11-slim base ships it; the soul-mcp node:22-alpine base does
# NOT — add `apk add --no-cache sqlite` to the image, or kubectl cp the
# DB file out and dump locally.

# soul-service Tier 0 snapshot
POD=$(kubectl -n pantheon get pod -l app=soul-service -o jsonpath='{.items[0].metadata.name}')
TS=$(date -u +%Y%m%dT%H%M%SZ)
kubectl -n pantheon exec "$POD" -- sqlite3 /app/data/active_kb.db ".backup /tmp/active_kb-${TS}.db"
kubectl -n pantheon cp "$POD:/tmp/active_kb-${TS}.db" "./snapshots/soul-service-${TS}.db"
gsutil cp "./snapshots/soul-service-${TS}.db" "gs://${BACKUP_BUCKET}/soul-service/${TS}.db"

# soul-mcp mesh/nexus snapshot (cp out first, dump locally)
POD=$(kubectl -n pantheon get pod -l app=soul-mcp -o jsonpath='{.items[0].metadata.name}')
TS=$(date -u +%Y%m%dT%H%M%SZ)
kubectl -n pantheon cp "$POD:/app/data/soul-mcp.db" "./snapshots/soul-mcp-${TS}.db"
gsutil cp "./snapshots/soul-mcp-${TS}.db" "gs://${BACKUP_BUCKET}/soul-mcp/${TS}.db"
```

Use SQLite's `.backup` (online-safe, doesn't block writers) for
`soul-service`. For `soul-mcp`, copying the file directly is safe
because `better-sqlite3` opens the DB in WAL mode by default — the
copy may miss in-flight WAL frames but the resulting DB is consistent
when opened (SQLite ignores orphan WAL on next open).

## Restore procedure

```bash
# 1. Scale the deployment to zero so nothing's holding the file open.
kubectl -n pantheon scale deployment/soul-service --replicas=0
kubectl -n pantheon wait --for=delete pod -l app=soul-service --timeout=60s

# 2. Pull the snapshot back into the PVC. The simplest path is a
#    throwaway pod that mounts the PVC, into which we kubectl cp the
#    snapshot file.
cat <<'EOF' | kubectl -n pantheon apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: soul-restore
  namespace: pantheon
spec:
  containers:
    - name: restore
      image: alpine:3.20
      command: ["sleep", "3600"]
      volumeMounts:
        - name: data
          mountPath: /app/data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: soul-service-data
EOF

kubectl -n pantheon wait --for=condition=Ready pod/soul-restore --timeout=60s
gsutil cp "gs://${BACKUP_BUCKET}/soul-service/${TS}.db" ./restore.db
kubectl -n pantheon cp ./restore.db soul-restore:/app/data/active_kb.db
kubectl -n pantheon delete pod soul-restore

# 3. Scale back up. The new pod opens the restored DB.
kubectl -n pantheon scale deployment/soul-service --replicas=1
kubectl -n pantheon wait --for=condition=Available deployment/soul-service --timeout=120s
```

Same shape for `soul-mcp` (substitute `soul-mcp` everywhere and
`soul-mcp.db` for the DB file).

## RTO / RPO

Measured during first test restore on `pantheon.saluca.com`. Until
that's done, treat these as TBD. After the test, fill in:

| Metric | soul-service | soul-mcp | Notes |
|---|---|---|---|
| RTO (planned restart, PVC-backed) | **TBD** | **TBD** | Pod restart + startup probe |
| RTO (snapshot restore, full DB) | **TBD** | **TBD** | Scale-down + cp + scale-up |
| RPO (snapshot cadence) | **= snapshot interval** | **= snapshot interval** | Operator-chosen; recommend ≤ 1h |

Update this table after running the procedures above end-to-end with
real timing on a non-prod copy or a maintenance window.

## Snapshot automation

The manual procedure above is run-when-needed. For continuous
protection, schedule it. The pantheon namespace already has a CronJob
platform under `k8s/pantheon/cronjobs/` — adding a `soul-snapshot`
CronJob follows the same pattern.

Two design choices the operator has to make first:

1. **Bucket** — where snapshots go. Recommend a dedicated GCS bucket
   with object versioning + lifecycle (delete after N days). Set
   `BACKUP_BUCKET` env on the CronJob.
2. **Access path** — how the CronJob reaches the live pod's DB. Two
   options:
   - **`kubectl exec` from the CronJob.** Needs `pods/exec` RBAC on
     the `pantheon-cronjob` ServiceAccount. RBAC is currently NOT
     granted in this cluster (see `cronjobs/README.md` →
     "IAM permissions required" — `container.roles.create` is missing
     on the CD SA). Re-enable that first, then bind the exec verb.
   - **Co-mount the PVC ReadWriteMany.** The default GKE
     `standard-rwo` storage class doesn't support RWX. Filestore does
     but is expensive. Only sensible if you already use Filestore for
     other workloads.

Once one of those is decided, the CronJob is a copy of
`cronjobs/audit-retention.yaml` with the body swapped for the snapshot
script above. Schedule recommendation: every 30–60 minutes at a
non-round minute (`23 * * * *` for hourly at :23). `concurrencyPolicy:
Forbid`. `successfulJobsHistoryLimit: 3`. `startingDeadlineSeconds:
600` (snapshot is incremental, no point retro-firing a missed slot
older than 10 minutes).

This CronJob is intentionally NOT included in this PR — the access-path
decision is cluster-specific and worth a real conversation.

## What this runbook explicitly does not cover

- **HA failover.** There isn't any. Single-replica is the contract.
- **Cross-region DR.** Restoring from a snapshot into a clean cluster
  works, but cross-region replication of the PVCs themselves is out of
  scope.
- **Live cutover to externalized Tier 0.** That was issue #150 and is
  not planned (see `feedback_pantheon_sqlite_spof_accepted.md` in the
  decision record, or the closure comment on the issue).

## Related

- `k8s/pantheon/pdb.yaml` — PodDisruptionBudgets
- `k8s/pantheon/soul-data-pvc.yaml` — PersistentVolumeClaims
- `k8s/pantheon/soul-service-deployment.yaml` — soul-service Deployment
- `k8s/pantheon/soul-mcp-deployment.yaml` — soul-mcp Deployment
- `k8s/pantheon/cronjobs/README.md` — CronJob conventions + RBAC status
- `apps/soul-service/VENDORED.md` — upstream relationship + vendor policy
