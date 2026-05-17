"""
smoke_test.py — Offline smoke test for soul-service wiring.

Runs without Docker. Verifies:
  1. The vendored `soul` package imports cleanly.
  2. The Pantheon wrapper (`pantheon_entry`) imports and bolts the auth
     middleware + /health/live + /health/ready surfaces onto the upstream
     FastAPI app.
  3. /health/live and /health/ready return 200 without an auth header.
  4. A non-health request with no key (dev mode) is allowed.
  5. A non-health request without a key in production mode is rejected
     with 401 by the middleware before reaching the handler.
  6. The hashing layer round-trips a SHA-256 dual hash (smoke test for
     the vendored crypto core — proves the scrubbing did not break it).

Run from repo root:
    python apps/soul-service/scripts/smoke_test.py

CI usage:
    Once Docker is available (GitHub runners), replace this with the full
    `docker build && docker run && curl /health/live` cycle documented in
    apps/soul-service/README.md.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Add apps/soul-service/ to sys.path so `pantheon_entry` and `soul.*` resolve.
HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))


def step(label: str) -> None:
    print(f"  [{label}]", flush=True)


def fail(label: str, detail: str) -> None:
    print(f"  FAIL {label}: {detail}", file=sys.stderr, flush=True)
    sys.exit(1)


def main() -> None:
    print("-- soul-service smoke test --")

    # Make sure we're booting in dev mode (no SOUL_SERVICE_KEY required).
    os.environ.pop("SOUL_ENV", None)
    os.environ.pop("SOUL_SERVICE_KEY", None)

    step("import soul package")
    import soul  # noqa: F401
    from soul import hashing  # noqa: E402

    step("import pantheon_entry (dev mode, no key)")
    import pantheon_entry  # noqa: E402

    step("verify FastAPI app exposes /health/live + /health/ready")
    routes = {r.path for r in pantheon_entry.app.router.routes}
    for p in ("/health", "/health/live", "/health/ready"):
        if p not in routes:
            fail("routes", f"missing {p}; got {sorted(routes)}")

    step("starlette TestClient probe — /health/live (dev, no key)")
    try:
        from starlette.testclient import TestClient
    except ImportError:
        print("  SKIP starlette not installed; install fastapi to run this leg")
        return

    # raise_server_exceptions=False — we deliberately exercise endpoints
    # that fail without external dependencies (Supabase, Anthropic). We only
    # care that the middleware contract holds; handler-level 500s prove the
    # request reached the application, which is the auth contract.
    client = TestClient(pantheon_entry.app, raise_server_exceptions=False)
    r = client.get("/health/live")
    if r.status_code != 200:
        fail("/health/live", f"status={r.status_code} body={r.text!r}")
    if r.json() != {"status": "ok"}:
        fail("/health/live", f"body={r.json()!r}")

    r = client.get("/health/ready")
    if r.status_code != 200:
        fail("/health/ready", f"status={r.status_code}")

    step("dev-mode bypass -- POST /tkhr/lookup with no key not 401'd")
    # We do NOT assert 200 here: tkhr.lookup hits the Supabase cold tier and
    # raises RuntimeError without credentials configured (expected in this
    # offline smoke). What we ARE asserting is the middleware did not block
    # the request with 401 in dev mode — any 500 from the handler proves
    # the request reached the application, which is the auth contract.
    r = client.post("/tkhr/lookup", json={"topics": ["smoke-test"]})
    if r.status_code == 401:
        fail("/tkhr/lookup dev", f"middleware blocked dev call: {r.text!r}")

    step("hashing layer round-trip (verifies vendor scrub did not break crypto)")
    h1 = hashing.content_hash("hello-soul")
    h2 = hashing.content_hash("hello-soul")
    if h1 != h2 or len(h1) != 64:
        fail("content_hash", f"h1={h1!r} h2={h2!r}")

    step("reload pantheon_entry in production mode WITHOUT key — must exit(1)")
    # Re-importing pantheon_entry under production mode without a key should
    # call sys.exit(1). We use subprocess to isolate the failing import.
    import subprocess
    proc = subprocess.run(
        [sys.executable, "-c", "import pantheon_entry"],
        env={
            **os.environ,
            "SOUL_ENV": "production",
            "SOUL_SERVICE_KEY": "",
            "PYTHONPATH": str(HERE) + os.pathsep + os.environ.get("PYTHONPATH", ""),
        },
        capture_output=True,
        text=True,
    )
    if proc.returncode == 0:
        fail("prod-no-key boot", "expected non-zero exit; got 0")
    if "SOUL_SERVICE_KEY is required" not in proc.stderr:
        fail("prod-no-key boot", f"missing error message; stderr={proc.stderr!r}")

    step("reload pantheon_entry in production mode WITH key — must boot, enforce")
    # Subprocess-import again with a key set, then call the endpoint without
    # the header and confirm 401.
    # We only assert on the contract the middleware controls:
    #   - /health/live must be 200 without a key
    #   - non-health without a key must be 401
    #   - non-health with the correct key must NOT be 401 (handler is
    #     allowed to fail with 500 against the unwired cold tier — that
    #     just proves the request got past the auth gate)
    probe = """
import os, sys
sys.path.insert(0, %r)
import pantheon_entry
from starlette.testclient import TestClient
c = TestClient(pantheon_entry.app, raise_server_exceptions=False)
r1 = c.get('/health/live')
r2 = c.post('/tkhr/lookup', json={'topics':['x']})
r3 = c.post('/tkhr/lookup', json={'topics':['x']}, headers={'X-Soul-Service-Key':'shh-its-a-secret'})
print('live=', r1.status_code, 'noauth=', r2.status_code, 'auth_not_401=', r3.status_code != 401)
""" % str(HERE)
    proc = subprocess.run(
        [sys.executable, "-c", probe],
        env={
            **os.environ,
            "SOUL_ENV": "production",
            "SOUL_SERVICE_KEY": "shh-its-a-secret",
            "PYTHONPATH": str(HERE) + os.pathsep + os.environ.get("PYTHONPATH", ""),
        },
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        fail("prod-with-key boot", f"exit={proc.returncode} stderr={proc.stderr!r}")
    expected = "live= 200 noauth= 401 auth_not_401= True"
    if expected not in proc.stdout:
        fail("prod auth enforcement", f"expected substring {expected!r} in stdout={proc.stdout!r}")

    print("OK — soul-service smoke test passed")


if __name__ == "__main__":
    main()
