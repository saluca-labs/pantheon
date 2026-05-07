#!/usr/bin/env python3
"""
GitHub Advisory Database Sync for Tiresias Pentest Program.

Queries the GitHub Advisory Database API for security advisories
affecting Tiresias stack dependencies.

Usage:
    python3 github-advisory-sync.py [--days 7] [--output github_advisories.json]

Requires: GITHUB_TOKEN environment variable (or gh CLI auth).
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone


GITHUB_GRAPHQL_URL = "https://api.github.com/graphql"

MONITORED_PACKAGES = {
    "PIP": [
        "asyncpg", "uvicorn", "fastapi", "pydantic", "sqlalchemy",
        "httpx", "python-jose", "cryptography", "psycopg2",
        "alembic", "starlette", "anyio",
    ],
    "NPM": [
        "next", "react", "react-dom", "@next/font",
    ],
}

GRAPHQL_QUERY = """
query($ecosystem: SecurityAdvisoryEcosystem, $package: String, $after: String) {
  securityVulnerabilities(
    ecosystem: $ecosystem,
    package: $package,
    first: 50,
    after: $after,
    orderBy: {field: UPDATED_AT, direction: DESC}
  ) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      advisory {
        ghsaId
        summary
        description
        severity
        publishedAt
        updatedAt
        references {
          url
        }
        identifiers {
          type
          value
        }
        cvss {
          score
          vectorString
        }
      }
      package {
        name
        ecosystem
      }
      vulnerableVersionRange
      firstPatchedVersion {
        identifier
      }
    }
  }
}
"""


def get_github_token():
    """Get GitHub token from env or gh CLI."""
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        return token

    try:
        result = subprocess.run(
            ["gh", "auth", "token"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    print("ERROR: No GitHub token found. Set GITHUB_TOKEN or authenticate with gh CLI.", file=sys.stderr)
    sys.exit(1)


def query_advisories(token, ecosystem, package):
    """Query GitHub Advisory Database for a specific package."""
    results = []
    cursor = None

    while True:
        variables = {"ecosystem": ecosystem, "package": package}
        if cursor:
            variables["after"] = cursor

        payload = json.dumps({"query": GRAPHQL_QUERY, "variables": variables}).encode()

        req = urllib.request.Request(
            GITHUB_GRAPHQL_URL,
            data=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": "TiresiasPentest/1.0",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode())
        except Exception as e:
            print(f"  Error querying {ecosystem}/{package}: {e}", file=sys.stderr)
            break

        if "errors" in data:
            print(f"  GraphQL errors: {data['errors']}", file=sys.stderr)
            break

        vulns = data.get("data", {}).get("securityVulnerabilities", {})
        nodes = vulns.get("nodes", [])
        results.extend(nodes)

        page_info = vulns.get("pageInfo", {})
        if page_info.get("hasNextPage") and page_info.get("endCursor"):
            cursor = page_info["endCursor"]
        else:
            break

    return results


def main():
    parser = argparse.ArgumentParser(description="Sync GitHub Advisory Database")
    parser.add_argument("--days", type=int, default=7, help="Look back N days")
    parser.add_argument("--output", default="github_advisories.json", help="Output file")
    args = parser.parse_args()

    token = get_github_token()
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)

    all_advisories = []
    seen_ghsa = set()

    for ecosystem, packages in MONITORED_PACKAGES.items():
        for package in packages:
            print(f"Querying {ecosystem}/{package}...", end=" ", flush=True)
            vulns = query_advisories(token, ecosystem, package)

            new_count = 0
            for vuln in vulns:
                advisory = vuln.get("advisory", {})
                ghsa_id = advisory.get("ghsaId", "")

                if ghsa_id in seen_ghsa:
                    continue

                updated = advisory.get("updatedAt", "")
                if updated:
                    try:
                        updated_dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                        if updated_dt < cutoff:
                            continue
                    except ValueError:
                        pass

                seen_ghsa.add(ghsa_id)
                new_count += 1

                cve_id = None
                for ident in advisory.get("identifiers", []):
                    if ident.get("type") == "CVE":
                        cve_id = ident.get("value")
                        break

                all_advisories.append({
                    "ghsa_id": ghsa_id,
                    "cve_id": cve_id,
                    "package": vuln.get("package", {}).get("name"),
                    "ecosystem": vuln.get("package", {}).get("ecosystem"),
                    "summary": advisory.get("summary", ""),
                    "severity": advisory.get("severity", ""),
                    "cvss_score": advisory.get("cvss", {}).get("score"),
                    "vulnerable_range": vuln.get("vulnerableVersionRange", ""),
                    "patched_version": (vuln.get("firstPatchedVersion") or {}).get("identifier"),
                    "published": advisory.get("publishedAt", ""),
                    "updated": advisory.get("updatedAt", ""),
                    "references": [r.get("url", "") for r in advisory.get("references", [])[:3]],
                })

            print(f"{new_count} new")

    severity_order = {"CRITICAL": 0, "HIGH": 1, "MODERATE": 2, "LOW": 3}
    all_advisories.sort(key=lambda x: severity_order.get(x.get("severity", "LOW"), 4))

    output = {
        "sync_date": datetime.now(timezone.utc).isoformat(),
        "period_days": args.days,
        "total_advisories": len(all_advisories),
        "severity_breakdown": {
            sev: sum(1 for a in all_advisories if a.get("severity") == sev)
            for sev in ["CRITICAL", "HIGH", "MODERATE", "LOW"]
        },
        "advisories": all_advisories,
    }

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nResults: {len(all_advisories)} advisories written to {args.output}")


if __name__ == "__main__":
    main()
