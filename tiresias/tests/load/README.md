# Tiresias Load Testing

Load tests for the Tiresias platform using [Locust](https://locust.io/).

## Prerequisites

```bash
pip install locust
```

## Setup

Before running load tests, provision a test agent:

```bash
# 1. Start the Tiresias stack
docker compose up -d

# 2. Create a load test tenant and SoulKey
curl -X POST http://localhost:8000/v1/soulauth/admin/tenants \
  -H "Content-Type: application/json" \
  -d '{"name": "Load Test", "slug": "loadtest", "tier": "enterprise"}'

# Note the tenant_id from the response, then:
curl -X POST http://localhost:8000/v1/soulauth/admin/keys \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "<TENANT_ID>", "persona_id": "loadtest", "label": "Load test agent"}'

# Note the raw_key from the response
export LOAD_TEST_SOULKEY="sk_agent_loa_loadtest_..."
export LOAD_TEST_TENANT_ID="<TENANT_ID>"
```

## Running Tests

### Quick smoke test (10 users, 1 minute)

```bash
locust -f tests/load/locustfile.py \
  --host=http://localhost:8000 \
  --users=10 \
  --spawn-rate=5 \
  --run-time=1m \
  --headless
```

### Standard load test (100 users, 15 minutes)

```bash
locust -f tests/load/locustfile.py \
  --host=http://localhost:8000 \
  --users=100 \
  --spawn-rate=10 \
  --run-time=15m \
  --headless \
  --csv=results/load_100u
```

### Stress test (500 users, 10 minutes)

```bash
locust -f tests/load/locustfile.py \
  --host=http://localhost:8000 \
  --users=500 \
  --spawn-rate=25 \
  --run-time=10m \
  --headless \
  --csv=results/stress_500u
```

### Full capacity test (1000 users, 10 minutes)

```bash
locust -f tests/load/locustfile.py \
  --host=http://localhost:8000 \
  --users=1000 \
  --spawn-rate=50 \
  --run-time=10m \
  --headless \
  --csv=results/capacity_1000u
```

### Interactive mode (with web UI)

```bash
locust -f tests/load/locustfile.py --host=http://localhost:8000
# Open http://localhost:8089 in your browser
```

## Performance Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| PDP evaluation p50 | <20ms | Locust stats |
| PDP evaluation p99 | <100ms | Locust stats |
| Identity resolution p99 | <50ms | Locust stats |
| Sustained throughput | 1000 req/s | 10 min run |
| Error rate under load | <0.1% | Locust stats |
| Memory under load | <512MB | `docker stats` |
| DB connections | <50 | `SELECT count(*) FROM pg_stat_activity` |

## User Classes

- **TiresiasUser** (weight 10): Simulates typical agent API usage
  - PDP evaluation (10x) - the hot path
  - Identity resolution (5x)
  - Whoami (2x)
  - Health check (1x)

- **TiresiasAdminUser** (weight 1): Simulates admin operations
  - List keys, audit report, list tenants

- **TiresiasWriteUser** (weight 2): Stress tests PDP with varied scopes
  - Rotates through 8 different scope patterns

## Analyzing Results

CSV output includes `_stats.csv`, `_failures.csv`, and `_stats_history.csv`.

Key metrics to check:
1. p50 and p99 response times for `/v1/auth/evaluate`
2. Error rate across all endpoints
3. Requests per second sustained over the run
4. Watch for increasing response times (indicates resource exhaustion)
