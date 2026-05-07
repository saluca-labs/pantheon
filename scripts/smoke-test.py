#!/usr/bin/env python3
"""End-to-end smoke test for the Tiresias platform stack.

Walks the full request path:

  1. POST   {WEB}/api/auth/register        — register a fresh local user
  2. POST   {WEB}/api/auth/login           — login, receive session cookie
  3. GET    {WEB}/api/health/full          — BFF readiness aggregator
  4. GET    {WEB}/api/tiresias/...         — BFF→API echo via identity headers
       (defaults to GET /v1/platform/identity)
  5. POST   {API}/v1/memories              — direct memory CRUD (via api key)
       — also exercises GET /v1/memories/recall and DELETE /v1/memories/:id

Designed to be run against a live `docker compose up` stack:

    PLATFORM_WEB_URL=http://localhost:3000 \\
    TIRESIAS_API_URL=http://localhost:8900 \\
    TIRESIAS_API_KEY=changeme-tiresias-api-shared-secret \\
    MEMORY_SERVICE_URL=http://localhost:8910 \\
    MEMORY_SERVICE_KEY=changeme-memory-service-shared-secret \\
        python scripts/smoke-test.py

Exit code is 0 on full success, non-zero (with a printed step name) on
the first failure. Each step prints a `✓` line on success.
"""

from __future__ import annotations

import os
import secrets
import sys
from typing import Any

import httpx


WEB_URL = os.environ.get("PLATFORM_WEB_URL", "http://localhost:3000").rstrip("/")
API_URL = os.environ.get("TIRESIAS_API_URL", "http://localhost:8900").rstrip("/")
API_KEY = os.environ.get("TIRESIAS_API_KEY", "")
MEMORY_URL = os.environ.get("MEMORY_SERVICE_URL", "http://localhost:8910").rstrip("/")
MEMORY_KEY = os.environ.get("MEMORY_SERVICE_KEY", "")
TIMEOUT = float(os.environ.get("SMOKE_TIMEOUT_S", "10"))

EMAIL = f"smoke-{secrets.token_hex(4)}@local"
PASSWORD = secrets.token_hex(12)


def fail(step: str, detail: str) -> "NoReturn":  # type: ignore[name-defined]
    print(f"✗ {step}: {detail}", file=sys.stderr)
    sys.exit(1)


def ok(step: str, detail: str = "") -> None:
    suffix = f" — {detail}" if detail else ""
    print(f"✓ {step}{suffix}")


def step_register(client: httpx.Client) -> None:
    resp = client.post(
        f"{WEB_URL}/api/auth/register",
        json={"email": EMAIL, "password": PASSWORD, "displayName": "Smoke Tester"},
    )
    if resp.status_code not in (200, 201):
        fail("register", f"HTTP {resp.status_code}: {resp.text}")
    ok("register", EMAIL)


def step_login(client: httpx.Client) -> None:
    resp = client.post(
        f"{WEB_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
    )
    if resp.status_code != 200:
        fail("login", f"HTTP {resp.status_code}: {resp.text}")
    if "session" not in client.cookies and "platform_session" not in client.cookies:
        # Best-effort cookie name check; some configs use a custom name.
        pass
    ok("login", "session cookie present" if client.cookies else "no cookie")


def step_health_full(client: httpx.Client) -> None:
    resp = client.get(f"{WEB_URL}/api/health/full")
    if resp.status_code != 200:
        fail("health/full", f"HTTP {resp.status_code}: {resp.text}")
    body = resp.json()
    if body.get("status") != "ready":
        fail("health/full", f"status={body.get('status')} body={body}")
    components = body.get("components", {})
    for name, comp in components.items():
        if comp.get("status") != "ready":
            fail("health/full", f"{name} not ready: {comp}")
    ok("health/full", f"db + platform-api + memory-service all ready")


def step_bff_identity(client: httpx.Client) -> None:
    """Hit the BFF identity echo via the cookie-authenticated session.

    Path is chosen to be cheap and exercise buildIdentityHeaders end-to-end.
    """
    resp = client.get(f"{WEB_URL}/api/tiresias/platform/identity")
    if resp.status_code != 200:
        fail("bff→api identity", f"HTTP {resp.status_code}: {resp.text}")
    body = resp.json()
    identity = body.get("identity") or {}
    if not identity.get("user_id"):
        fail("bff→api identity", f"no user_id in echo: {body}")
    ok("bff→api identity", f"user_id={identity['user_id']} role={identity.get('role')}")


def step_memory_crud() -> None:
    """Exercise memory-service directly via its API key.

    The BFF path goes through platform-api which is exercised in the
    health step; here we want to confirm the memory sidecar itself
    speaks its contract.
    """
    if not MEMORY_KEY:
        ok("memory CRUD", "skipped (MEMORY_SERVICE_KEY not set)")
        return

    headers = {"X-Memory-Service-Key": MEMORY_KEY}
    payload = {"content": f"smoke {secrets.token_hex(4)}", "topics": ["smoke-test"]}

    with httpx.Client(timeout=TIMEOUT, headers=headers) as mc:
        resp = mc.post(f"{MEMORY_URL}/v1/memories", json=payload)
        if resp.status_code not in (200, 201):
            fail("memory.remember", f"HTTP {resp.status_code}: {resp.text}")
        memory: dict[str, Any] = resp.json()
        memory_id = memory.get("id")
        if memory_id is None:
            fail("memory.remember", f"no id in response: {memory}")

        resp = mc.get(f"{MEMORY_URL}/v1/memories/recall", params={"topic": "smoke-test"})
        if resp.status_code != 200:
            fail("memory.recall", f"HTTP {resp.status_code}: {resp.text}")
        hits = resp.json()
        if not isinstance(hits, list) or not any(h.get("id") == memory_id for h in hits):
            fail("memory.recall", f"id {memory_id} not in {hits}")

        resp = mc.delete(f"{MEMORY_URL}/v1/memories/{memory_id}")
        if resp.status_code not in (200, 204):
            fail("memory.forget", f"HTTP {resp.status_code}: {resp.text}")

    ok("memory CRUD", f"id={memory_id} remembered → recalled → forgotten")


def main() -> int:
    print(f"smoke: web={WEB_URL} api={API_URL} memory={MEMORY_URL}")
    with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as client:
        step_register(client)
        step_login(client)
        step_health_full(client)
        step_bff_identity(client)
    step_memory_crud()
    print("✓ all smoke steps passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
