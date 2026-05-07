#!/usr/bin/env python3
"""
Authentication Bypass Security Tests for Tiresias SoulAuth.

Tests all admin endpoints for authentication enforcement:
- No authentication header
- Expired JWT
- Wrong tenant's soulkey
- Malformed tokens
- Header injection attempts

Usage:
    python3 auth-bypass.py --target 192.168.12.169 --output auth_bypass.json
"""

import argparse
import base64
import json
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone


ADMIN_ENDPOINTS = [
    ("GET", "/v1/soulauth/admin/tenants"),
    ("GET", "/v1/soulauth/admin/soulkeys"),
    ("GET", "/v1/soulauth/admin/audit"),
    ("GET", "/v1/soulauth/admin/stats"),
    ("POST", "/v1/soulauth/admin/soulkeys"),
    ("POST", "/v1/saas/provision"),
    ("DELETE", "/v1/soulauth/admin/soulkeys/fake-id"),
    ("PUT", "/v1/soulauth/admin/tenants/fake-id"),
    ("GET", "/v1/soulauth/admin/config"),
    ("PUT", "/v1/soulauth/admin/config"),
]

GATE_ENDPOINTS = [
    ("GET", "/v1/gate/admin/routes"),
    ("GET", "/v1/gate/admin/stats"),
    ("POST", "/v1/gate/route"),
]

WATCH_ENDPOINTS = [
    ("GET", "/v1/watch/admin/alerts"),
    ("GET", "/v1/watch/admin/policies"),
    ("GET", "/v1/watch/admin/anomalies"),
]


def make_expired_jwt():
    """Create a JWT that expired in the past (unsigned, for testing rejection)."""
    header = base64.urlsafe_b64encode(json.dumps({
        "alg": "ES256", "typ": "JWT", "kid": "pentest-expired"
    }).encode()).rstrip(b"=").decode()

    payload = base64.urlsafe_b64encode(json.dumps({
        "sub": "pentest-user",
        "tenant_id": "fake-tenant-id",
        "iat": int(time.time()) - 7200,
        "exp": int(time.time()) - 3600,
        "scopes": ["admin"],
    }).encode()).rstrip(b"=").decode()

    sig = base64.urlsafe_b64encode(b"fakesignature" * 4).rstrip(b"=").decode()
    return f"{header}.{payload}.{sig}"


def make_none_alg_jwt():
    """Create a JWT with alg:none (classic bypass attempt)."""
    header = base64.urlsafe_b64encode(json.dumps({
        "alg": "none", "typ": "JWT"
    }).encode()).rstrip(b"=").decode()

    payload = base64.urlsafe_b64encode(json.dumps({
        "sub": "admin",
        "tenant_id": "root",
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "scopes": ["admin", "superadmin"],
        "role": "admin",
    }).encode()).rstrip(b"=").decode()

    return f"{header}.{payload}."


def make_confused_jwt():
    """Create a JWT with RS256/HS256 algorithm confusion attempt."""
    import hmac
    import hashlib

    header = base64.urlsafe_b64encode(json.dumps({
        "alg": "HS256", "typ": "JWT"
    }).encode()).rstrip(b"=").decode()

    payload = base64.urlsafe_b64encode(json.dumps({
        "sub": "admin",
        "tenant_id": "root",
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "scopes": ["admin"],
    }).encode()).rstrip(b"=").decode()

    sig_input = f"{header}.{payload}".encode()
    sig = base64.urlsafe_b64encode(
        hmac.new(b"", sig_input, hashlib.sha256).digest()
    ).rstrip(b"=").decode()

    return f"{header}.{payload}.{sig}"


