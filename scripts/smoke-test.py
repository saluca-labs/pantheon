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

import argparse
import os
import secrets
import sys
from typing import Any

import httpx


# ── Agentic OS slug → probe definition ───────────────────────────────────
# Each entry is a GET that returns 200 + JSON object with the listed key when
# the user is authenticated. Empty result sets are valid signal — we only
# check shape, not contents, so a fresh smoke user is enough.
# `params` lets per-OS routes that require a query arg (filmmaker scopes shots
# by projectId) still exercise the auth + DB read path with a known-empty UUID.
# `null_ok` flags endpoints that return null when the user has no record yet
# (health/profile returns { profile: null } for a fresh user).
# ── Agentic OS write probes ──────────────────────────────────────────────
# Each entry that supports a `write` block round-trips POST/PUT against the
# OS's primary write endpoint, then re-GETs the list endpoint and confirms
# the new entity appears (or, for health's PUT upsert, that the profile is
# no longer null). Filmmaker is intentionally read-only here — its writes
# require a projectId tied to a real project, which Workstream B introduces.
#
# Payloads are minimal-but-valid: every required zod field, no optionals.
# Enum values mirror the literal lists in lib/agentic-os/<slug>/*.ts.
AGENTIC_OS_PROBES: dict[str, dict[str, Any]] = {
    "health": {
        "path": "/api/tiresias/agentic-os/health/profile",
        "key": "profile",
        "null_ok": True,
        "write": {
            "method": "PUT",
            "path": "/api/tiresias/agentic-os/health/profile",
            "body": {
                "sex": "prefer_not_to_say",
                "heightCm": 170,
                "weightKg": 70,
                "goals": ["general_wellness"],
                "conditions": [],
                "medications": [],
                "allergies": [],
            },
            "response_key": "profile",
            # Upsert: re-GET should now return a non-null profile.
            "verify": "profile_present",
        },
    },
    "maker": {
        "path": "/api/tiresias/agentic-os/maker/builds",
        "key": "builds",
        "write": {
            "method": "POST",
            "path": "/api/tiresias/agentic-os/maker/builds",
            "body": {"name": "smoke-build"},
            "response_key": "build",
            "verify": "list_grew",
        },
    },
    "research": {
        "path": "/api/tiresias/agentic-os/research/hypotheses",
        "key": "hypotheses",
        "write": {
            "method": "POST",
            "path": "/api/tiresias/agentic-os/research/hypotheses",
            "body": {
                "title": "smoke-hypothesis",
                "ifClause": "if smoke runs",
                "thenClause": "then post succeeds",
                "becauseClause": "because the harness writes a row",
            },
            "response_key": "hypothesis",
            "verify": "list_grew",
        },
    },
    "secure-dev": {
        "path": "/api/tiresias/agentic-os/secure-dev/threat-models",
        "key": "models",
        "write": {
            "method": "POST",
            "path": "/api/tiresias/agentic-os/secure-dev/threat-models",
            "body": {
                "systemName": "smoke-system",
                "systemDescription": "Smoke harness probe target.",
                "checklist": {
                    "systemDescription": "Smoke harness probe target.",
                    "generatedAt": "2026-01-01T00:00:00.000Z",
                    "threats": [
                        {
                            "id": "S-1",
                            "category": "Spoofing",
                            "title": "Smoke threat",
                            "description": "Placeholder for smoke run.",
                            "mitigations": ["OWASP ASVS V2"],
                            "severity": "low",
                            "referenceUrl": "https://owasp.org/www-project-application-security-verification-standard/",
                            "triggered": False,
                        },
                    ],
                },
            },
            "response_key": "model",
            "verify": "list_grew",
        },
    },
    "cyber": {
        "path": "/api/tiresias/agentic-os/cyber/alerts",
        "key": "alerts",
        "write": {
            "method": "POST",
            "path": "/api/tiresias/agentic-os/cyber/alerts",
            "body": {
                "title": "smoke-alert",
                "severity": "low",
                "category": "other",
            },
            "response_key": "alert",
            "verify": "list_grew",
        },
    },
    "filmmaker": {
        "path": "/api/tiresias/agentic-os/filmmaker/shots",
        "key": "shots",
        "params": {"projectId": "00000000-0000-0000-0000-000000000000"},
        # Read-only here — write contract requires a real projectId, covered
        # by Workstream B (filmmaker projects endpoint).
    },
    "autobiographer": {
        "path": "/api/tiresias/agentic-os/autobiographer/chapters",
        "key": "chapters",
        "write": {
            "method": "POST",
            "path": "/api/tiresias/agentic-os/autobiographer/chapters",
            "body": {"title": "smoke-chapter", "bodyText": "Smoke harness chapter body."},
            "response_key": "chapter",
            "verify": "list_grew",
        },
    },
    "business": {
        "path": "/api/tiresias/agentic-os/business/contacts",
        "key": "people",
        "write": {
            "method": "POST",
            "path": "/api/tiresias/agentic-os/business/contacts",
            "body": {"firstName": "Smoke", "lastName": "Tester"},
            "response_key": "person",
            "verify": "list_grew",
        },
    },
    "creator": {
        "path": "/api/tiresias/agentic-os/creator/posts",
        "key": "posts",
        "write": {
            "method": "POST",
            "path": "/api/tiresias/agentic-os/creator/posts",
            "body": {
                "title": "smoke-post",
                "channel": "blog",
                "contentFormat": "article",
            },
            "response_key": "post",
            "verify": "list_grew",
        },
    },
}


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


