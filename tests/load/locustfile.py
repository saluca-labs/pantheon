"""
Tiresias Load Testing - Locust scenarios.

Performance targets:
  - PDP evaluation p50:    <20ms
  - PDP evaluation p99:    <100ms
  - Identity resolution p99: <50ms
  - Sustained throughput:  1000 req/s
  - Error rate under load: <0.1%
  - Memory under load:     <512MB
  - DB connections:        <50

Run plan:
  1. Single instance, 100 users, 5 min warmup + 10 min sustained
  2. Scale to 500 users, measure degradation
  3. 3-replica K8s, 1000 users, 10 min sustained
  4. Identify bottleneck (DB? CPU? memory?)

Usage:
  locust -f tests/load/locustfile.py --host=http://localhost:8000
"""

import os
import json

from locust import HttpUser, task, between, events


# Pre-provisioned SoulKey for load testing.
# Set LOAD_TEST_SOULKEY env var or create one via:
#   POST /v1/soulauth/admin/keys {"tenant_id": "...", "persona_id": "loadtest"}
SOULKEY = os.environ.get("LOAD_TEST_SOULKEY", "sk_agent_tst_loadtest_placeholder")

# Pre-provisioned tenant ID for the load test agent
TENANT_ID = os.environ.get("LOAD_TEST_TENANT_ID", "11111111-1111-1111-1111-111111111111")


class TiresiasUser(HttpUser):
    """
    Simulates a typical Tiresias API consumer.

    Task weights reflect real-world usage patterns:
      - PDP evaluation (10x) - the hot path, called on every agent action
      - Identity resolution (5x) - called on agent bootstrap and session refresh
      - Whoami (2x) - called for self-inspection and health checks
      - Health check (1x) - called by load balancers and monitoring
    """

    wait_time = between(0.1, 0.5)

    def on_start(self):
        """Set up headers used across requests."""
        self.auth_headers = {"X-Soulkey": SOULKEY}

    @task(10)
    def evaluate_access(self):
        """
        PDP evaluation - the hot path.

        This is the most critical endpoint for performance. Every agent
        action goes through PDP evaluation to get a capability token.
        Target: p50 <20ms, p99 <100ms.
        """
        self.client.post(
            "/v1/auth/evaluate",
            json={
                "resource": "memory",
                "action": "read",
                "scope": "cs:algorithms",
                "context": {"node": "ai-lab"},
            },
            headers=self.auth_headers,
            name="/v1/auth/evaluate",
        )

    @task(5)
    def resolve_identity(self):
        """
        Identity resolution - called on agent bootstrap.

        Resolves a SoulKey hash to the agent's persona and tenant.
        Target: p99 <50ms.
        """
        self.client.get(
            "/v1/auth/identity",
            headers=self.auth_headers,
            name="/v1/auth/identity",
        )

    @task(2)
    def whoami(self):
        """
        Agent self-inspection - includes policy summary.

        Slightly heavier than identity resolution because it also
        loads the cached policy to build a permissions summary.
        """
        self.client.get(
            "/v1/auth/whoami",
            headers=self.auth_headers,
            name="/v1/auth/whoami",
        )

    @task(1)
    def health_check(self):
        """
        Health check - lightweight probe.

        Used by load balancers, K8s probes, and monitoring.
        Should always be fast (<10ms).
        """
        self.client.get("/health", name="/health")


class TiresiasAdminUser(HttpUser):
    """
    Simulates admin API usage (lower frequency).

    Admin operations are less frequent but should not block
    or degrade the hot path.
    """

    wait_time = between(1.0, 5.0)
    weight = 1  # 1 admin per 10 regular users

    def on_start(self):
        self.auth_headers = {"X-Soulkey": SOULKEY}

    @task(3)
    def list_keys(self):
        """List SoulKeys for a tenant."""
        self.client.get(
            "/v1/soulauth/admin/keys",
            params={"tenant_id": TENANT_ID},
            headers=self.auth_headers,
            name="/v1/soulauth/admin/keys [list]",
        )

    @task(2)
    def audit_report(self):
        """Query audit log."""
        self.client.get(
            "/v1/soulauth/admin/audit/report",
            params={"tenant_id": TENANT_ID, "limit": 50},
            headers=self.auth_headers,
            name="/v1/soulauth/admin/audit/report",
        )

    @task(1)
    def list_tenants(self):
        """List all tenants."""
        self.client.get(
            "/v1/soulauth/admin/tenants",
            headers=self.auth_headers,
            name="/v1/soulauth/admin/tenants",
        )


class TiresiasWriteUser(HttpUser):
    """
    Simulates write-heavy operations (PDP evaluations with varied scopes).

    Tests cache effectiveness by varying scope patterns.
    """

    wait_time = between(0.2, 1.0)
    weight = 2

    _scope_idx = 0
    _scopes = [
        "cs:algorithms",
        "cs:data-structures",
        "math:linear-algebra",
        "math:statistics",
        "infra:deployment",
        "infra:monitoring",
        "vault:credentials",
        "mesh:ssh",
    ]

    def on_start(self):
        self.auth_headers = {"X-Soulkey": SOULKEY}

    @task
    def evaluate_varied_scopes(self):
        """PDP evaluation with rotating scope patterns."""
        scope = self._scopes[TiresiasWriteUser._scope_idx % len(self._scopes)]
        TiresiasWriteUser._scope_idx += 1

        self.client.post(
            "/v1/auth/evaluate",
            json={
                "resource": "memory",
                "action": "read",
                "scope": scope,
            },
            headers=self.auth_headers,
            name="/v1/auth/evaluate [varied]",
        )
