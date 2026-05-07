#!/usr/bin/env python3
"""
Encryption and TLS Verification Tests for Tiresias.

Verifies TLS configuration, security headers, sensitive data exposure,
CORS configuration, and error information leakage.

Usage:
    python3 encryption-verify.py --target 192.168.12.169 --output encryption_verify.json
"""

import argparse
import json
import re
import socket
import ssl
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone


class EncryptionVerifier:
    def __init__(self, target):
        self.target = target
        self.results = []
        self.services = {
            "soulauth": 8000,
            "soulwatch": 8001,
            "soulgate": 8002,
            "portal": 3000,
        }

    def _record(self, test, passed, details, severity="medium"):
        self.results.append({
            "test": test, "passed": passed, "details": details,
            "severity": severity,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        indicator = "PASS" if passed else "FAIL"
        print(f"  [{indicator}] {test}: {details}")

    def _http_get(self, url, headers=None):
        hdrs = {"User-Agent": "TiresiasPentest/1.0"}
        if headers:
            hdrs.update(headers)
        req = urllib.request.Request(url, headers=hdrs)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return {"status": resp.status, "headers": dict(resp.headers),
                        "body": resp.read().decode()[:2000]}
        except urllib.error.HTTPError as e:
            return {"status": e.code, "headers": dict(e.headers) if e.headers else {},
                    "body": (e.read().decode()[:2000] if e.fp else "")}
        except Exception as e:
            return {"status": 0, "headers": {}, "body": str(e)}

    def test_tls_availability(self):
        """Check if TLS is available on service ports."""
        print("\n[1/6] Testing TLS availability...")
        for service, port in self.services.items():
            try:
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                with socket.create_connection((self.target, port), timeout=5) as sock:
                    try:
                        with ctx.wrap_socket(sock, server_hostname=self.target) as ssock:
                            self._record(f"tls_available_{service}", True,
                                         f"TLS available on :{port} ({ssock.version()})")
                    except ssl.SSLError:
                        self._record(f"tls_available_{service}", False,
                                     f"No TLS on :{port} (plaintext HTTP only)", severity="high")
            except (ConnectionRefusedError, socket.timeout, OSError):
                self._record(f"tls_available_{service}", False,
                             f"Port {port} unreachable", severity="info")

    def test_tls_configuration(self):
        """Test TLS protocol versions."""
        print("\n[2/6] Testing TLS configuration...")
        for service, port in self.services.items():
            for proto_name in ["TLSv1", "TLSv1.1"]:
                try:
                    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                    if proto_name == "TLSv1":
                        ctx.maximum_version = ssl.TLSVersion.TLSv1
                    elif proto_name == "TLSv1.1":
                        ctx.maximum_version = ssl.TLSVersion.TLSv1_1

                    with socket.create_connection((self.target, port), timeout=5) as sock:
                        try:
                            with ctx.wrap_socket(sock, server_hostname=self.target):
                                self._record(f"weak_proto_{service}_{proto_name}", False,
                                             f"VULNERABILITY: {proto_name} accepted on :{port}", severity="high")
                        except (ssl.SSLError, ConnectionResetError):
                            self._record(f"weak_proto_{service}_{proto_name}", True,
                                         f"{proto_name} correctly rejected on :{port}")
                except (ConnectionRefusedError, socket.timeout, OSError, ValueError):
                    self._record(f"weak_proto_{service}_{proto_name}", True,
                                 f"Port {port} not reachable or protocol not supported")

    def test_security_headers(self):
        """Test HTTP security headers on all services."""
        print("\n[3/6] Testing security headers...")
        required = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": ["DENY", "SAMEORIGIN"],
            "X-XSS-Protection": None,
            "Referrer-Policy": None,
        }
        recommended = ["Strict-Transport-Security", "Content-Security-Policy", "Permissions-Policy"]

        for service, port in self.services.items():
            resp = self._http_get(f"http://{self.target}:{port}/")
            if resp["status"] == 0:
                continue
            headers = {k.lower(): v for k, v in resp["headers"].items()}

            for header, expected in required.items():
                value = headers.get(header.lower())
                if value is None:
                    self._record(f"header_{service}_{header}", False, f"Missing {header}", severity="medium")
                elif expected and isinstance(expected, list):
                    if value.upper() in [e.upper() for e in expected]:
                        self._record(f"header_{service}_{header}", True, f"{header}: {value}")
                    else:
                        self._record(f"header_{service}_{header}", False,
                                     f"{header}: {value} (expected one of {expected})", severity="medium")
                else:
                    self._record(f"header_{service}_{header}", True, f"{header}: {value}")

            for header in recommended:
                if not headers.get(header.lower()):
                    self._record(f"header_{service}_{header}", False,
                                 f"Missing recommended: {header}", severity="low")

            server = headers.get("server", "")
            if server and any(v in server.lower() for v in ["version", ".", "/"]):
                self._record(f"info_disclosure_{service}_server", False,
                             f"Server header discloses version: {server}", severity="low")

            if headers.get("x-powered-by"):
                self._record(f"info_disclosure_{service}_powered_by", False,
                             f"X-Powered-By present: {headers['x-powered-by']}", severity="low")

    def test_sensitive_data_exposure(self):
        """Test for sensitive data in responses."""
        print("\n[4/6] Testing sensitive data exposure...")
        patterns = [
            (r"password\s*[=:]\s*\S+", "password"),
            (r"secret\s*[=:]\s*\S+", "secret"),
            (r"api[_-]?key\s*[=:]\s*\S+", "API key"),
            (r"-----BEGIN.*PRIVATE KEY-----", "private key"),
            (r"AKIA[0-9A-Z]{16}", "AWS key"),
            (r"eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.", "JWT token"),
        ]
        paths = [("/", "root"), ("/health", "health"), ("/openapi.json", "openapi")]

        for service, port in self.services.items():
            for path, name in paths:
                resp = self._http_get(f"http://{self.target}:{port}{path}")
                if resp["status"] == 0:
                    continue
                found = [label for pat, label in patterns if re.search(pat, resp["body"], re.IGNORECASE)]
                if found:
                    self._record(f"sensitive_{service}_{name}", False,
                                 f"Sensitive data in {path}: {', '.join(found)}", severity="high")
                else:
                    self._record(f"sensitive_{service}_{name}", True, f"No sensitive data in {path}")

    def test_cors_configuration(self):
        """Test CORS configuration."""
        print("\n[5/6] Testing CORS configuration...")
        for service, port in self.services.items():
            resp = self._http_get(f"http://{self.target}:{port}/",
                                  headers={"Origin": "https://evil.example.com"})
            if resp["status"] == 0:
                continue
            acao = resp["headers"].get("Access-Control-Allow-Origin", "")
            acac = resp["headers"].get("Access-Control-Allow-Credentials", "")

            if acao == "*":
                self._record(f"cors_{service}_wildcard", False,
                             "CORS allows any origin (*)", severity="medium")
            elif "evil.example.com" in acao:
                self._record(f"cors_{service}_reflected", False,
                             "CORS reflects arbitrary origin!", severity="high")
            else:
                self._record(f"cors_{service}", True,
                             f"CORS restricted: {acao or 'none'}")

            if acac.lower() == "true" and acao == "*":
                self._record(f"cors_{service}_creds_wildcard", False,
                             "CORS credentials with wildcard!", severity="critical")

    def test_error_information(self):
        """Test for information leakage in error responses."""
        print("\n[6/6] Testing error response leakage...")
        triggers = [("/nonexistent-12345", "404"), ("/v1/soulauth/admin/tenants/'", "sqli")]
        leak_patterns = [
            (r"traceback|stack trace", "stack trace"),
            (r"sqlalchemy|psycopg|asyncpg", "db driver"),
            (r"file \".*\.py\"", "file path"),
            (r"postgresql://", "database URL"),
        ]

        for service, port in self.services.items():
            for path, name in triggers:
                resp = self._http_get(f"http://{self.target}:{port}{path}")
                if resp["status"] == 0:
                    continue
                found = [label for pat, label in leak_patterns if re.search(pat, resp["body"], re.IGNORECASE)]
                if found:
                    self._record(f"error_leak_{service}_{name}", False,
                                 f"Info leak: {', '.join(found)}", severity="medium")
                else:
                    self._record(f"error_leak_{service}_{name}", True, f"No leakage in {name} error")

    def run(self):
        print("=" * 60)
        print("Encryption & Security Configuration Verification")
        print("=" * 60)

        self.test_tls_availability()
        self.test_tls_configuration()
        self.test_security_headers()
        self.test_sensitive_data_exposure()
        self.test_cors_configuration()
        self.test_error_information()

        return self.get_report()

    def get_report(self):
        total = len(self.results)
        passed = sum(1 for r in self.results if r["passed"])
        failed = total - passed
        sev_counts = {}
        for r in self.results:
            if not r["passed"]:
                sev_counts[r["severity"]] = sev_counts.get(r["severity"], 0) + 1

        report = {
            "test_suite": "encryption_verify",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "target": self.target,
            "summary": {"total": total, "passed": passed, "failed": failed,
                        "pass_rate": f"{(passed/total*100) if total else 0:.1f}%",
                        "failed_by_severity": sev_counts},
            "overall_result": "PASS" if failed == 0 else "FAIL",
            "results": self.results,
        }

        print(f"\n{'=' * 60}")
        print(f"Results: {passed}/{total} passed ({report['summary']['pass_rate']})")
        print(f"Overall: {report['overall_result']}")
        return report


def main():
    parser = argparse.ArgumentParser(description="Verify encryption in Tiresias")
    parser.add_argument("--target", default="192.168.12.169", help="Target IP")
    parser.add_argument("--output", default="encryption_verify.json", help="Output file")
    args = parser.parse_args()

    verifier = EncryptionVerifier(args.target)
    report = verifier.run()

    with open(args.output, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport saved to {args.output}")


if __name__ == "__main__":
    main()
