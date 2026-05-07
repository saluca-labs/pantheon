# Tiresias SOC — Grafana Security Operations Center

Internal SOC for Saluca LLC built on the LGTM stack.

## Quick Start

```bash
git clone git@github.com:salucallc/tiresias-grafana.git
cd tiresias-grafana
cp .env.example .env   # edit with real credentials
chmod +x scripts/*.sh
./scripts/deploy.sh up
./scripts/validate.sh
```

Grafana: `http://192.168.12.167:3001`

## Stack

| Service | Port | Purpose |
|---------|------|---------|
| Grafana | 3001 | SOC dashboards & alerting |
| Loki | 3100 | Log aggregation |
| Prometheus | 9091 | Metrics collection |
| Node Exporter | 9100 | Host metrics |
| cAdvisor | 8081 | Container metrics |
| Promtail | 9080 | Log shipping |

## Datasources

- **Prometheus** — node metrics (DreamServer + pentest-target), container metrics
- **Loki** — pentest logs, syslog, Docker container logs
- **Pentest DB** — PostgreSQL on 192.168.12.169
- **Production DB** — Cloud SQL via cloud-sql-proxy
- **JSON API** — pentest report files

## Alerting

- **P0/P1** (critical/warning) — Telegram via Alfred backend
- **P2/P3** (info/low) — daily briefing pipeline

## Spec

Full specification: `TIRESIAS_GRAFANA_SECURITY_OPERATIONS_SPEC.md` in saluca-corp repo.