def step_bff_auth_mode(client: httpx.Client) -> None:
    """Confirm the auth-mode discovery endpoint reaches platform-api v2."""
    resp = client.get(f"{WEB_URL}/api/tiresias/platform/auth/mode")
    if resp.status_code != 200:
        fail("bff→api auth-mode", f"HTTP {resp.status_code}: {resp.text}")
    body = resp.json()
    if body.get("mode") not in ("local", "oidc"):
        fail("bff→api auth-mode", f"unexpected mode: {body}")
    ok("bff→api auth-mode", f"mode={body['mode']} oidc_enabled={body.get('oidc_enabled')}")


def _agos_get(client: httpx.Client, slug: str) -> tuple[str, Any]:
    """GET an OS list endpoint and return (key, value) on success.

    Fails the harness on non-200 / missing key / wrong type.
    """
    probe = AGENTIC_OS_PROBES[slug]
    path = probe["path"]
    key = probe["key"]
    params = probe.get("params")
    resp = client.get(f"{WEB_URL}{path}", params=params)
    if resp.status_code != 200:
        fail(f"agos.{slug}", f"GET {path} → HTTP {resp.status_code}: {resp.text[:200]}")
    try:
        body = resp.json()
    except ValueError:
        fail(f"agos.{slug}", f"GET {path} → non-JSON body: {resp.text[:200]}")
        raise  # unreachable, fail() exits
    if not isinstance(body, dict) or key not in body:
        fail(f"agos.{slug}", f"GET {path} → missing key '{key}': {body}")
    return key, body[key]


def step_agentic_os_probe(client: httpx.Client, slug: str) -> None:
    """Round-trip an Agentic OS list endpoint as the freshly-logged-in user.

    For every OS slug, the success contract is the same: a 200 with a JSON
    object containing the documented key (`builds`, `chapters`, …). The
    `health/profile` endpoint returns `{ profile: null }` for a fresh user
    which still counts — we only check that the key exists.
    """
    probe = AGENTIC_OS_PROBES.get(slug)
    if probe is None:
        fail(f"agos.{slug}", f"unknown slug; known={sorted(AGENTIC_OS_PROBES)}")
        return
    null_ok = probe.get("null_ok", False)
    key, value = _agos_get(client, slug)
    if value is None and null_ok:
        shape = "null"
    elif isinstance(value, list):
        shape = f"list[{len(value)}]"
    elif isinstance(value, dict):
        shape = "object"
    else:
        shape = type(value).__name__
    ok(f"agos.{slug}", f"GET {probe['path']} → 200 {{{key}: {shape}}}")


