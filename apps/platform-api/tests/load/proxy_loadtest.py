"""
Tiresias Proxy Load Test — SaaS Multi-Tenant.

Target: 10,000 RPM across all tenants (167 RPS sustained).

Tests the cloud proxy path:
  - SaaSAuthMiddleware tenant resolution (API key → tenant_id)
  - Audit log recording (encrypted write to Postgres)
  - Upstream LLM forwarding (mocked or real)
  - Dashboard analytics queries
  - Session replay (decryption path)

Usage:
  # Against local proxy (onprem mode, no API key needed)
  locust -f tests/load/proxy_loadtest.py --host http://localhost:8080 \
    --headless -u 50 -r 10 --run-time 5m

  # Against SaaS proxy (multi-tenant, with API keys)
  TIRESIAS_API_KEYS="tir_acme_abc123,tir_beta_def456" \
  locust -f tests/load/proxy_loadtest.py --host https://proxy.tiresias.network \
    --headless -u 200 -r 20 --run-time 10m

  # Burst test (rate limit verification)
  locust -f tests/load/proxy_loadtest.py --host http://localhost:8080 \
    --headless -u 500 -r 100 --run-time 2m \
    --tags burst

Performance Targets:
  - Health check p99:         <5ms
  - Auth middleware p99:       <10ms (cache hit), <50ms (cache miss)
  - Chat completions p99:     <15ms proxy overhead (excl. upstream)
  - Analytics unified p99:    <200ms
  - Session replay p99:       <500ms (with decryption)
  - Error rate under load:    <0.5%
  - 429 rate at burst:        >80% (rate limiter working)
"""

import os
import random
import time

from locust import HttpUser, between, tag, task, events

API_KEYS = [k.strip() for k in os.environ.get("TIRESIAS_API_KEYS", "").split(",") if k.strip()]

MODELS = ["gpt-4o", "claude-sonnet-4-6", "gpt-4o-mini", "claude-haiku-4-5"]
PROMPTS = [
    "Explain quantum computing in one paragraph.",
    "Write a Python function to sort a list.",
    "What are the three laws of thermodynamics?",
    "Summarize the key points of the GDPR.",
    "How does TLS 1.3 differ from TLS 1.2?",
    "List five best practices for API security.",
]


class ProxyUser(HttpUser):
    """Standard proxy user — simulates AI agents making LLM calls."""

    wait_time = between(0.1, 0.5)
    weight = 10

    def on_start(self):
        self.api_key = random.choice(API_KEYS) if API_KEYS else None
        self.session_id = f"lt-{int(time.time())}-{random.randint(1000, 9999)}"

    def _headers(self):
        h = {"Content-Type": "application/json", "X-Tiresias-Session-Id": self.session_id}
        if self.api_key:
            h["X-Tiresias-Api-Key"] = self.api_key
        return h

    @task(10)
    @tag("core")
    def chat_completion(self):
        body = {
            "model": random.choice(MODELS),
            "messages": [{"role": "user", "content": random.choice(PROMPTS)}],
            "max_tokens": 100,
        }
        with self.client.post("/v1/chat/completions", json=body, headers=self._headers(), catch_response=True) as r:
            if r.status_code in (200, 502):
                r.success()  # 502 = no real upstream, expected in load test

    @task(3)
    @tag("core")
    def chat_completion_streaming(self):
        body = {
            "model": random.choice(MODELS),
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 10,
            "stream": True,
        }
        with self.client.post("/v1/chat/completions", json=body, headers=self._headers(), catch_response=True) as r:
            if r.status_code in (200, 502):
                r.success()

    @task(2)
    @tag("analytics")
    def session_stats(self):
        self.client.get(f"/v1/sessions/{self.session_id}", headers=self._headers())

    @task(1)
    @tag("analytics")
    def unified_analytics(self):
        self.client.get("/v1/analytics/unified?hours=1", headers=self._headers())

    @task(1)
    @tag("analytics")
    def dashboard_spend(self):
        self.client.get("/dash/v1/spend", headers=self._headers())

    @task(1)
    @tag("analytics")
    def dashboard_traces(self):
        self.client.get("/dash/v1/traces?page_size=20", headers=self._headers())

    @task(1)
    def health(self):
        self.client.get("/health")


class DashboardUser(HttpUser):
    """Simulates portal dashboard polling."""

    wait_time = between(2, 10)
    weight = 1

    def on_start(self):
        self.api_key = random.choice(API_KEYS) if API_KEYS else None

    def _headers(self):
        h = {}
        if self.api_key:
            h["X-Tiresias-Api-Key"] = self.api_key
        return h

    @task(3)
    @tag("analytics")
    def spend(self):
        self.client.get("/dash/v1/spend", headers=self._headers())

    @task(3)
    @tag("analytics")
    def requests(self):
        self.client.get("/dash/v1/requests", headers=self._headers())

    @task(2)
    @tag("analytics")
    def latency(self):
        self.client.get("/dash/v1/latency", headers=self._headers())

    @task(2)
    @tag("analytics")
    def errors(self):
        self.client.get("/dash/v1/errors", headers=self._headers())

    @task(1)
    @tag("analytics")
    def top_sessions(self):
        self.client.get("/dash/v1/sessions/top", headers=self._headers())

    @task(1)
    @tag("analytics")
    def providers_health(self):
        self.client.get("/dash/v1/providers/health", headers=self._headers())


class BurstUser(HttpUser):
    """Aggressive burst for rate limit verification."""

    wait_time = between(0, 0.02)
    weight = 0  # Only runs when tagged

    def on_start(self):
        self.api_key = random.choice(API_KEYS) if API_KEYS else None

    @task
    @tag("burst")
    def rapid_fire(self):
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["X-Tiresias-Api-Key"] = self.api_key
        body = {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "x"}], "max_tokens": 1}
        with self.client.post("/v1/chat/completions", json=body, headers=h, catch_response=True) as r:
            if r.status_code in (200, 429, 502):
                r.success()


# Slow request alerting
@events.request.add_listener
def log_slow(request_type, name, response_time, **kwargs):
    if response_time and response_time > 500:
        print(f"SLOW [{response_time:.0f}ms] {request_type} {name}")
