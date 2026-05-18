# Grafana SOC stack (internal ops)

> **Internal ops only.** This directory ships the Loki/Grafana/Tempo/Mimir
> ("LGTM") stack that Cristian / Saluca LLC runs as an internal Security
> Operations Center. It is **not** part of the OSS Pantheon self-hoster
> experience. Self-hosters who want platform observability should run a
> standard Prometheus + Grafana setup; the dashboards in this directory
> assume internal Saluca infrastructure (DreamServer, the pentest target
> VM, salucallc GitHub org) that does not exist in an OSS deployment.
>
> The full spec referenced below lives in a saluca-corp-adjacent
> repository and is not distributed with Pantheon.

## What this stack is for

The LGTM stack here powers internal SOC dashboards for monitoring the
saluca.com production environment — Pantheon services, internal lab
infrastructure, pentest scans, and credential auditing. It is intended
to be run on a single host inside the Saluca network.

## Stack

| Service | Port | Purpose |
|---------|------|---------|
| Grafana | 3001 | SOC dashboards & alerting |
| Loki | 3100 | Log aggregation |
| Prometheus | 9091 | Metrics collection |
| Node Exporter | 9100 | Host metrics |
| cAdvisor | 8081 | Container metrics |
| Promtail | 9080 | Log shipping |

## Bringing up the stack (internal)

```bash
cp .env.example .env   # edit with real credentials
chmod +x scripts/*.sh
./scripts/deploy.sh up
./scripts/validate.sh
```

Grafana then listens on the configured host:3001.

## Datasources (internal lab)

- **Prometheus** — node metrics (DreamServer + pentest-target), container metrics
- **Loki** — pentest logs, syslog, Docker container logs
- **Pentest DB** — PostgreSQL on internal lab subnet
- **Production DB** — Cloud SQL via cloud-sql-proxy
- **JSON API** — pentest report files

## Alerting

- **P0/P1** (critical/warning) — Telegram via Alfred backend
- **P2/P3** (info/low) — daily briefing pipeline

## For OSS self-hosters

This stack is **not** the recommendation for self-hosting Pantheon.
For Pantheon observability, run a standalone Prometheus + Grafana
stack and point it at `platform-api`'s `/metrics` endpoint. There
is no Pantheon-supplied dashboard JSON for that path yet; the
[`docs/operations/`](../../docs/operations/) tree covers the
self-host observability story (or the lack thereof).
