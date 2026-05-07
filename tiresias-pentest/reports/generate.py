#!/usr/bin/env python3
"""
Pentest Report Generator for Tiresias.

Reads scan outputs from a date directory and generates HTML/PDF reports.

Usage:
    python3 generate.py --scan-dir /repos/security/pentest-reports/2026-03-21_120000 --type weekly
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
    except (json.JSONDecodeError, FileNotFoundError, PermissionError):
        return None


def collect_scan_data(scan_dir):
    scan_path = Path(scan_dir)
    data = {"summary": None, "trivy": [], "nuclei": [], "zap": [],
            "api": [], "custom_tests": [], "self_monitoring": None}

    summary_file = scan_path / "summary.json"
    if summary_file.exists():
        data["summary"] = load_json_safe(str(summary_file))

    trivy_dir = scan_path / "trivy"
    if trivy_dir.exists():
        for f in trivy_dir.glob("*.json"):
            if f.name.endswith(".sbom.json"):
                continue
            result = load_json_safe(str(f))
            if result:
                data["trivy"].append({"file": f.name, "data": result})

    nuclei_dir = scan_path / "nuclei"
    if nuclei_dir.exists():
        for f in nuclei_dir.glob("*.json"):
            lines = []
            try:
                with open(f) as fh:
                    for line in fh:
                        line = line.strip()
                        if line:
                            try:
                                lines.append(json.loads(line))
                            except json.JSONDecodeError:
                                pass
            except Exception:
                pass
            if lines:
                data["nuclei"].append({"file": f.name, "data": lines})

    zap_dir = scan_path / "zap"
    if zap_dir.exists():
        for f in zap_dir.glob("*.json"):
            result = load_json_safe(str(f))
            if result:
                data["zap"].append({"file": f.name, "data": result})

    for dirname, key in [("api", "api"), ("tiresias", "custom_tests")]:
        d = scan_path / dirname
        if d.exists():
            for f in d.glob("*.json"):
                result = load_json_safe(str(f))
                if result:
                    data[key].append({"file": f.name, "data": result})

    selfmon_dir = scan_path / "self-monitoring"
    if selfmon_dir.exists():
        detection_file = selfmon_dir / "detection_rate.json"
        if detection_file.exists():
            data["self_monitoring"] = load_json_safe(str(detection_file))

    return data


def escape_html(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def render_trivy_section(trivy_data):
    if not trivy_data:
        return "<p>No Trivy scan results available.</p>"

    html = ""
    for item in trivy_data:
        image_name = item["file"].replace(".json", "").replace("_", ":")
        results = item["data"].get("Results", [])
        total_vulns = sum(len(r.get("Vulnerabilities", [])) for r in results)
        html += f"<h3>{escape_html(image_name)}</h3>\n"
        html += f"<p>Total vulnerabilities: {total_vulns}</p>\n"

        if total_vulns == 0:
            continue

        html += "<table><thead><tr><th>CVE ID</th><th>Package</th><th>Installed</th><th>Fixed</th><th>Severity</th><th>Title</th></tr></thead><tbody>\n"
        for result in results:
            for vuln in result.get("Vulnerabilities", []):
                sev = vuln.get("Severity", "UNKNOWN")
                html += f"<tr class='{sev.lower()}'>"
                html += f"<td>{escape_html(vuln.get('VulnerabilityID', ''))}</td>"
                html += f"<td>{escape_html(vuln.get('PkgName', ''))}</td>"
                html += f"<td>{escape_html(vuln.get('InstalledVersion', ''))}</td>"
                html += f"<td>{escape_html(vuln.get('FixedVersion', 'N/A'))}</td>"
                html += f"<td><span class='badge {sev.lower()}'>{sev}</span></td>"
                html += f"<td>{escape_html(vuln.get('Title', '')[:80])}</td></tr>\n"
        html += "</tbody></table>\n"

    return html


def render_custom_tests_section(tests):
    if not tests:
        return "<p>No custom test results available.</p>"

    html = ""
    for item in tests:
        suite = item["data"].get("test_suite", item["file"])
        summary = item["data"].get("summary", {})
        overall = item["data"].get("overall_result", "UNKNOWN")
        results = item["data"].get("results", [])
        cls = "pass" if overall == "PASS" else "fail"
        html += f"<h3>{escape_html(suite)} -- <span class='{cls}'>{overall}</span></h3>\n"
        html += f"<p>Tests: {summary.get('total', 0)} | Passed: {summary.get('passed', 0)} | Failed: {summary.get('failed', 0)}</p>\n"

        if results:
            html += "<table><thead><tr><th>Test</th><th>Result</th><th>Details</th></tr></thead><tbody>\n"
            for r in results:
                passed = r.get("passed", False)
                c = "pass" if passed else "fail"
                html += f"<tr class='{c}'><td>{escape_html(r.get('test', ''))}</td>"
                html += f"<td><span class='badge {c}'>{'PASS' if passed else 'FAIL'}</span></td>"
                html += f"<td>{escape_html(r.get('details', ''))}</td></tr>\n"
            html += "</tbody></table>\n"
    return html


def generate_report_html(scan_data, report_type):
    template_dir = Path(__file__).parent / "templates"
    template_file = template_dir / f"{report_type}.html"

    summary = scan_data.get("summary") or {}
    findings = summary.get("findings", {})
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    if template_file.exists():
        with open(template_file) as f:
            template = f.read()
    else:
        template = DEFAULT_TEMPLATE

    trivy_html = render_trivy_section(scan_data["trivy"])
    custom_html = render_custom_tests_section(scan_data["custom_tests"] + scan_data["api"])
    nuclei_count = sum(len(item["data"]) for item in scan_data["nuclei"])
    zap_count = sum(len(item["data"].get("alerts", [])) for item in scan_data["zap"])
    selfmon = scan_data.get("self_monitoring") or {}

    replacements = {
        "{{REPORT_TYPE}}": report_type.capitalize(),
        "{{GENERATED_DATE}}": now,
        "{{SCAN_DATE}}": summary.get("scan_start", now),
        "{{TARGET}}": summary.get("target", "N/A"),
        "{{PROFILE}}": summary.get("profile", "N/A"),
        "{{CRITICAL_COUNT}}": str(findings.get("critical", 0)),
        "{{HIGH_COUNT}}": str(findings.get("high", 0)),
        "{{MEDIUM_COUNT}}": str(findings.get("medium", 0)),
        "{{LOW_COUNT}}": str(findings.get("low", 0)),
        "{{TOTAL_COUNT}}": str(findings.get("total", 0)),
        "{{TRIVY_SECTION}}": trivy_html,
        "{{NUCLEI_COUNT}}": str(nuclei_count),
        "{{ZAP_COUNT}}": str(zap_count),
        "{{CUSTOM_TESTS_SECTION}}": custom_html,
        "{{DETECTION_RATE}}": str(selfmon.get("detection_rate", "N/A")),
    }

    html = template
    for key, value in replacements.items():
        html = html.replace(key, value)
    return html


DEFAULT_TEMPLATE = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Tiresias {{REPORT_TYPE}} Report</title>
<style>body{font-family:sans-serif;margin:40px;color:#1a1a2e}h1{border-bottom:3px solid #0f3460;padding-bottom:10px}
table{border-collapse:collapse;width:100%;margin:15px 0;font-size:.9em}th{background:#0f3460;color:#fff;padding:10px 12px;text-align:left}
td{padding:8px 12px;border-bottom:1px solid #e0e0e0}tr:nth-child(even){background:#f8f9fa}
.badge{padding:3px 8px;border-radius:3px;font-weight:bold;font-size:.85em}
.badge.critical{background:#c62828;color:#fff}.badge.high{background:#e65100;color:#fff}
.badge.medium{background:#f57f17;color:#fff}.badge.pass{background:#2e7d32;color:#fff}
.badge.fail{background:#c62828;color:#fff}tr.fail td{background:#ffebee}
.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin:20px 0}
.summary-card{padding:20px;border-radius:8px;text-align:center}
.summary-card .count{font-size:2.5em;font-weight:bold}.meta{color:#666;font-size:.9em}
@page{size:A4;margin:2cm}</style></head><body>
<h1>Tiresias {{REPORT_TYPE}} Pentest Report</h1>
<p class="meta">Generated: {{GENERATED_DATE}} | Target: {{TARGET}} | Profile: {{PROFILE}}</p>
<h2>Summary</h2><p>Critical: {{CRITICAL_COUNT}} | High: {{HIGH_COUNT}} | Medium: {{MEDIUM_COUNT}} | Low: {{LOW_COUNT}} | Total: {{TOTAL_COUNT}}</p>
<h2>Container Vulnerabilities</h2>{{TRIVY_SECTION}}
<h2>Custom Tests</h2>{{CUSTOM_TESTS_SECTION}}
<h2>Self-Monitoring</h2><p>Detection rate: {{DETECTION_RATE}}</p>
<hr><p class="meta">Tiresias Pentest Program | Saluca LLC</p></body></html>"""


def main():
    parser = argparse.ArgumentParser(description="Generate pentest report")
    parser.add_argument("--scan-dir", required=True, help="Scan results directory")
    parser.add_argument("--type", default="weekly", choices=["weekly", "monthly"])
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--pdf", action="store_true", help="Also generate PDF (requires weasyprint)")
    args = parser.parse_args()

    output_dir = args.output_dir or args.scan_dir
    os.makedirs(output_dir, exist_ok=True)

    print(f"Collecting scan data from {args.scan_dir}...")
    scan_data = collect_scan_data(args.scan_dir)

    print(f"Generating {args.type} report...")
    html = generate_report_html(scan_data, args.type)

    html_path = os.path.join(output_dir, f"{args.type}_report.html")
    with open(html_path, "w") as f:
        f.write(html)
    print(f"HTML report: {html_path}")

    if args.pdf:
        try:
            from weasyprint import HTML
            pdf_path = os.path.join(output_dir, f"{args.type}_report.pdf")
            HTML(string=html).write_pdf(pdf_path)
            print(f"PDF report: {pdf_path}")
        except ImportError:
            print("WARNING: weasyprint not installed. Skipping PDF.", file=sys.stderr)


if __name__ == "__main__":
    main()
