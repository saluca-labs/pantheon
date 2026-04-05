# Tiresias -- Verification and Troubleshooting Guide

This guide covers post-deployment verification and common issue resolution for the Tiresias platform. Run these checks immediately after deployment and whenever you suspect a problem.

---

## Post-Deployment Verification

### 1. Service Health Checks

Run each command and compare against the expected output.

**Proxy**

```bash
curl -s http://localhost:8080/health | jq .
```

Expected:

```json
{
  "status": "ok",
  "service": "tiresias-proxy",
  "mode": "onprem"
}
```

**SoulAuth**

```bash
curl -s http://localhost:8000/health | jq .
```

Expected:

```json
{
  "status": "healthy",
  "service": "soulauth",
  "version": "3.4.4"
}
```

**Portal**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

Expected: `200`

**All Containers**

```bash
docker compose ps
```

Expected: all 6 services show status `healthy`. If any service shows `unhealthy` or `restarting`, jump to the relevant troubleshooting section below.

---

### 2. Proxy Verification

Send a test request through the Tiresias proxy to confirm it is intercepting and forwarding traffic:

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

You should receive a normal chat completion response from the upstream provider. The request is now logged in Tiresias -- it will appear in the portal dashboard and audit log.

If you receive a `502` or connection error, see [Proxy returns 502](#proxy-returns-502) below.

---

### 3. Portal Verification

1. Open your browser and navigate to `http://localhost:3000`
2. Log in with your credentials
3. Open the dashboard -- it should display the test request you sent in step 2
4. Confirm the request details (model, timestamp, token count) are visible

If the page is blank or fails to load, see [Portal shows blank page](#portal-shows-blank-page) below.

---

## Common Issues

### Container won't start

**Diagnose:**

```bash
docker compose logs <service> --tail 50
```

Replace `<service>` with the name of the failing container (e.g., `tiresias-proxy`, `soulauth`, `portal`).

**Common causes:**

- **Missing required environment variable** -- Look for messages like `Error: VARIABLE_NAME is required`. Check your `.env` file against the example config and ensure every required variable is set.
- **Port conflict** -- Look for `address already in use`. See [Port conflicts](#port-conflicts) below.
- **Image not found** -- Run `docker compose pull` to ensure all images are available locally.

---

### SoulAuth unhealthy

Run the health check and inspect the error:

```bash
curl -s http://localhost:8000/health | jq .
```

| Error message | Cause | Fix |
|---|---|---|
| `No JWT signing key configured` | Missing key pair | Set `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` in your `.env`. For development only, set `SOULAUTH_DEBUG=true` to bypass. |
| `license.grace_period` or `license.expired_past_grace` | License key has expired or is in grace period. Search logs for `license.grace_period` or `license.expired_past_grace` | Contact support@saluca.com to renew your license key. Update `TIRESIAS_LICENSE_KEY` in `.env` and restart: `docker compose restart soulauth` |
| `duplicate key value violates unique constraint "pg_type_typname_nsp_index"` on startup | PostgreSQL error indicating types/tables from a prior deployment already exist | Safe to ignore. SoulAuth runs migrations on boot; this means the tables already exist. |
| Database connection refused | Postgres unreachable or credentials mismatch | Verify `POSTGRES_PASSWORD` in `.env` matches across services. Confirm postgres is healthy: `docker compose ps postgres` |

---

### Environment Variable Prefixes

Tiresias services use prefixed environment variables:
- SoulAuth: `SOULAUTH_*` (e.g., `SOULAUTH_DATABASE_URL`, `SOULAUTH_LOG_LEVEL`)
- SoulGate: `SOULGATE_*` (e.g., `SOULGATE_DATABASE_URL`)
- SoulWatch: `SOULWATCH_*` (e.g., `SOULWATCH_DATABASE_URL`)
- Proxy: `TIRESIAS_*` (e.g., `TIRESIAS_KEK`, `TIRESIAS_TENANT_ID`)

Using unprefixed names (e.g., `DATABASE_URL` instead of `SOULAUTH_DATABASE_URL`) will cause the service to fall back to defaults, typically `localhost`, causing connection failures.

---

### TIRESIAS_LICENSE_SECRET missing or incorrect

If `TIRESIAS_LICENSE_SECRET` is not set or does not match the secret provided with your license key at checkout, license validation will fail with an HMAC signature error.

**Fix:** Set `TIRESIAS_LICENSE_SECRET` in your `.env` file to the exact value provided at checkout, then restart:

```bash
docker compose restart soulauth
```

---

### SoulGate returns 502

This means soulgate cannot reach soulauth.

**Diagnose:**

```bash
docker compose logs soulgate --tail 20
```

**Common causes:**

- `SOULGATE_SOULAUTH_BASE_URL` is not set or does not point to soulauth (e.g., should be `http://soulauth:8000`)
- soulgate and soulauth are not on the same Docker network -- verify with `docker network inspect` and check your `docker-compose.yml`

---

### SoulWatch not receiving events

**Diagnose:**

```bash
docker compose logs soulwatch --tail 20
```

**Common causes:**

- `SOULWATCH_DATABASE_URL` is not set or is incorrect -- soulwatch needs database access to receive events
- soulwatch is not on the same Docker network as soulauth and postgres -- verify with `docker network inspect`

---

### Proxy returns 502

This means the proxy cannot reach the upstream AI provider.

**Diagnose:**

```bash
docker compose logs tiresias-proxy --tail 20
```

**Check outbound connectivity from inside the container:**

```bash
docker compose exec tiresias-proxy curl -s -o /dev/null -w "%{http_code}" https://api.openai.com/v1/models
docker compose exec tiresias-proxy curl -s -o /dev/null -w "%{http_code}" https://api.anthropic.com/v1/messages
```

Expected: `401` (unauthorized, but reachable). If you get `000` or a timeout, outbound HTTPS is blocked.

**Common causes:**

- Corporate firewall or proxy blocking outbound HTTPS to `api.openai.com` or `api.anthropic.com`
- DNS resolution failure inside the container -- check `docker compose exec tiresias-proxy nslookup api.openai.com`
- Incorrect `UPSTREAM_URL` override in `.env`

---

### Portal shows blank page

**Primary cause:** `NEXT_PUBLIC_SOULAUTH_API_URL` was not set at build time.

Next.js bakes `NEXT_PUBLIC_*` variables into the JavaScript bundle at build time, not at runtime. If these were missing during the Docker image build, the portal cannot reach SoulAuth.

**Fix for custom builds:**

```bash
docker compose build --build-arg NEXT_PUBLIC_SOULAUTH_API_URL=http://localhost:8000 portal
docker compose up -d portal
```

**Note:** Docker Hub images ship with these values pre-configured. This issue only affects custom builds.

**Other causes:**

- Browser console errors (open DevTools > Console) -- look for CORS or network errors
- SoulAuth is down -- the portal depends on it for authentication. Check `docker compose ps soulauth`.

---

### Port conflicts

Another service on your host is already using port 8080, 8000, or 3000.

**Diagnose:**

```bash
# Linux / macOS
ss -tlnp | grep -E '8080|8000|3000'

# Windows (PowerShell)
netstat -ano | findstr ":8080 :8000 :3000"
```

**Fix:** Override the default ports in your `.env` file:

```bash
PROXY_PORT=9080
SOULAUTH_PORT=9000
PORTAL_PORT=3001
```

Then restart:

```bash
docker compose down && docker compose up -d
```

---

### Database issues

**Backup before making changes:**

```bash
docker exec $(docker compose ps -q postgres) pg_dump -U tiresias tiresias > backup.sql
```

**Restore from backup:**

```bash
cat backup.sql | docker exec -i $(docker compose ps -q postgres) psql -U tiresias tiresias
```

**Full reset (WARNING: deletes all data):**

```bash
docker compose down -v && docker compose up -d
```

The `-v` flag removes all named volumes including the database. Only use this as a last resort.

---

## Log Locations

**Stream all logs in real time:**

```bash
docker compose logs -f
```

**Stream logs for a single service:**

```bash
docker compose logs <service> -f
```

Replace `<service>` with: `tiresias-proxy`, `soulauth`, `soulgate`, `soulwatch`, `portal`, or `postgres`.

**Readable structured logs:**

SoulAuth, SoulGate, and SoulWatch emit structured JSON logs. Pipe through `jq` for readability:

```bash
docker compose logs soulauth --tail 50 --no-log-prefix | jq .
```

**Filter for errors only:**

```bash
docker compose logs soulauth --tail 200 --no-log-prefix | jq 'select(.level == "error")'
```

---

## Resource Usage

**Expected baseline:** approximately 2 GB RAM total across all 6 containers.

**Monitor in real time:**

```bash
docker stats
```

**Postgres storage:** grows with audit log retention. Plan for approximately 1 GB per million proxied requests. Monitor disk usage:

```bash
docker compose exec postgres psql -U tiresias -c "SELECT pg_size_pretty(pg_database_size('tiresias'));"
```

If storage is growing faster than expected, review your log retention policy or run:

```bash
docker compose exec postgres psql -U tiresias -c "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;"
```

---

## Quick Diagnostic Script

Run this to capture the full state of your deployment for support tickets:

```bash
echo "=== Tiresias Diagnostic ===" && \
echo "--- Container Status ---" && docker compose ps && \
echo "--- Health: Proxy ---" && curl -s http://localhost:8080/health | jq . && \
echo "--- Health: SoulAuth ---" && curl -s http://localhost:8000/health | jq . && \
echo "--- Health: Portal ---" && curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/ && \
echo "--- Resource Usage ---" && docker stats --no-stream && \
echo "--- Recent Errors ---" && docker compose logs --tail 50 2>&1 | grep -i -E "error|fatal|panic" | tail -20
```

---

## Getting Help

- **Documentation:** https://tiresias.network/docs
- **Email:** support@saluca.com
- **Support tickets:** Always include the output of:
  ```bash
  docker compose ps
  docker compose logs --tail 100
  ```
