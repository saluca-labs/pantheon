# Tiresias Platform -- Customer Installation Guide

Version: 3.4  
Last updated: 2026-04-05

---

## Prerequisites

Before you begin, verify that your deployment host meets the following requirements.

### Hardware

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM      | 4 GB    | 8 GB        |
| CPU      | 2 cores | 4 cores     |
| Disk     | 20 GB   | 50 GB       |

### Software

- **Docker Engine 24.0+** and **Docker Compose v2** (bundled with Docker Desktop or installed standalone)
- **Operating system:** Ubuntu 22.04 LTS, RHEL 9, or Windows Server 2022 with WSL2 enabled

Verify your Docker installation:

```bash
docker --version
# Expected: Docker version 24.x or later

docker compose version
# Expected: Docker Compose version v2.x
```

### Network

The deployment host requires outbound HTTPS (TCP 443) to the following endpoints:

| Destination              | Purpose                        |
|--------------------------|--------------------------------|
| `api.anthropic.com`      | Proxied Anthropic LLM calls    |
| `api.openai.com`         | Proxied OpenAI LLM calls       |
| `registry-1.docker.io`   | Pull container images           |

No inbound ports need to be exposed to the public internet unless you choose to make the portal externally accessible.

### License

You must have a valid Tiresias license. Your license package includes:

- Docker Hub pull token
- Tenant ID (`TIRESIAS_TENANT_ID`)
- License key (`TIRESIAS_LICENSE_KEY`)

These are provided at purchase or through your Tiresias account representative.

---

## Step 1: Authenticate with Docker Hub

Tiresias container images are hosted in a private Docker Hub repository. Authenticate using the pull token provided with your license:

```bash
docker login -u <customer-username> -p <pull-token>
```

Replace `<customer-username>` and `<pull-token>` with the credentials from your license package.

Verify access:

```bash
docker pull salucalabs/tiresias-proxy:latest
```

If the pull succeeds, authentication is configured correctly.

---

## Step 2: Download Deployment Files

Obtain the following files from your Tiresias license checkout page or from your account representative:

| File                              | Description                                    |
|-----------------------------------|------------------------------------------------|
| `docker-compose.production.yml`   | Production Compose manifest (all 6 services)   |
| `.env.production.template`        | Environment variable template                  |

Place both files in a dedicated directory on the deployment host:

```bash
mkdir -p /opt/tiresias
cp docker-compose.production.yml /opt/tiresias/
cp .env.production.template /opt/tiresias/.env
cd /opt/tiresias
```

All subsequent commands in this guide assume `/opt/tiresias` as the working directory.

---

## Step 3: Configure Environment

Open `.env` in a text editor and populate the required variables.

### Required Variables

| Variable                | Description                                          |
|-------------------------|------------------------------------------------------|
| `POSTGRES_PASSWORD`     | Password for the internal PostgreSQL database         |
| `TIRESIAS_TENANT_ID`    | Your tenant identifier (from license package)         |
| `TIRESIAS_LICENSE_KEY`  | Your license key (from license package)               |
| `TIRESIAS_LICENSE_SECRET` | License secret (from license package)               |
| `TIRESIAS_KEK`          | Key Encryption Key for envelope encryption at rest    |
| `ADMIN_EMAIL`           | Email address for the auto-created admin account      |
| `ADMIN_PASSWORD`        | Password for the auto-created admin account           |

### Generate POSTGRES_PASSWORD

Use a strong random password:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(24))"
```

### Generate TIRESIAS_KEK

The KEK protects all stored encryption keys. Generate a 256-bit hex key:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Copy the output into your `.env` file:

```
TIRESIAS_KEK=<paste-hex-string-here>
```

> **WARNING:** Store the KEK securely outside the deployment host (e.g., in a hardware security module or secrets vault). If the KEK is lost, encrypted data cannot be recovered.

### Generate JWT Signing Keys

Tiresias uses EC P-256 keys for JWT authentication. Generate a key pair:

```bash
openssl ecparam -genkey -name prime256v1 -noout -out jwt-private.pem
openssl ec -in jwt-private.pem -pubout -out jwt-public.pem
```

Base64-encode the keys for the `.env` file:

```bash
echo "SOULAUTH_JWT_PRIVATE_KEY=$(base64 -w 0 jwt-private.pem)"
echo "SOULAUTH_JWT_PUBLIC_KEY=$(base64 -w 0 jwt-public.pem)"
```

Copy both values into `.env`.

### Optional Variables

| Variable               | Default            | Description                                       |
|------------------------|--------------------|---------------------------------------------------|
| `TIRESIAS_PROVIDERS`   | `anthropic,openai` | Comma-separated list of enabled LLM providers     |
| `TIRESIAS_UPSTREAM_URL`| (none)             | Custom upstream LLM endpoint URL                  |
| `TIRESIAS_REDIS_URL`   | (none)             | External Redis URL for caching and rate limiting   |
| `SOULAUTH_LOG_LEVEL`   | `info`             | Log verbosity: `debug`, `info`, `warn`, `error`   |

> **NOTE:** SIEM log forwarding is configured through the SoulWatch service dashboard, not via environment variables.

---

## Step 4: Deploy

Pull the images and start all services:

```bash
docker compose -f docker-compose.production.yml pull
```

```bash
docker compose -f docker-compose.production.yml up -d
```

Expected output:

```
[+] Running 6/6
 ✔ Container postgres            Started
 ✔ Container soulauth           Started
 ✔ Container soulgate           Started
 ✔ Container soulwatch          Started
 ✔ Container tiresias-proxy     Started
 ✔ Container portal             Started
