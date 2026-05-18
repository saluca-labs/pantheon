# Incident controller (internal ops)

> **Internal ops only.** This service is an automated incident-response
> engine that Cristian / Saluca LLC runs against the production Pantheon
> environment. It receives Prometheus / Alertmanager webhooks, selects
> a severity-matched playbook, and executes remediation actions
> (Kubernetes pod isolation, DNS failover, Cloudflare / Cloud Armor WAF
> blocks, credential suspension) with audit logging, forensic
> collection, and AI-assisted root-cause analysis.
>
> It is **not** part of the OSS Pantheon self-hoster experience.
> Self-hosters do not need to deploy this — `platform-api`,
> `platform-web`, and the App Proxy run perfectly without it. The
> controller assumes the existence of internal Saluca infrastructure
> (GCP project, GKE cluster, Cloudflare account, Cloud Armor policies)
> that does not exist in an OSS deployment.

## What it does

```
Alertmanager webhook
        |
   POST /incidents
        |
   PlaybookEngine.select_playbook(severity)
        |
   PlaybookEngine.execute(incident)
        |
   +----+----+----+----+----+
   |    |    |    |    |    |
  K8s  CF  Armor Cred Notif Forensics
```

- **PlaybookEngine** (`src/playbooks/engine.py`) — Loads YAML playbook
  definitions, matches by severity, drives step execution.
- **Action executors** (`src/actions/`) — Kubernetes, Cloudflare,
  Cloud Armor, credential, and notification integrations.
- **Forensic collector** (`src/forensics/`) — Captures pod logs,
  network state, stores snapshots in GCS.
- **RCA pipeline** (`src/rca/`) — Builds event timelines and generates
  reports via Claude.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/incidents` | Receive an alert and trigger playbook execution |
| `GET` | `/incidents` | List all incidents (with optional status/severity filters) |
| `GET` | `/incidents/{id}` | Get incident details, timeline, and actions |
| `POST` | `/incidents/{id}/resolve` | Manually resolve an incident |
| `POST` | `/drills/run` | Execute a dry-run drill against a named playbook |
| `GET` | `/health` | Liveness check |
| `GET` | `/ready` | Readiness check (verifies DB and K8s connectivity) |

## Running it (internal)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # internal credentials
PYTHONPATH=. uvicorn src.main:app --host 0.0.0.0 --port 8090 --log-level info
```

The systemd unit at `deploy/systemd/incident-controller.service` is
also internal-ops only.

## For OSS self-hosters

This service is intentionally not documented in the self-hoster docs
(`docs/operations/`). If you are running Pantheon as an OSS
self-hoster, you do not need this and it will not work out-of-the-box
in your environment.