class AuthBypassTester:
    def __init__(self, target):
        self.soulauth_url = f"http://{target}:8000"
        self.soulgate_url = f"http://{target}:8002"
        self.soulwatch_url = f"http://{target}:8001"
        self.results = []

    def _request(self, method, url, headers=None, data=None):
        hdrs = {"Content-Type": "application/json"}
        if headers:
            hdrs.update(headers)

        body = json.dumps(data).encode() if data else None
        req = urllib.request.Request(url, data=body, headers=hdrs, method=method)

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return {"status": resp.status, "body": resp.read().decode()[:500]}
        except urllib.error.HTTPError as e:
            return {"status": e.code, "body": (e.read().decode()[:500] if e.fp else "")}
        except Exception as e:
            return {"status": 0, "body": str(e)}

    def _record(self, test_name, passed, details, status):
        self.results.append({
            "test": test_name,
            "passed": passed,
            "details": details,
            "response_status": status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        indicator = "PASS" if passed else "FAIL"
        print(f"  [{indicator}] {test_name}: {details}")

    def test_no_auth(self):
        """Test all admin endpoints with no authentication."""
        print("\n[1/6] Testing endpoints with NO authentication...")

        all_endpoints = [
            (self.soulauth_url, ADMIN_ENDPOINTS, "soulauth"),
            (self.soulgate_url, GATE_ENDPOINTS, "soulgate"),
            (self.soulwatch_url, WATCH_ENDPOINTS, "soulwatch"),
        ]

        for base_url, endpoints, service in all_endpoints:
            for method, path in endpoints:
                resp = self._request(method, f"{base_url}{path}")
                if resp["status"] in (401, 403):
                    self._record(f"no_auth_{service}_{method}_{path}", True,
                                 f"Correctly rejected (HTTP {resp['status']})", resp["status"])
                elif resp["status"] in (404, 405):
                    self._record(f"no_auth_{service}_{method}_{path}", True,
                                 "Endpoint not found (acceptable)", resp["status"])
                else:
                    self._record(f"no_auth_{service}_{method}_{path}", False,
                                 f"VULNERABILITY: Got HTTP {resp['status']} without auth!", resp["status"])

    def test_expired_jwt(self):
        """Test endpoints with an expired JWT."""
        print("\n[2/6] Testing endpoints with EXPIRED JWT...")

        expired_token = make_expired_jwt()

        for method, path in ADMIN_ENDPOINTS:
            resp = self._request(method, f"{self.soulauth_url}{path}", headers={
                "Authorization": f"Bearer {expired_token}",
            })

            if resp["status"] in (401, 403):
                self._record(f"expired_jwt_{method}_{path}", True,
                             f"Correctly rejected expired JWT (HTTP {resp['status']})", resp["status"])
            elif resp["status"] in (404, 405):
                self._record(f"expired_jwt_{method}_{path}", True,
                             f"Endpoint returned {resp['status']} (acceptable)", resp["status"])
            else:
                self._record(f"expired_jwt_{method}_{path}", False,
                             f"VULNERABILITY: Expired JWT accepted (HTTP {resp['status']})!", resp["status"])

    def test_none_algorithm(self):
        """Test JWT with alg:none bypass attempt."""
        print("\n[3/6] Testing JWT alg:none bypass...")

        none_token = make_none_alg_jwt()

        for method, path in ADMIN_ENDPOINTS[:3]:
            resp = self._request(method, f"{self.soulauth_url}{path}", headers={
                "Authorization": f"Bearer {none_token}",
            })

            if resp["status"] in (401, 403):
                self._record(f"none_alg_{method}_{path}", True,
                             f"Correctly rejected alg:none (HTTP {resp['status']})", resp["status"])
            elif resp["status"] in (404, 405):
                self._record(f"none_alg_{method}_{path}", True,
                             f"Endpoint returned {resp['status']} (acceptable)", resp["status"])
            else:
                self._record(f"none_alg_{method}_{path}", False,
                             f"CRITICAL: alg:none JWT accepted (HTTP {resp['status']})!", resp["status"])

    def test_algorithm_confusion(self):
        """Test JWT algorithm confusion (RS256/HS256 swap)."""
        print("\n[4/6] Testing JWT algorithm confusion...")

        confused_token = make_confused_jwt()

        for method, path in ADMIN_ENDPOINTS[:3]:
            resp = self._request(method, f"{self.soulauth_url}{path}", headers={
                "Authorization": f"Bearer {confused_token}",
            })

            if resp["status"] in (401, 403):
                self._record(f"alg_confusion_{method}_{path}", True,
                             f"Correctly rejected confused JWT (HTTP {resp['status']})", resp["status"])
            elif resp["status"] in (404, 405):
                self._record(f"alg_confusion_{method}_{path}", True,
                             f"Endpoint returned {resp['status']} (acceptable)", resp["status"])
            else:
                self._record(f"alg_confusion_{method}_{path}", False,
                             f"CRITICAL: Algorithm-confused JWT accepted (HTTP {resp['status']})!", resp["status"])

    def test_malformed_tokens(self):
        """Test with various malformed authentication tokens."""
        print("\n[5/6] Testing malformed tokens...")

        malformed_tokens = [
            ("empty_bearer", "Bearer "),
            ("no_bearer_prefix", "sk_fake_token_12345"),
            ("basic_auth", "Basic " + base64.b64encode(b"admin:admin").decode()),
            ("double_bearer", "Bearer Bearer token"),
            ("null_bytes", "Bearer \x00\x00\x00"),
            ("unicode_bypass", "Bearer \u0000admin"),
            ("oversized", "Bearer " + "A" * 10000),
            ("sql_injection", "Bearer ' OR '1'='1"),
            ("jwt_without_sig", "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9"),
        ]

        for name, token in malformed_tokens:
            resp = self._request("GET", f"{self.soulauth_url}/v1/soulauth/admin/tenants", headers={
                "Authorization": token,
            })

            if resp["status"] in (400, 401, 403, 422):
                self._record(f"malformed_{name}", True,
                             f"Correctly rejected (HTTP {resp['status']})", resp["status"])
            else:
                self._record(f"malformed_{name}", False,
                             f"VULNERABILITY: Malformed token accepted (HTTP {resp['status']})!", resp["status"])

    def test_header_injection(self):
        """Test for header injection vulnerabilities."""
        print("\n[6/6] Testing header injection...")

        injections = [
            ("x_forwarded_for", {"X-Forwarded-For": "127.0.0.1"}),
            ("x_real_ip", {"X-Real-IP": "127.0.0.1"}),
            ("x_forwarded_host", {"X-Forwarded-Host": "localhost"}),
            ("host_override", {"Host": "localhost"}),
            ("x_tenant_spoof", {"X-Tenant-ID": "admin-tenant"}),
            ("x_internal_key_guess", {"X-Internal-Key": "admin"}),
        ]

        for name, headers in injections:
            resp = self._request("GET", f"{self.soulauth_url}/v1/soulauth/admin/tenants",
                                 headers=headers)

            if resp["status"] in (401, 403):
                self._record(f"header_inject_{name}", True,
                             f"Headers did not bypass auth (HTTP {resp['status']})", resp["status"])
            elif resp["status"] in (404, 405):
                self._record(f"header_inject_{name}", True,
                             f"Endpoint returned {resp['status']} (acceptable)", resp["status"])
            else:
                self._record(f"header_inject_{name}", False,
                             f"VULNERABILITY: Header injection may have bypassed auth (HTTP {resp['status']})!",
                             resp["status"])

    def run(self):
        print("=" * 60)
        print("Authentication Bypass Security Tests")
        print("=" * 60)

        self.test_no_auth()
        self.test_expired_jwt()
        self.test_none_algorithm()
        self.test_algorithm_confusion()
        self.test_malformed_tokens()
        self.test_header_injection()

        return self.get_report()

    def get_report(self):
        total = len(self.results)
        passed = sum(1 for r in self.results if r["passed"])
        failed = total - passed

        report = {
            "test_suite": "auth_bypass",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "target": self.soulauth_url,
            "summary": {
                "total": total,
                "passed": passed,
                "failed": failed,
                "pass_rate": f"{(passed / total * 100) if total else 0:.1f}%",
            },
            "overall_result": "PASS" if failed == 0 else "FAIL",
            "results": self.results,
        }

        print(f"\n{'=' * 60}")
        print(f"Results: {passed}/{total} passed ({report['summary']['pass_rate']})")
        print(f"Overall: {report['overall_result']}")
        return report


def main():
    parser = argparse.ArgumentParser(description="Test auth bypass in Tiresias")
    parser.add_argument("--target", default="192.168.12.169", help="Target IP")
    parser.add_argument("--output", default="auth_bypass.json", help="Output file")
    args = parser.parse_args()

    tester = AuthBypassTester(args.target)
    report = tester.run()

    with open(args.output, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport saved to {args.output}")


if __name__ == "__main__":
    main()