```

The database initializes its schema automatically on first boot. Allow 30--60 seconds for all services to become healthy.

---

## Step 5: Verify Deployment

### Health Checks

Check each service endpoint:

```bash
curl -s http://localhost:8080/health
# Expected: {"status":"ok","service":"tiresias-proxy","mode":"onprem"}
```

```bash
curl -s http://localhost:8000/health
# Expected: {"status":"healthy","service":"soulauth","version":"3.4.4"}
```

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# Expected: 200
```

### Container Status

```bash
docker compose -f docker-compose.production.yml ps
```

All containers should show `Up` with `(healthy)` status. Example:

```
NAME                  STATUS
postgres              Up 2 minutes (healthy)
soulauth              Up 2 minutes (healthy)
soulgate              Up 2 minutes (healthy)
soulwatch             Up 2 minutes (healthy)
tiresias-proxy        Up 2 minutes (healthy)
portal                Up 2 minutes (healthy)
```

### Log Inspection

If any container is not healthy, inspect its logs:

```bash
docker compose -f docker-compose.production.yml logs soulauth --tail 20
docker compose -f docker-compose.production.yml logs proxy --tail 20
```

Common first-boot issues:

| Symptom                         | Cause                              | Fix                                      |
|---------------------------------|------------------------------------|------------------------------------------|
| `soulauth` exits with code 1   | Missing `TIRESIAS_KEK`             | Set the variable in `.env` and restart   |
| `proxy` cannot reach upstream   | Outbound HTTPS blocked             | Open TCP 443 to `api.anthropic.com` etc. |
| `db` exits with code 1         | Weak `POSTGRES_PASSWORD`           | Use a password with 16+ characters       |

---

## Step 6: First Login

1. The admin account is created automatically on first boot using the `ADMIN_EMAIL` and `ADMIN_PASSWORD` values from your `.env` file.

2. Open a browser and navigate to `http://localhost:3000` (or the host's IP/DNS name on port 3000).

3. Log in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` credentials you configured in Step 3.

4. **Change the default admin password** immediately after first login via **Settings > Account**.

5. From the admin dashboard, you can invite additional users, configure integrations, and manage provider API keys.

> **NOTE:** Additional users created through the admin dashboard are assigned the default **Analyst** role. Promote users to **Admin** from **Settings > Team**.

---

## Step 7: Point AI Agents at the Proxy

Tiresias operates as a transparent proxy. Redirect your AI agents and tools to route LLM traffic through Tiresias by changing their base URL configuration.

### OpenAI-Compatible Agents

Set the following environment variable in your agent's runtime:

```bash
export OPENAI_BASE_URL=http://<tiresias-host>:8080/v1
```

### Anthropic-Compatible Agents

```bash
export ANTHROPIC_BASE_URL=http://<tiresias-host>:8080
```

Replace `<tiresias-host>` with the hostname or IP address of the machine running Tiresias.

### Verification

Send a test request through the proxy:

```bash
curl -s http://<tiresias-host>:8080/v1/chat/completions \
  -H "Authorization: Bearer <your-openai-key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}],"max_tokens":5}'
```

A successful response confirms that LLM traffic is flowing through Tiresias. All requests are now logged, audited, and subject to your configured policies.

---

## Upgrading

To upgrade Tiresias to the latest version:

```bash
cd /opt/tiresias
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

Compose performs a rolling restart with health checks. Services are replaced one at a time; the proxy continues to serve traffic during the upgrade. Database migrations run automatically on boot.

> **TIP:** Before upgrading, back up your database volume:
> ```bash
> docker compose -f docker-compose.production.yml stop db
> docker run --rm -v tiresias_db_data:/data -v $(pwd):/backup alpine tar czf /backup/db-backup.tar.gz -C /data .
> docker compose -f docker-compose.production.yml start db
> ```

Review the [CHANGELOG](https://www.tiresias.network/changelog) for breaking changes before upgrading across major versions.

---

## Uninstalling

To stop all Tiresias services:

```bash
docker compose -f docker-compose.production.yml down
```

To stop all services **and delete all data** (database, logs, cached models):

```bash
docker compose -f docker-compose.production.yml down -v
```

> **WARNING:** The `-v` flag permanently deletes all Docker volumes, including the PostgreSQL database. This action is irreversible. Export any required audit logs before running this command.

To remove pulled images:

```bash
docker compose -f docker-compose.production.yml down -v --rmi all
```

---

## Appendix A: Port Reference

| Port  | Service    | Protocol | Description                    |
|-------|------------|----------|--------------------------------|
| 3000  | Portal     | HTTP     | Web management console         |
| 8000  | SoulAuth   | HTTP     | Authentication and licensing   |
| 8080  | Proxy      | HTTP     | LLM proxy endpoint             |
| 5432  | PostgreSQL | TCP      | Internal database (not exposed)|

## Appendix B: File Layout

```
/opt/tiresias/
├── docker-compose.production.yml
├── .env
├── jwt-private.pem    # Generated in Step 3
└── jwt-public.pem     # Generated in Step 3
```

## Appendix C: Support

- Documentation: [https://www.tiresias.network/docs](https://www.tiresias.network/docs)
- Support email: support@tiresias.network
- Status page: [https://status.tiresias.network](https://status.tiresias.network)

Include the output of `docker compose ps` and relevant container logs when filing a support ticket.
