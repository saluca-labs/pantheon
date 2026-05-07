#!/usr/bin/env python3
"""
NVD CVE Feed Synchronizer for Tiresias Pentest Program.

Queries the NVD API v2.0 for CVEs matching Tiresias stack components.
Outputs new_nvd_cves.json with filtered, relevant vulnerabilities.

Usage:
    python3 nvd-sync.py [--days 7] [--output new_nvd_cves.json]
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, timedelta, timezone


NVD_API_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"

KEYWORDS = [
    "asyncpg", "uvicorn", "fastapi", "pydantic", "sqlalchemy",
    "next.js", "nextjs", "node", "nodejs",
    "postgres", "postgresql", "alpine", "linux"
]

RATE_LIMIT_DELAY_NO_KEY = 6.5
RATE_LIMIT_DELAY_WITH_KEY = 0.7


def fetch_cves(keyword, start_date, end_date, api_key=None):
    """Fetch CVEs from NVD API for a specific keyword."""
    params = {
        "keywordSearch": keyword,
        "keywordExactMatch": "",
        "pubStartDate": start_date,
        "pubEndDate": end_date,
        "resultsPerPage": "100",
        "startIndex": "0",
    }

    headers = {"User-Agent": "TiresiasPentest/1.0"}
    if api_key:
        headers["apiKey"] = api_key

    all_cves = []
    start_index = 0

    while True:
        params["startIndex"] = str(start_index)
        url = f"{NVD_API_URL}?{urllib.parse.urlencode(params)}"

        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 403:
                print(f"  Rate limited on '{keyword}', waiting 30s...", file=sys.stderr)
                time.sleep(30)
                continue
            print(f"  HTTP {e.code} for keyword '{keyword}': {e.reason}", file=sys.stderr)
            break
        except Exception as e:
            print(f"  Error fetching '{keyword}': {e}", file=sys.stderr)
            break

        vulnerabilities = data.get("vulnerabilities", [])
        total_results = data.get("totalResults", 0)
        all_cves.extend(vulnerabilities)

        start_index += len(vulnerabilities)
        if start_index >= total_results or len(vulnerabilities) == 0:
            break

        delay = RATE_LIMIT_DELAY_WITH_KEY if api_key else RATE_LIMIT_DELAY_NO_KEY
        time.sleep(delay)

    return all_cves


def extract_cve_info(vuln_item):
    """Extract relevant fields from an NVD CVE item."""
    cve = vuln_item.get("cve", {})
    cve_id = cve.get("id", "UNKNOWN")

    descriptions = cve.get("descriptions", [])
    desc = next((d["value"] for d in descriptions if d.get("lang") == "en"), "No description")

    metrics = cve.get("metrics", {})
    cvss_v31 = metrics.get("cvssMetricV31", [{}])
    cvss_v40 = metrics.get("cvssMetricV40", [{}])

    score = None
    severity = None
    if cvss_v40:
        score = cvss_v40[0].get("cvssData", {}).get("baseScore")
        severity = cvss_v40[0].get("cvssData", {}).get("baseSeverity")
    elif cvss_v31:
        score = cvss_v31[0].get("cvssData", {}).get("baseScore")
        severity = cvss_v31[0].get("cvssData", {}).get("baseSeverity")

    references = [ref.get("url", "") for ref in cve.get("references", [])[:5]]

    configurations = cve.get("configurations", [])
    affected_products = []
    for config in configurations:
        for node in config.get("nodes", []):
            for match in node.get("cpeMatch", []):
                if match.get("vulnerable"):
                    affected_products.append(match.get("criteria", ""))

    return {
        "cve_id": cve_id,
        "description": desc,
        "cvss_score": score,
        "severity": severity,
        "published": cve.get("published", ""),
        "last_modified": cve.get("lastModified", ""),
        "references": references,
        "affected_products": affected_products[:10],
    }


def main():
    parser = argparse.ArgumentParser(description="Sync NVD CVE feed for Tiresias stack")
    parser.add_argument("--days", type=int, default=7, help="Look back N days (default: 7)")
    parser.add_argument("--output", default="new_nvd_cves.json", help="Output file path")
    parser.add_argument("--min-severity", default="MEDIUM",
                        choices=["LOW", "MEDIUM", "HIGH", "CRITICAL"],
                        help="Minimum severity to include")
    args = parser.parse_args()

    api_key = os.environ.get("NVD_API_KEY")
    if api_key:
        print("Using NVD API key (higher rate limits)")
    else:
        print("No NVD_API_KEY set — using public rate limits (slower)")

    severity_order = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
    min_sev = severity_order.get(args.min_severity, 1)

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=args.days)
    start_str = start.strftime("%Y-%m-%dT%H:%M:%S.000")
    end_str = now.strftime("%Y-%m-%dT%H:%M:%S.000")

    print(f"Searching CVEs from {start_str} to {end_str}")
    print(f"Keywords: {', '.join(KEYWORDS)}")

    seen_ids = set()
    all_cves = []

    for keyword in KEYWORDS:
        print(f"Fetching CVEs for: {keyword}...", end=" ", flush=True)
        raw = fetch_cves(keyword, start_str, end_str, api_key)
        new_count = 0

        for vuln in raw:
            cve_id = vuln.get("cve", {}).get("id", "")
            if cve_id in seen_ids:
                continue
            seen_ids.add(cve_id)

            info = extract_cve_info(vuln)
            sev = severity_order.get((info.get("severity") or "").upper(), -1)
            if sev >= min_sev:
                info["matched_keyword"] = keyword
                all_cves.append(info)
                new_count += 1

        print(f"{new_count} new")

        delay = RATE_LIMIT_DELAY_WITH_KEY if api_key else RATE_LIMIT_DELAY_NO_KEY
        time.sleep(delay)

    all_cves.sort(key=lambda x: x.get("cvss_score") or 0, reverse=True)

    output = {
        "scan_date": now.isoformat(),
        "period_days": args.days,
        "total_cves": len(all_cves),
        "severity_breakdown": {
            "CRITICAL": sum(1 for c in all_cves if (c.get("severity") or "").upper() == "CRITICAL"),
            "HIGH": sum(1 for c in all_cves if (c.get("severity") or "").upper() == "HIGH"),
            "MEDIUM": sum(1 for c in all_cves if (c.get("severity") or "").upper() == "MEDIUM"),
        },
        "cves": all_cves,
    }

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nResults: {len(all_cves)} CVEs written to {args.output}")
    for sev in ["CRITICAL", "HIGH", "MEDIUM"]:
        count = output["severity_breakdown"].get(sev, 0)
        if count:
            print(f"  {sev}: {count}")


if __name__ == "__main__":
    main()
