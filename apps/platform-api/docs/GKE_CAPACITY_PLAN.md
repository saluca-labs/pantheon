# GKE Capacity Plan: tiresias-prod

## Current State (2026-04-10)

**Cluster:** tiresias-prod, us-central1, project salucainfrastructure
**Nodes:** 2x e2-standard-16 (16 vCPU, ~57.5Gi allocatable each)
**Autoscaling profile:** OPTIMIZE_UTILIZATION (balloon pods hold capacity)

### Resource Utilization

| Metric | Node 1 | Node 2 |
|--------|--------|--------|
| CPU actual | 1% | 1% |
| Memory actual | 6% | 5% |
| CPU requests | 97% | 98% |
| Memory requests | 99% | 99% |

Actual usage is under 5%. Requested (reserved) capacity is 97-99%.
The gap is caused by balloon pods (~79Gi combined) and over-provisioned ArgoCD requests.

## Short-Term Fix (Applied 2026-04-10)

1. ArgoCD memory requests reduced from 2Gi to 256Mi on 5 of 6 components (application-controller kept at 1Gi)
2. ArgoCD CPU requests reduced from 500m to 100m on same 5 components
3. External-secrets scaled from 2 replicas to 1 per component (3 deployments)

Expected result: ~8-10Gi memory and ~2000m CPU freed on existing nodes, unblocking pending soulauth and gatus pods.

## Long-Term: GCE Quota Increases Required

Request these increases via GCP Console:
https://console.cloud.google.com/iam-admin/quotas?project=salucainfrastructure

| Quota | Current Limit | In Use | Needed | Request |
|-------|---------------|--------|--------|---------|
| SSD_TOTAL_GB (us-central1) | 500 GB | 450 GB | Each new node adds 100Gi boot disk | 1,000 GB |
| CPUS_ALL_REGIONS (global) | 32 | 20 | Each e2-standard-16 node costs 16 CPUs | 64 |
| IN_USE_ADDRESSES (us-central1) | 8 | 7 | Each node needs 1 external IP | 16 |

### How to Request

1. Go to https://console.cloud.google.com/iam-admin/quotas?project=salucainfrastructure
2. Filter by "SSD_TOTAL_GB", select us-central1, click "Edit Quotas"
3. Set new limit to 1000, add justification: "GKE cluster autoscaling for Tiresias production workloads"
4. Repeat for CPUS_ALL_REGIONS (global) and IN_USE_ADDRESSES (us-central1)
5. Google typically approves within 24-48 hours for reasonable increases

### Alternative: Smaller Node Pool

Instead of e2-standard-16, consider a node pool with e2-standard-4 or e2-standard-8:
- e2-standard-4: 4 vCPU, 16Gi memory, costs 4 CPUs per node (can fit 8 nodes in current quota)
- e2-standard-8: 8 vCPU, 32Gi memory, costs 8 CPUs per node (can fit 4 nodes in current quota)

Smaller nodes give better bin-packing for Tiresias workloads (each pod requests 250m CPU, 256Mi memory).
A pool of 4x e2-standard-8 would provide the same total capacity as 2x e2-standard-16 but with better scheduling granularity and lower per-node SSD quota impact (4x 50Gi = 200Gi vs 2x 100Gi = 200Gi).

## Workload Resource Summary

| Namespace | Deployment | Replicas | CPU Req | Mem Req | Notes |
|-----------|-----------|----------|---------|---------|-------|
| tiresias | soulauth | 2 (HPA 2-10) | 250m | 256Mi | Core service |
| tiresias | soulgate | 2 (HPA 2-10) | 250m | 256Mi | Core service |
| tiresias | soulwatch | 2 (HPA 2-10) | 250m | 256Mi | Core service |
| tiresias | portal | 2 (HPA 2-10) | 250m | 256Mi | Core service |
| tiresias | tiresias-proxy | 3 (HPA 3-20) | 250m | 256Mi | Core service |
| tiresias | tiresias-redis | 1 | 100m | 128Mi | Rate limiting |
| tiresias | marketing-portal | 1 | 250m | 256Mi | Static site |
| tiresias | gatus | 1 | 100m | 256Mi | Status page |
| argocd | 6 deployments | 1 each | 100-500m | 256Mi-1Gi | CD tooling |
| external-secrets | 3 deployments | 1 each | 50m | 64Mi | Secret sync |

## Monitoring

Track node utilization vs requests via:
- GKE Managed Prometheus (built-in)
- Grafana SOC dashboard on DreamServer (192.168.12.167:3001)
- `kubectl top nodes` for real-time
