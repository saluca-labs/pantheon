# Tiresias Incident Controller

Automated incident-response engine for the Tiresias security platform. Receives alerts from Prometheus/Alertmanager, selects a severity-matched playbook, and executes remediation steps (Kubernetes isolation, DNS failover, WAF blocking, credential suspension) with full audit logging, forensic collection, and AI-assisted root-cause analysis.

## Quick Start

```bash
# Clone and install
cd tiresias-incident-controller
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env with your credentials and endpoints

# Run
PYTHONPATH=. uvicorn src.main:app --host 0.0.0.0 --port 8090 --log-level info
```

## Architecture

The controller follows the architecture defined in `TIRESIAS_ENFORCEMENT_POLICY_SPEC`:

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

- **PlaybookEngine** (`src/playbooks/engine.py`) -- Loads YAML playbook definitions, matches by severity, and drives step execution.
- **Action executors** (`src/actions/`) -- Kubernetes, Cloudflare, Cloud Armor, credential, and notification integrations.
- **Forensic collector** (`src/forensics/`) -- Captures pod logs, network state, and stores snapshots in GCS.
- **RCA pipeline** (`src/rca/`) -- Builds event timelines and generates reports via Claude.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/incidents` | Receive an alert and trigger playbook execution |
| `GET` | `/incidents` | List all incidents (with optional status/severity filters) |
| `GET` | `/incidents/{id}` | Get incident details, timeline, and actions |
| `POST` | `/incidents/{id}/resolve` | Manually resolve an incident |
| `POST` | `/drills/run` | Execute a dry-run drill against a named playbook |
| `GET` | `/health` | Liveness check |
| `GET` | `/ready` | Readiness check (verifies DB and K8s connectivity) |

## Deployment

**Docker:**
```bash
docker build -f deploy/Dockerfile -t tiresias-incident-controller .
docker run --env-file .env -p 8090:8090 tiresias-incident-controller
```

**Systemd (bare metal on GCP node):**
```bash
sudo cp deploy/systemd/incident-controller.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now incident-controller
```
