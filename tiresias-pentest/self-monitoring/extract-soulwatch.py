#!/usr/bin/env python3
"""
SoulWatch Audit Data Extractor for Tiresias Pentest Program.

Connects to the pentest target's local Postgres, extracts audit_log entries
during the scan window, and outputs them for detection rate analysis.

Usage:
    python3 extract-soulwatch.py --target 192.168.12.169 --scan-start 2026-03-21T12:00:00Z --output soulwatch_audit.json

Requires: psycopg2 (pip install psycopg2-binary)
"""

import argparse
import json
import sys
from datetime import datetime, timezone


def extract_via_psycopg2(host, scan_start, scan_end):
    """Extract audit logs using psycopg2."""
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        print("ERROR: psycopg2 not installed. Install with: pip install psycopg2-binary", file=sys.stderr)
        sys.exit(1)

    conn_str = f"postgresql://tiresias:TiresiasDB2026Pentest@{host}:5432/tiresias"

    try:
        conn = psycopg2.connect(conn_str)
        conn.set_session(readonly=True)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        if scan_end:
            cur.execute("""
                SELECT id, tenant_id, event_type, source_ip, user_agent,
                       endpoint, method, status_code, risk_score, anomaly_flags,
                       details, created_at
                FROM audit_log
                WHERE created_at >= %s AND created_at <= %s
                ORDER BY created_at ASC
            """, (scan_start, scan_end))
        else:
            cur.execute("""
                SELECT id, tenant_id, event_type, source_ip, user_agent,
                       endpoint, method, status_code, risk_score, anomaly_flags,
                       details, created_at
                FROM audit_log
                WHERE created_at >= %s
                ORDER BY created_at ASC
            """, (scan_start,))

        rows = cur.fetchall()
        cur.close()
        conn.close()

        entries = []
        for row in rows:
            entry = dict(row)
            for key in entry:
                if isinstance(entry[key], datetime):
                    entry[key] = entry[key].isoformat()
                elif hasattr(entry[key], '__str__') and not isinstance(entry[key], (str, int, float, bool, type(None))):
                    entry[key] = str(entry[key])
            entries.append(entry)
        return entries

    except Exception as e:
        print(f"ERROR: Database query failed: {e}", file=sys.stderr)

        # Try alternative table names
        try:
            conn = psycopg2.connect(conn_str)
            conn.set_session(readonly=True)
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            cur.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public'
                AND (table_name LIKE '%%audit%%' OR table_name LIKE '%%event%%' OR table_name LIKE '%%watch%%')
            """)
            tables = [row["table_name"] for row in cur.fetchall()]
            print(f"Found potential tables: {tables}", file=sys.stderr)

            for table in tables:
                try:
                    cur.execute(f"SELECT * FROM {table} WHERE created_at >= %s ORDER BY created_at ASC LIMIT 10000",
                                (scan_start,))
                    rows = cur.fetchall()
                    if rows:
                        entries = []
                        for row in rows:
                            entry = dict(row)
                            for key in entry:
                                if isinstance(entry[key], datetime):
                                    entry[key] = entry[key].isoformat()
                                elif hasattr(entry[key], '__str__') and not isinstance(entry[key], (str, int, float, bool, type(None))):
                                    entry[key] = str(entry[key])
                            entries.append(entry)
                        cur.close()
                        conn.close()
                        return entries
                except Exception:
                    conn.rollback()

            cur.close()
            conn.close()
        except Exception:
            pass

        return []


def classify_audit_entry(entry):
    """Classify an audit entry as scan-related or normal."""
    indicators = {"scan_related": False, "scan_type": None, "detected_as_anomaly": False}

    ua = (entry.get("user_agent") or "").lower()
    for scanner in ["nuclei", "zap", "trivy", "pentest", "scanner", "nikto", "nmap"]:
        if scanner in ua:
            indicators["scan_related"] = True
            indicators["scan_type"] = scanner
            break

    endpoint = entry.get("endpoint", "")
    status = entry.get("status_code", 0)
    if status in (401, 403) and endpoint and "/admin" in endpoint:
        indicators["scan_related"] = True
        indicators["scan_type"] = indicators.get("scan_type") or "auth_test"

    anomaly_flags = entry.get("anomaly_flags") or []
    risk_score = entry.get("risk_score") or 0
    if anomaly_flags or risk_score > 50:
        indicators["detected_as_anomaly"] = True

    return indicators


def main():
    parser = argparse.ArgumentParser(description="Extract SoulWatch audit data")
    parser.add_argument("--target", default="192.168.12.169")
    parser.add_argument("--scan-start", required=True, help="ISO 8601 timestamp")
    parser.add_argument("--scan-end", default=None)
    parser.add_argument("--output", default="soulwatch_audit.json")
    args = parser.parse_args()

    scan_end = args.scan_end or datetime.now(timezone.utc).isoformat()

    print(f"Extracting audit data from {args.target}")
    print(f"  Window: {args.scan_start} to {scan_end}")

    entries = extract_via_psycopg2(args.target, args.scan_start, scan_end)
    print(f"  Extracted {len(entries)} entries")

    scan_related = detected = undetected = 0
    for entry in entries:
        c = classify_audit_entry(entry)
        entry["_classification"] = c
        if c["scan_related"]:
            scan_related += 1
            if c["detected_as_anomaly"]:
                detected += 1
            else:
                undetected += 1

    rate = f"{(detected/scan_related*100):.1f}%" if scan_related > 0 else "N/A"

    output = {
        "extraction_date": datetime.now(timezone.utc).isoformat(),
        "target": args.target,
        "scan_window": {"start": args.scan_start, "end": scan_end},
        "summary": {
            "total_entries": len(entries),
            "scan_related": scan_related,
            "detected_as_anomaly": detected,
            "undetected": undetected,
            "detection_rate": rate,
        },
        "entries": entries,
    }

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\n  Total: {len(entries)} | Scan-related: {scan_related} | Detected: {detected} | Rate: {rate}")
    print(f"  Output: {args.output}")


if __name__ == "__main__":
    main()