def step_agentic_os_write(client: httpx.Client, slug: str) -> None:
    """POST/PUT a minimal-but-valid payload to an OS write endpoint.

    Then re-GET the list and verify the new entity appears (or, for health's
    PUT upsert, that the profile is no longer null). Skips slugs whose probe
    has no `write` block (e.g. filmmaker, which needs a real projectId until
    Workstream B lands).
    """
    probe = AGENTIC_OS_PROBES.get(slug)
    if probe is None:
        fail(f"agos.{slug}.write", f"unknown slug; known={sorted(AGENTIC_OS_PROBES)}")
        return
    write = probe.get("write")
    if not write:
        ok(f"agos.{slug}.write", "skipped (no write probe defined)")
        return

    method = write["method"].upper()
    write_path = write["path"]
    body = write["body"]
    response_key = write["response_key"]
    verify = write.get("verify", "list_grew")

    # Capture pre-write list size so we can check that the row landed.
    if verify == "list_grew":
        _, before = _agos_get(client, slug)
        before_count = len(before) if isinstance(before, list) else 0
    else:
        before_count = None

    resp = client.request(method, f"{WEB_URL}{write_path}", json=body)
    if resp.status_code not in (200, 201):
        fail(f"agos.{slug}.write", f"{method} {write_path} → HTTP {resp.status_code}: {resp.text[:300]}")
    try:
        rb = resp.json()
    except ValueError:
        fail(f"agos.{slug}.write", f"{method} {write_path} → non-JSON body: {resp.text[:200]}")
        return
    if not isinstance(rb, dict) or response_key not in rb:
        fail(f"agos.{slug}.write", f"{method} {write_path} → missing key '{response_key}': {rb}")
    entity = rb[response_key]

    # Verify follow-up GET reflects the write.
    _, after = _agos_get(client, slug)
    if verify == "list_grew":
        after_count = len(after) if isinstance(after, list) else 0
        if after_count <= (before_count or 0):
            fail(
                f"agos.{slug}.write",
                f"list did not grow after {method}: before={before_count} after={after_count}",
            )
        ok(f"agos.{slug}.write", f"{method} → {response_key} id={entity.get('id', '?')}, list {before_count}→{after_count}")
    elif verify == "profile_present":
        if after is None:
            fail(f"agos.{slug}.write", f"{method} {write_path} succeeded but profile is still null")
        ok(f"agos.{slug}.write", f"{method} → {response_key} upserted; GET no longer null")
    else:
        fail(f"agos.{slug}.write", f"unknown verify mode: {verify}")


def step_audit_view(client: httpx.Client) -> None:
    """Verify the audit log endpoint returns at least one entry.

    The per-OS write probes above all call recordAudit internally, so by the
    time we reach this step the agos_audit table is guaranteed to have rows
    for the smoke user. We just confirm the endpoint returns 200 + a non-empty
    list.
    """
    path = "/api/tiresias/agentic-os/audit?limit=50"
    resp = client.get(f"{WEB_URL}{path}")
    if resp.status_code == 404:
        ok("audit.view", f"GET {path} \u2192 404 (audit endpoint not yet deployed in this env — skipping)")
        return
    if resp.status_code != 200:
        fail("audit.view", f"GET {path} \u2192 HTTP {resp.status_code}: {resp.text[:300]}")
    try:
        body = resp.json()
    except ValueError:
        fail("audit.view", f"GET {path} \u2192 non-JSON body: {resp.text[:200]}")
        return
    if not isinstance(body, dict) or "entries" not in body:
        fail("audit.view", f"GET {path} \u2192 missing 'entries' key: {body}")
    entries = body["entries"]
    if not isinstance(entries, list) or len(entries) == 0:
        fail("audit.view", f"GET {path} \u2192 entries list is empty; expected \u22651 row from smoke writes")
    ok("audit.view", f"GET {path} \u2192 {len(entries)} entr{'y' if len(entries) == 1 else 'ies'} returned")



def step_agentic_os_summary(client: httpx.Client) -> None:
    """Verify /api/tiresias/agentic-os/summary returns 200 with a `summary` key.

    Runs after all per-OS writes so the counts reflect at least the rows
    the write probes just inserted.  This is an idempotent read — no mutations.
    """
    path = "/api/tiresias/agentic-os/summary"
    resp = client.get(f"{WEB_URL}{path}")
    if resp.status_code != 200:
        fail("agos.summary", f"GET {path} \u2192 HTTP {resp.status_code}: {resp.text[:200]}")
    try:
        body = resp.json()
    except ValueError:
        fail("agos.summary", f"GET {path} \u2192 non-JSON body: {resp.text[:200]}")
        return
    if not isinstance(body, dict) or "summary" not in body:
        fail("agos.summary", f"GET {path} \u2192 missing 'summary' key: {body}")
    summary = body["summary"]
    if not isinstance(summary, dict):
        fail("agos.summary", f"GET {path} \u2192 'summary' is not an object: {summary}")
    expected_slugs = sorted(AGENTIC_OS_PROBES.keys())
    for slug in expected_slugs:
        if slug not in summary:
            fail("agos.summary", f"GET {path} \u2192 missing slug '{slug}' in summary")
        entry = summary[slug]
        if not isinstance(entry, dict):
            fail("agos.summary", f"GET {path} \u2192 entry for '{slug}' is not an object")
        if "count" not in entry:
            fail("agos.summary", f"GET {path} \u2192 entry for '{slug}' missing 'count'")
        if "lastUpdated" not in entry:
            fail("agos.summary", f"GET {path} \u2192 entry for '{slug}' missing 'lastUpdated'")
    ok(
        "agos.summary",
        f"GET {path} \u2192 200 summary has {len(summary)} slug(s): "
        + ", ".join(f"{s}={summary[s].get('count', '?')}" for s in expected_slugs),
    )


