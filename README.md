# Tiresias Monorepo

Consolidated history of 10 `salucallc/tiresias-*` repositories, combined via `git subtree` merges on **2026-05-07**. Each top-level subdirectory preserves the full commit history of its source repo.

## Absorbed repositories

| Subdirectory | Source | Description |
|---|---|---|
| `tiresias/` | [salucallc/tiresias](https://github.com/salucallc/tiresias) | Tiresias platform — multi-provider LLM proxy with audit trail, observability, and compliance |
| `tiresias-sovereign/` | [salucallc/tiresias-sovereign](https://github.com/salucallc/tiresias-sovereign) | Tiresias Sovereign — v1.0 GA appliance proxy (greenfield per plans/v1-ga/A_tiresias_in_appliance.md §108) |
| `tiresias-app-proxy/` | [salucallc/tiresias-app-proxy](https://github.com/salucallc/tiresias-app-proxy) | Tiresias App Proxy — governs AI agent actions via Cedar policy, MCP plugins, risk scoring, and compliance mapping |
| `tiresias-rules/` | [salucallc/tiresias-rules](https://github.com/salucallc/tiresias-rules) | Tiresias enforcement policy definitions — org, project, and agent policies |
| `tiresias-web/` | [salucallc/tiresias-web](https://github.com/salucallc/tiresias-web) | Tiresias Web Application — Governance-First AI-Security dashboard |
| `tiresias-incident-controller/` | [salucallc/tiresias-incident-controller](https://github.com/salucallc/tiresias-incident-controller) | Tiresias Automated Incident Response — quarantine, forensics, failover, RCA |
| `tiresias-grafana/` | [salucallc/tiresias-grafana](https://github.com/salucallc/tiresias-grafana) | Tiresias Security Operations Center — Grafana LGTM stack, dashboards, and custom plugins |
| `tiresias-pentest/` | [salucallc/tiresias-pentest](https://github.com/salucallc/tiresias-pentest) | Automated penetration testing program for Tiresias platform |
| `tiresias-monitor/` | [salucallc/tiresias-monitor](https://github.com/salucallc/tiresias-monitor) | Tiresias Production Monitoring & Drift Detection — self-hosted security monitoring platform |
| `tiresias-enforcement/` | [salucallc/tiresias-enforcement](https://github.com/salucallc/tiresias-enforcement) | (no description) |

## Method

Each source repo was imported with:

```sh
git remote add <name> https://github.com/salucallc/<name>.git
git fetch <name>
git merge -s ours --no-commit --allow-unrelated-histories <name>/<default-branch>
git read-tree --prefix=<name>/ -u <name>/<default-branch>
git commit -m "merge: import salucallc/<name> via subtree at <name>/"
```

This preserves full commit history (visible via `git log -- <name>/`) while keeping a clean top-level layout.
