#!/usr/bin/env python3
"""
JWT Confusion and Token Security Tests for Tiresias SoulAuth.

Tests for JWT-specific vulnerabilities:
- Key confusion attacks (EC/RSA/HMAC swaps)
- JWK injection via header
- kid path traversal
- Token reuse and replay
- Claim manipulation

Usage:
    python3 jwt-confusion.py --target 192.168.12.169 --output jwt_confusion.json
"""

import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone


class JWTConfusionTester:
    def __init__(self, target):
        self.base_url = f"http://{target}:8000"
        self.results = []

    def _b64url_encode(self, data):
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    def _make_jwt(self, header, payload, signature=b""):
        h = self._b64url_encode(json.dumps(header).encode())
        p = self._b64url_encode(json.dumps(payload).encode())
        s = self._b64url_encode(signature) if signature else ""
        return f"{h}.{p}.{s}"

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

    def _record(self, test, passed, details, status=0):
        self.results.append({
            "test": test,
            "passed": passed,
            "details": details,
            "response_status": status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        indicator = "PASS" if passed else "FAIL"
        print(f"  [{indicator}] {test}: {details}")

    def _test_token(self, test_name, token, expect_reject=True):
        resp = self._request("GET", f"{self.base_url}/v1/soulauth/admin/tenants", headers={
            "Authorization": f"Bearer {token}",
        })

        if expect_reject:
            if resp["status"] in (401, 403):
                self._record(test_name, True,
                             f"Correctly rejected (HTTP {resp['status']})", resp["status"])
            elif resp["status"] in (404, 405):
                self._record(test_name, True,
                             f"Endpoint returned {resp['status']} (acceptable)", resp["status"])
            else:
                self._record(test_name, False,
                             f"VULNERABILITY: Token accepted (HTTP {resp['status']})!", resp["status"])
        return resp

    def test_algorithm_none(self):
        """Test alg:none variants."""
        print("\n[1/8] Testing alg:none variants...")

        none_variants = ["none", "None", "NONE", "nOnE", "noNe"]
        payload = {
            "sub": "admin", "tenant_id": "root",
            "iat": int(time.time()), "exp": int(time.time()) + 3600,
            "scopes": ["admin"],
        }

        for alg in none_variants:
            token = self._make_jwt({"alg": alg, "typ": "JWT"}, payload)
            self._test_token(f"alg_none_{alg}", token)

    def test_algorithm_swap(self):
        """Test algorithm confusion: ES256 -> HS256 with various secrets."""
        print("\n[2/8] Testing algorithm swap (ES256->HS256)...")

        payload = {
            "sub": "admin", "tenant_id": "root",
            "iat": int(time.time()), "exp": int(time.time()) + 3600,
            "scopes": ["admin"],
        }

        secrets = [b"", b"secret", b"tiresias", b"soulauth"]

        for i, secret in enumerate(secrets):
            header = {"alg": "HS256", "typ": "JWT"}
            h = self._b64url_encode(json.dumps(header).encode())
            p = self._b64url_encode(json.dumps(payload).encode())
            sig_input = f"{h}.{p}".encode()
            sig = self._b64url_encode(hmac.new(secret, sig_input, hashlib.sha256).digest())
            token = f"{h}.{p}.{sig}"
            self._test_token(f"hs256_swap_{i}", token)

        for alg, hash_fn in [("HS384", hashlib.sha384), ("HS512", hashlib.sha512)]:
            header = {"alg": alg, "typ": "JWT"}
            h = self._b64url_encode(json.dumps(header).encode())
            p = self._b64url_encode(json.dumps(payload).encode())
            sig_input = f"{h}.{p}".encode()
            sig = self._b64url_encode(hmac.new(b"", sig_input, hash_fn).digest())
            token = f"{h}.{p}.{sig}"
            self._test_token(f"alg_swap_{alg.lower()}", token)

    def test_jwk_injection(self):
        """Test JWK injection via JWT header."""
        print("\n[3/8] Testing JWK injection in header...")

        fake_jwk = {
            "kty": "EC", "crv": "P-256",
            "x": self._b64url_encode(os.urandom(32)),
            "y": self._b64url_encode(os.urandom(32)),
            "d": self._b64url_encode(os.urandom(32)),
        }

        payload = {
            "sub": "admin", "tenant_id": "root",
            "iat": int(time.time()), "exp": int(time.time()) + 3600,
            "scopes": ["admin"],
        }

        token = self._make_jwt(
            {"alg": "ES256", "typ": "JWT", "jwk": fake_jwk},
            payload, os.urandom(64))
        self._test_token("jwk_header_injection", token)

        token = self._make_jwt(
            {"alg": "ES256", "typ": "JWT", "jku": "https://evil.example.com/.well-known/jwks.json"},
            payload, os.urandom(64))
        self._test_token("jku_header_injection", token)

        token = self._make_jwt(
            {"alg": "RS256", "typ": "JWT", "x5u": "https://evil.example.com/cert.pem"},
            payload, os.urandom(64))
        self._test_token("x5u_header_injection", token)

    def test_kid_traversal(self):
        """Test kid (Key ID) path traversal."""
        print("\n[4/8] Testing kid path traversal...")

        payload = {
            "sub": "admin", "tenant_id": "root",
            "iat": int(time.time()), "exp": int(time.time()) + 3600,
            "scopes": ["admin"],
        }

        traversal_kids = [
            "../../../etc/passwd",
            "../../dev/null",
            "/dev/null",
            "../../../../proc/self/environ",
            "key' UNION SELECT 'secret' --",
            "key\x00.pem",
            "..\\..\\..\\windows\\win.ini",
        ]

        for kid in traversal_kids:
            safe_name = kid.replace("/", "_").replace("\\", "_").replace("'", "")[:30]
            header = {"alg": "HS256", "typ": "JWT", "kid": kid}
            h = self._b64url_encode(json.dumps(header).encode())
            p = self._b64url_encode(json.dumps(payload).encode())
            sig_input = f"{h}.{p}".encode()
            sig = self._b64url_encode(hmac.new(b"", sig_input, hashlib.sha256).digest())
            token = f"{h}.{p}.{sig}"
            self._test_token(f"kid_traversal_{safe_name}", token)

    def test_claim_manipulation(self):
        """Test claim manipulation attacks."""
        print("\n[5/8] Testing claim manipulation...")

        base_payload = {
            "sub": "user",
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
        }

        manipulations = [
            ("role_escalation", {**base_payload, "role": "admin", "scopes": ["admin", "superadmin"]}),
            ("tenant_wildcard", {**base_payload, "tenant_id": "*"}),
            ("negative_exp", {**base_payload, "exp": -1}),
            ("huge_exp", {**base_payload, "exp": int(time.time()) + 315360000}),
            ("nbf_future", {**base_payload, "nbf": int(time.time()) + 86400}),
            ("iss_spoof", {**base_payload, "iss": "tiresias-soulauth"}),
            ("aud_mismatch", {**base_payload, "aud": "different-service"}),
            ("extra_claims", {**base_payload, "admin": True, "is_internal": True, "bypass_auth": True}),
        ]

        for name, payload in manipulations:
            token = self._make_jwt({"alg": "ES256", "typ": "JWT"}, payload, os.urandom(64))
            self._test_token(f"claim_{name}", token)

    def test_token_structure(self):
        """Test malformed JWT structures."""
        print("\n[6/8] Testing malformed JWT structures...")

        malformed = [
            ("empty_string", ""),
            ("single_dot", "a.b"),
            ("four_parts", "a.b.c.d"),
            ("no_dots", "abcdefghijklmnop"),
            ("only_dots", "..."),
            ("invalid_base64", "!!!.@@@.###"),
            ("empty_parts", ".."),
            ("huge_header", self._b64url_encode(b"A" * 100000) + ".e30."),
            ("null_in_parts", self._b64url_encode(b'\x00{"alg":"none"}') + ".e30."),
        ]

        for name, token in malformed:
            self._test_token(f"structure_{name}", token)

    def test_replay(self):
        """Test token replay scenarios."""
        print("\n[7/8] Testing token replay scenarios...")

        payload = {
            "sub": "pentest",
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
            "scopes": ["read"],
            "intended_endpoint": "/v1/soulauth/health",
        }

        token = self._make_jwt({"alg": "ES256", "typ": "JWT"}, payload, os.urandom(64))

        endpoints = [
            "/v1/soulauth/admin/tenants",
            "/v1/soulauth/admin/soulkeys",
            "/v1/soulauth/admin/config",
        ]

        for ep in endpoints:
            resp = self._request("GET", f"{self.base_url}{ep}", headers={
                "Authorization": f"Bearer {token}",
            })
            if resp["status"] in (401, 403, 404, 405):
                self._record(f"replay_{ep.split('/')[-1]}", True,
                             f"Correctly rejected (HTTP {resp['status']})", resp["status"])
            else:
                self._record(f"replay_{ep.split('/')[-1]}", False,
                             f"VULNERABILITY: Forged token accepted (HTTP {resp['status']})!", resp["status"])

    def test_token_in_params(self):
        """Test if tokens are accepted via query parameters or body."""
        print("\n[8/8] Testing token acceptance vectors...")

        fake_token = self._make_jwt(
            {"alg": "ES256", "typ": "JWT"},
            {"sub": "admin", "scopes": ["admin"], "exp": int(time.time()) + 3600},
            os.urandom(64),
        )

        resp = self._request("GET",
                             f"{self.base_url}/v1/soulauth/admin/tenants?token={fake_token}")
        if resp["status"] in (401, 403, 404):
            self._record("token_in_query", True,
                         f"Query param token rejected/ignored (HTTP {resp['status']})", resp["status"])
        elif resp["status"] == 200:
            self._record("token_in_query", False,
                         "VULNERABILITY: Token accepted via query parameter!", resp["status"])
        else:
            self._record("token_in_query", True,
                         f"Response: HTTP {resp['status']} (acceptable)", resp["status"])

        resp = self._request("GET", f"{self.base_url}/v1/soulauth/admin/tenants", headers={
            "Cookie": f"token={fake_token}; session={fake_token}",
        })
        if resp["status"] in (401, 403, 404):
            self._record("token_in_cookie", True,
                         f"Cookie token rejected/ignored (HTTP {resp['status']})", resp["status"])
        elif resp["status"] == 200:
            self._record("token_in_cookie", False,
                         "VULNERABILITY: Token accepted via cookie!", resp["status"])
        else:
            self._record("token_in_cookie", True,
                         f"Response: HTTP {resp['status']} (acceptable)", resp["status"])

    def run(self):
        print("=" * 60)
        print("JWT Confusion & Token Security Tests")
        print("=" * 60)

        self.test_algorithm_none()
        self.test_algorithm_swap()
        self.test_jwk_injection()
        self.test_kid_traversal()
        self.test_claim_manipulation()
        self.test_token_structure()
        self.test_replay()
        self.test_token_in_params()

        return self.get_report()

    def get_report(self):
        total = len(self.results)
        passed = sum(1 for r in self.results if r["passed"])
        failed = total - passed

        report = {
            "test_suite": "jwt_confusion",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "target": self.base_url,
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
    parser = argparse.ArgumentParser(description="JWT confusion tests for Tiresias")
    parser.add_argument("--target", default="192.168.12.169", help="Target IP")
    parser.add_argument("--output", default="jwt_confusion.json", help="Output file")
    args = parser.parse_args()

    tester = JWTConfusionTester(args.target)
    report = tester.run()

    with open(args.output, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport saved to {args.output}")


if __name__ == "__main__":
    main()
