# Tiresias Pentest Program

Automated penetration testing for the Tiresias platform (SoulAuth, SoulGate, SoulWatch, Portal).

## Quick Start

```bash
# 1. Set up the pentest target VM
ssh target 'bash -s' < setup-target.sh

# 2. Configure secrets
cp .env.example .env
# Edit .env with your keys

# 3. Generate JWT keys
openssl ecparam -genkey -name prime256v1 -noout -out pentest-private.pem
openssl ec -in pentest-private.pem -pubout -out pentest-public.pem

# 4. Start the pentest stack
docker compose -f docker-compose.pentest.yaml up -d

# 5. Run a full scan
./scan.sh --profile full --target 192.168.12.169
```

## Scan Profiles

| Profile | Description | Schedule |
|---------|-------------|----------|
| `full` | All 6 phases: Trivy, Nuclei, ZAP, API, Tiresias-specific, Self-monitoring | Weekly (Sunday 02:00 UTC) |
| `cve-only` | Trivy re-scan + Nuclei new CVE templates | Daily (04:00 UTC) |
| `api-auth` | API auth bypass + JWT confusion + tenant isolation | Weekly (Wednesday 03:00 UTC) |
| `custom` | Tiresias-specific tests + self-monitoring only | On-demand |

## Vulnerability Feeds

```bash
# Sync NVD CVEs (last 7 days)
python3 feeds/nvd-sync.py --days 7

# Sync CISA KEV catalog
bash feeds/kev-sync.sh

# Sync GitHub advisories
python3 feeds/github-advisory-sync.py --days 7

# Correlate against SBOMs
python3 feeds/correlate.py --sbom-dir /path/to/trivy/ --nvd new_nvd_cves.json --kev new_kev_entries.json
```

## Reports

```bash
python3 reports/generate.py --scan-dir /repos/security/pentest-reports/2026-03-21_120000 --type weekly --pdf
```

## Requirements

- Docker + Docker Compose
- Trivy, Nuclei, ZAP (installed by `setup-target.sh`)
- Python 3.11+ with psycopg2-binary, httpx, weasyprint (for PDF reports)