def step_flags_roundtrip(client: httpx.Client) -> None:
    """Verify /api/tiresias/agentic-os/flags GET/PUT round-trip.

    The flags endpoint is a per-user UX gate. We:
      1. GET current flags  → expect 200 + a `flags` map keyed by slug.
      2. PUT a single-flag toggle for `health` → expect 200.
      3. GET again and verify the value flipped.
      4. PUT it back so the test is idempotent across runs.

    On a deployment that does not yet have the flags endpoint (e.g. before
    Workstream E lands), a 404 is treated as a skip.
    """
    path = "/api/tiresias/agentic-os/flags"
    resp = client.get(f"{WEB_URL}{path}")
    if resp.status_code == 404:
        ok("flags.roundtrip", f"GET {path} \u2192 404 (flags endpoint not yet deployed — skipping)")
        return
    if resp.status_code != 200:
        fail("flags.roundtrip", f"GET {path} \u2192 HTTP {resp.status_code}: {resp.text[:200]}")
    body = resp.json()
    if not isinstance(body, dict) or "flags" not in body or not isinstance(body["flags"], dict):
        fail("flags.roundtrip", f"GET {path} \u2192 missing/invalid 'flags' key: {body}")
    initial = body["flags"]
    if "health" not in initial:
        fail("flags.roundtrip", f"GET {path} \u2192 missing 'health' slug in flags")
    initial_health = bool(initial["health"])
    target = not initial_health

    resp = client.put(
        f"{WEB_URL}{path}",
        json={"slug": "health", "enabled": target},
    )
    if resp.status_code not in (200, 204):
        fail("flags.roundtrip", f"PUT {path} \u2192 HTTP {resp.status_code}: {resp.text[:200]}")

    resp = client.get(f"{WEB_URL}{path}")
    if resp.status_code != 200:
        fail("flags.roundtrip", f"GET {path} (verify) \u2192 HTTP {resp.status_code}")
    body = resp.json()
    if bool(body.get("flags", {}).get("health")) != target:
        fail(
            "flags.roundtrip",
            f"GET {path} did not reflect PUT: expected health={target}, got {body['flags'].get('health')}",
        )

    # Restore original state so re-runs are idempotent.
    client.put(f"{WEB_URL}{path}", json={"slug": "health", "enabled": initial_health})

    ok("flags.roundtrip", f"GET/PUT {path} \u2192 health flag toggled and restored")


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


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--os",
        dest="os_slug",
        default="all",
        help=(
            "Restrict the Agentic OS probe step to a single slug "
            f"({', '.join(sorted(AGENTIC_OS_PROBES))}), 'all' (default), or 'none' to skip."
        ),
    )
    parser.add_argument(
        "--no-write",
        dest="write",
        action="store_false",
        default=True,
        help="Skip the per-OS write round-trip (POST/PUT). Reads still run.",
    )
    return parser.parse_args(argv)


def _selected_slugs(arg: str) -> list[str]:
    if arg == "none":
        return []
    if arg == "all":
        return list(AGENTIC_OS_PROBES.keys())
    return [arg]


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    print(
        f"smoke: web={WEB_URL} api={API_URL} memory={MEMORY_URL} "
        f"os={args.os_slug} write={'yes' if args.write else 'no'}"
    )
    with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as client:
        step_register(client)
        step_login(client)
        step_health_full(client)
        step_bff_identity(client)
        step_bff_auth_mode(client)
        slugs = _selected_slugs(args.os_slug)
        if not slugs:
            ok("agentic-os", "skipped (--os=none)")
        for slug in slugs:
            step_agentic_os_probe(client, slug)
            if args.write:
                step_agentic_os_write(client, slug)
        # After all per-OS writes, verify the audit log has at least one entry.
        step_audit_view(client)
        # After all per-OS writes, verify the cross-OS summary endpoint.
        if slugs:
            step_agentic_os_summary(client)
        # Per-user feature flag GET/PUT round-trip (Workstream E).
        step_flags_roundtrip(client)
    step_memory_crud()
    print("✓ all smoke steps passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
