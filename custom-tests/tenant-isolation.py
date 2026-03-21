#!/usr/bin/env python3
"""
Tenant Isolation Security Tests for Tiresias SoulAuth.

Creates two tenants, provisions soulkeys for each, and verifies that
cross-tenant data access is properly denied.

Usage:
    python3 tenant-isolation.py --target 192.168.12.169 --output tenant_isolation.json
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone


class TenantIsolationTester:
    def __init__(self, target, internal_key=None):
        self.base_url = f"http://{target}:8000"
        self.gate_url = f"http://{target}:8002"
        self.internal_key = internal_key or "pentest-internal-key"
        self.results = []
        self.tenant_a = None
        self.tenant_b = None
        self.key_a = None
        self.key_b = None

    def _request(self, method, url, data=None, headers=None, expect_status=None):
        """Make an HTTP request and return response info."""
        hdrs = {"Content-Type": "application/json"}
        if headers:
            hdrs.update(headers)

        body = json.dumps(data).encode() if data else None
        req = urllib.request.Request(url, data=body, headers=hdrs, method=method)

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp_body = resp.read().decode()
                return {
                    "status": resp.status,
                    "body": json.loads(resp_body) if resp_body else {},
                    "error": None,
                }
        except urllib.error.HTTPError as e:
            resp_body = e.read().decode() if e.fp else ""
            return {
                "status": e.code,
                "body": json.loads(resp_body) if resp_body else {},
                "error": e.reason,
            }
        except Exception as e:
            return {"status": 0, "body": {}, "error": str(e)}

    def _record(self, test_name, passed, details, response=None):
        """Record a test result."""
        self.results.append({
            "test": test_name,
            "passed": passed,
            "details": details,
            "response_status": response.get("status") if response else None,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {test_name}: {details}")

    def provision_tenants(self):
        """Create two test tenants via SaaS provisioning."""
        print("\n[1/5] Provisioning test tenants...")

        for label in ["A", "B"]:
            tenant_name = f"pentest-tenant-{label.lower()}-{int(time.time())}"
            resp = self._request("POST", f"{self.base_url}/v1/saas/provision", {
                "tenant_name": tenant_name,
                "admin_email": f"pentest-{label.lower()}@tiresias.test",
                "plan": "trial",
            }, headers={"X-Internal-Key": self.internal_key})

            if resp["status"] in (200, 201):
                tenant_id = resp["body"].get("tenant_id")
                if label == "A":
                    self.tenant_a = {"id": tenant_id, "name": tenant_name}
                else:
                    self.tenant_b = {"id": tenant_id, "name": tenant_name}
                self._record(f"provision_tenant_{label}", True,
                             f"Tenant {tenant_name} created: {tenant_id}", resp)
            else:
                self._record(f"provision_tenant_{label}", False,
                             f"Failed to create tenant: {resp['error']}", resp)
                return False

        return self.tenant_a is not None and self.tenant_b is not None

    def issue_soulkeys(self):
        """Issue soulkeys for each tenant."""
        print("\n[2/5] Issuing soulkeys...")

        for label, tenant in [("A", self.tenant_a), ("B", self.tenant_b)]:
            if not tenant:
                continue

            resp = self._request("POST", f"{self.base_url}/v1/soulauth/admin/soulkeys", {
                "tenant_id": tenant["id"],
                "name": f"pentest-key-{label.lower()}",
                "scopes": ["read", "write"],
            }, headers={"X-Internal-Key": self.internal_key})

            if resp["status"] in (200, 201):
                key = resp["body"].get("soulkey") or resp["body"].get("key")
                if label == "A":
                    self.key_a = key
                else:
                    self.key_b = key
                self._record(f"issue_soulkey_{label}", True,
                             f"Soulkey issued for tenant {label}", resp)
            else:
                self._record(f"issue_soulkey_{label}", False,
                             f"Failed to issue soulkey: {resp['error']}", resp)
                return False

        return self.key_a is not None and self.key_b is not None

    def test_cross_tenant_read(self):
        """Attempt to read tenant A's data using tenant B's soulkey."""
        print("\n[3/5] Testing cross-tenant read isolation...")

        if not self.tenant_a or not self.key_b:
            self._record("cross_tenant_read", False, "Missing tenant/key setup")
            return

        endpoints = [
            f"/v1/soulauth/admin/tenants/{self.tenant_a['id']}",
            f"/v1/soulauth/admin/soulkeys?tenant_id={self.tenant_a['id']}",
            f"/v1/soulauth/admin/audit?tenant_id={self.tenant_a['id']}",
        ]

        for endpoint in endpoints:
            resp = self._request("GET", f"{self.base_url}{endpoint}", headers={
                "Authorization": f"Bearer {self.key_b}",
                "X-Tenant-ID": self.tenant_a["id"],
            })

            if resp["status"] in (401, 403, 404):
                self._record(f"cross_read_{endpoint.split('/')[-1]}", True,
                             f"Correctly denied (HTTP {resp['status']})", resp)
            else:
                self._record(f"cross_read_{endpoint.split('/')[-1]}", False,
                             f"VULNERABILITY: Got HTTP {resp['status']} — cross-tenant access!", resp)

    def test_cross_tenant_write(self):
        """Attempt to write to tenant A using tenant B's soulkey."""
        print("\n[4/5] Testing cross-tenant write isolation...")

        if not self.tenant_a or not self.key_b:
            self._record("cross_tenant_write", False, "Missing tenant/key setup")
            return

        resp = self._request("POST", f"{self.base_url}/v1/soulauth/admin/soulkeys", {
            "tenant_id": self.tenant_a["id"],
            "name": "cross-tenant-attack-key",
            "scopes": ["read", "write", "admin"],
        }, headers={"Authorization": f"Bearer {self.key_b}"})

        if resp["status"] in (401, 403):
            self._record("cross_tenant_write_soulkey", True,
                         f"Correctly denied soulkey creation (HTTP {resp['status']})", resp)
        else:
            self._record("cross_tenant_write_soulkey", False,
                         f"VULNERABILITY: Cross-tenant soulkey creation returned HTTP {resp['status']}!", resp)

        resp = self._request("PUT", f"{self.base_url}/v1/soulauth/admin/tenants/{self.tenant_a['id']}", {
            "plan": "enterprise",
        }, headers={"Authorization": f"Bearer {self.key_b}"})

        if resp["status"] in (401, 403, 405):
            self._record("cross_tenant_modify", True,
                         f"Correctly denied tenant modification (HTTP {resp['status']})", resp)
        else:
            self._record("cross_tenant_modify", False,
                         f"VULNERABILITY: Cross-tenant modification returned HTTP {resp['status']}!", resp)

    def test_soulgate_isolation(self):
        """Test tenant isolation through SoulGate."""
        print("\n[5/5] Testing SoulGate tenant isolation...")

        if not self.tenant_a or not self.key_b:
            self._record("soulgate_isolation", False, "Missing tenant/key setup")
            return

        resp = self._request("POST", f"{self.gate_url}/v1/gate/route", {
            "tenant_id": self.tenant_a["id"],
            "action": "list_keys",
        }, headers={"Authorization": f"Bearer {self.key_b}"})

        if resp["status"] in (401, 403):
            self._record("soulgate_cross_tenant", True,
                         f"SoulGate correctly denied cross-tenant routing (HTTP {resp['status']})", resp)
        else:
            self._record("soulgate_cross_tenant", False,
                         f"VULNERABILITY: SoulGate cross-tenant routing returned HTTP {resp['status']}!", resp)

    def cleanup(self):
        """Remove test tenants."""
        print("\nCleaning up test tenants...")
        for tenant in [self.tenant_a, self.tenant_b]:
            if tenant:
                self._request("DELETE",
                              f"{self.base_url}/v1/soulauth/admin/tenants/{tenant['id']}",
                              headers={"X-Internal-Key": self.internal_key})

    def run(self):
        """Run all tenant isolation tests."""
        print("=" * 60)
        print("Tenant Isolation Security Tests")
        print("=" * 60)

        try:
            if not self.provision_tenants():
                print("\nERROR: Could not provision tenants. Aborting.")
                return self.get_report()

            if not self.issue_soulkeys():
                print("\nERROR: Could not issue soulkeys. Aborting.")
                return self.get_report()

            self.test_cross_tenant_read()
            self.test_cross_tenant_write()
            self.test_soulgate_isolation()
        finally:
            self.cleanup()

        return self.get_report()

    def get_report(self):
        total = len(self.results)
        passed = sum(1 for r in self.results if r["passed"])
        failed = total - passed

        report = {
            "test_suite": "tenant_isolation",
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
    parser = argparse.ArgumentParser(description="Test tenant isolation in Tiresias")
    parser.add_argument("--target", default="192.168.12.169", help="Target IP")
    parser.add_argument("--internal-key", default=None, help="Internal API key")
    parser.add_argument("--output", default="tenant_isolation.json", help="Output file")
    args = parser.parse_args()

    internal_key = args.internal_key or os.environ.get("PENTEST_INTERNAL_API_KEY", "pentest-internal-key")

    tester = TenantIsolationTester(args.target, internal_key)
    report = tester.run()

    with open(args.output, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport saved to {args.output}")


if __name__ == "__main__":
    main()
