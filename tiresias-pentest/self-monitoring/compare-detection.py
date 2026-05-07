#!/usr/bin/env python3
"""
Detection Rate Comparison for Tiresias Pentest Program.

Compares scan activity vs SoulWatch detection, producing an efficacy report.

Usage:
    python3 compare-detection.py --scan-dir /path/to/scan --audit-file soulwatch_audit.json --output detection_rate.json
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def load_json_safe(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return None


def count_scan_events(scan_dir):
    scan_path = Path(scan_dir)
    events = {
        "trivy_scans": 0, "nuclei_requests": 0, "zap_requests": 0,
        "auth_bypass_tests": 0, "jwt_tests": 0,
        "tenant_isolation_tests": 0, "encryption_tests": 0,
        "total_scan_requests": 0,
    }

    trivy_dir = scan_path / "trivy"
    if trivy_dir.exists():
        events["trivy_scans"] = len([f for f in trivy_dir.glob("*.json") if not f.name.endswith(".sbom.json")])

    nuclei_dir = scan_path / "nuclei"
    if nuclei_dir.exists():
        for f in nuclei_dir.glob("*.json"):
            try:
                with open(f) as fh:
                    events["nuclei_requests"] += sum(1 for line in fh if line.strip())
            except Exception:
                pass

    zap_dir = scan_path / "zap"
    if zap_dir.exists():
        for f in zap_dir.glob("*.json"):
            data = load_json_safe(str(f))
            if data and isinstance(data, dict):
                events["zap_requests"] += len(data.get("alerts", []))

    for test_dir in [scan_path / "api", scan_path / "tiresias"]:
        if not test_dir.exists():
            continue
        for f in test_dir.glob("*.json"):
            data = load_json_safe(str(f))
            if not data or not isinstance(data, dict):
                continue
            suite = data.get("test_suite", "")
            count = len(data.get("results", []))
            if suite == "auth_bypass":
                events["auth_bypass_tests"] = count
            elif suite == "jwt_confusion":
                events["jwt_tests"] = count
            elif suite == "tenant_isolation":
                events["tenant_isolation_tests"] = count
            elif suite == "encryption_verify":
                events["encryption_tests"] = count

    events["total_scan_requests"] = sum([
        events["nuclei_requests"] * 10,
        events["zap_requests"] * 5,
        events["auth_bypass_tests"],
        events["jwt_tests"],
        events["tenant_isolation_tests"],
        events["encryption_tests"],
    ])
    return events


def analyze_detection(audit_data, scan_events):
    summary = audit_data.get("summary", {})
    scan_related = summary.get("scan_related", 0)
    detected = summary.get("detected_as_anomaly", 0)
    undetected = summary.get("undetected", 0)

    if scan_related == 0:
        grade, assessment = "UNKNOWN", "No scan-related activity in audit log."
    elif detected == 0:
        grade, assessment = "F", "SoulWatch failed to detect any scan activity."
    else:
        rate = detected / scan_related * 100
        if rate >= 90:
            grade, assessment = "A", f"Excellent detection ({rate:.1f}%)."
        elif rate >= 70:
            grade, assessment = "B", f"Good detection ({rate:.1f}%)."
        elif rate >= 50:
            grade, assessment = "C", f"Moderate detection ({rate:.1f}%)."
        elif rate >= 30:
            grade, assessment = "D", f"Poor detection ({rate:.1f}%)."
        else:
            grade, assessment = "F", f"Very poor detection ({rate:.1f}%)."

    entries = audit_data.get("entries", [])
    undetected_types = {}
    detected_types = {}
    for entry in entries:
        c = entry.get("_classification", {})
        if not c.get("scan_related"):
            continue
        st = c.get("scan_type", "unknown")
        if c.get("detected_as_anomaly"):
            detected_types[st] = detected_types.get(st, 0) + 1
        else:
            undetected_types[st] = undetected_types.get(st, 0) + 1

    recommendations = []
    if "nuclei" in undetected_types:
        recommendations.append("Add Nuclei user-agent to SoulWatch detection rules")
    if "zap" in undetected_types:
        recommendations.append("Add ZAP user-agent to SoulWatch detection rules")
    if "auth_test" in undetected_types:
        recommendations.append("Tune auth failure rate detection for rapid 401/403 responses")
    if undetected > 0:
        recommendations.append(f"Review {undetected} undetected events to improve thresholds")
    if grade in ("D", "F"):
        recommendations.append("Add rate-limiting for rapid sequential requests from same IP")

    return {
        "detection_rate": summary.get("detection_rate", "N/A"),
        "grade": grade,
        "assessment": assessment,
        "scan_events_generated": scan_events,
        "audit_summary": {
            "total": summary.get("total_entries", 0),
            "scan_related": scan_related,
            "detected": detected,
            "undetected": undetected,
        },
        "detected_by_type": detected_types,
        "undetected_by_type": undetected_types,
        "recommendations": recommendations,
    }


def main():
    parser = argparse.ArgumentParser(description="Compare scan vs SoulWatch detection")
    parser.add_argument("--scan-dir", required=True)
    parser.add_argument("--audit-file", required=True)
    parser.add_argument("--output", default="detection_rate.json")
    args = parser.parse_args()

    scan_events = count_scan_events(args.scan_dir)
    audit_data = load_json_safe(args.audit_file) or {"summary": {}, "entries": []}
    analysis = analyze_detection(audit_data, scan_events)

    output = {
        "analysis_date": datetime.now(timezone.utc).isoformat(),
        "scan_dir": args.scan_dir,
        **analysis,
    }

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Grade: {analysis['grade']} | Rate: {analysis['detection_rate']}")
    print(f"Assessment: {analysis['assessment']}")
    if analysis["recommendations"]:
        for r in analysis["recommendations"]:
            print(f"  - {r}")
    print(f"Output: {args.output}")


if __name__ == "__main__":
    main()
