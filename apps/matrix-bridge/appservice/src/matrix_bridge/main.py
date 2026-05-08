"""Tiresias Matrix appservice — FastAPI entrypoint.

Receives Matrix events from Synapse and forwards them to SoulWatch.
Exposes the standard Matrix appservice endpoints:

  PUT /transactions/{txn_id}                 — receive event batches
  GET /_matrix/app/v1/users/{user_id}        — provisioning query
  GET /_matrix/app/v1/rooms/{room_alias}     — room alias query
  GET /healthz                               — liveness probe (always 200)
  GET /readyz                                — readiness (probes Synapse + SoulWatch)

On startup, when ``SEED_ROOMS_ON_BOOT=1``, the four canonical rooms
(``#tiresias-console``, ``#pantheon-ops``, ``#notifications``,
``#tiresias-audit``) are minted idempotently via the Synapse client/v3
API. See ``seed_rooms.py``.

PR G hardening:

* HS_TOKEN comparison uses ``hmac.compare_digest`` (constant-time).
* ``PUT /transactions/{txn_id}`` rejects bodies larger than
  ``cfg.transaction_max_bytes`` with HTTP 413.
* Events whose ``sender`` falls outside the agent / bot / primary-user
  allowlist are dropped (logged at WARNING) before reaching SoulWatch.
* Structured JSON logging with ``Authorization`` redaction is configured
  on app build via ``logging_setup.configure_logging()``.
* Liveness (``/healthz``) is split from readiness (``/readyz``).

License: Apache-2.0.
"""

from __future__ import annotations

import hmac
import logging
import re
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import httpx
from fastapi import FastAPI, Header, HTTPException, Request

from .config import AppserviceConfig
from .event_forwarder import EventForwarder
from .logging_setup import configure_logging
from .room_provisioner import RoomProvisioner
from .seed_rooms import SeedRoomBootstrap
from .synapse_admin import SynapseAdminClient
from .user_provisioner import derive_user_matrix_id

log = logging.getLogger("matrix_bridge")


# Sender allowlist — accepts the appservice bot, the primary user, and any
# agent-prefixed Matrix ID on the configured server. Compiled per-app
# instance because it depends on ``server_name``.
_SENDER_LOCALPART_ALLOWLIST = (
    "tiresias-bot",
    "user-primary",
)


def _sender_allowed(sender: str | None, server_name: str) -> bool:
    """Return True if ``sender`` is one of {bot, primary, @agent-*:server}."""
    if not sender or not isinstance(sender, str):
        return False
    # Allow well-known fixed senders.
    for localpart in _SENDER_LOCALPART_ALLOWLIST:
        if sender == f"@{localpart}:{server_name}":
            return True
    # Allow any @agent-<id>:<server_name>.
    pattern = re.compile(
        rf"^@agent-[A-Za-z0-9._\-]+:{re.escape(server_name)}$"
    )
    return bool(pattern.match(sender))


def create_app(
    config: AppserviceConfig | None = None,
    *,
    admin_client: SynapseAdminClient | None = None,
    seed_bootstrap: SeedRoomBootstrap | None = None,
    forwarder: EventForwarder | None = None,
) -> FastAPI:
    """Build a FastAPI instance.

    Tests construct an app with an injected config so they don't need to
    set HS_TOKEN/AS_TOKEN in ``os.environ``. ``admin_client``,
    ``seed_bootstrap``, and ``forwarder`` are also injectable so tests can
    run against fakes without spinning up the real container.
    """
    cfg = config or AppserviceConfig.from_env()
    configure_logging()

    fwd = forwarder if forwarder is not None else EventForwarder(
        soulwatch_url=cfg.soulwatch_url
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        owned_admin: SynapseAdminClient | None = None
        bootstrap = seed_bootstrap
        if cfg.seed_rooms_on_boot and bootstrap is None:
            owned_admin = admin_client or SynapseAdminClient(
                base_url=cfg.synapse_url,
                as_token=cfg.as_token,
            )
            primary_id = derive_user_matrix_id(
                scope="primary", sub_id=None, server_name=cfg.server_name
            )
            bot_id = f"@tiresias-bot:{cfg.server_name}"
            provisioner = RoomProvisioner(
                admin=owned_admin,
                bot_user_id=bot_id,
                primary_user_id=primary_id,
            )
            bootstrap = SeedRoomBootstrap(
                provisioner=provisioner,
                server_name=cfg.server_name,
                tenant_id=cfg.tenant_id,
            )
        if bootstrap is not None:
            log.info("running seed-room bootstrap")
            results = await bootstrap.run()
            _app.state.seed_room_results = results
        else:
            _app.state.seed_room_results = {}
        try:
            yield
        finally:
            if owned_admin is not None:
                await owned_admin.aclose()
            await fwd.aclose()

    app = FastAPI(
        title="Tiresias Matrix Appservice",
        version="0.3.0",
        lifespan=lifespan,
    )
    app.state.config = cfg
    app.state.forwarder = fwd

    expected_token = f"Bearer {cfg.hs_token}"
    expected_token_bytes = expected_token.encode("utf-8")

    def _check_hs_token(authorization: str | None) -> None:
        # Synapse may send the token via either ``Authorization: Bearer …`` or
        # the legacy ``?access_token=…`` query string. We accept the header
        # form only — query-string tokens are deprecated in MSC2832.
        if not authorization:
            raise HTTPException(status_code=403, detail="Forbidden")
        # Constant-time comparison to deny timing-side-channel attacks.
        if not hmac.compare_digest(
            authorization.encode("utf-8"), expected_token_bytes
        ):
            raise HTTPException(status_code=403, detail="Forbidden")

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        # Liveness probe — must remain trivial. Returns 200 for as long as
        # the FastAPI event loop is alive, regardless of upstream health.
        return {"status": "ok"}

    @app.get("/readyz")
    async def readyz() -> dict[str, Any]:
        """Readiness probe — checks Synapse reachability + SoulWatch HEAD.

        Returns 200 when both probes pass (or are skipped because their
        URLs aren't configured). Returns 503 with structured details on
        any probe failure so Kubernetes / Compose health-checks back off.
        """
        checks: dict[str, dict[str, Any]] = {}
        all_ok = True

        # Synapse: a quick GET against the federation version endpoint.
        # Doesn't require authentication and confirms the homeserver is
        # actually serving HTTP, not just listening.
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(
                    f"{cfg.synapse_url.rstrip('/')}/_matrix/federation/v1/version"
                )
            checks["synapse"] = {"status": "ok", "code": resp.status_code}
            if resp.status_code >= 500:
                checks["synapse"]["status"] = "degraded"
                all_ok = False
        except httpx.HTTPError as exc:
            checks["synapse"] = {"status": "down", "error": str(exc)[:200]}
            all_ok = False

        # SoulWatch: HEAD against the configured ingest URL when set.
        # When unset (PR A scaffolding) we surface that as ``skipped``
        # rather than failing readiness.
        if cfg.soulwatch_url:
            try:
                async with httpx.AsyncClient(timeout=2.0) as client:
                    resp = await client.head(cfg.soulwatch_url)
                checks["soulwatch"] = {
                    "status": "ok",
                    "code": resp.status_code,
                }
                if resp.status_code >= 500:
                    checks["soulwatch"]["status"] = "degraded"
                    all_ok = False
            except httpx.HTTPError as exc:
                checks["soulwatch"] = {"status": "down", "error": str(exc)[:200]}
                all_ok = False
        else:
            checks["soulwatch"] = {"status": "skipped", "reason": "url-unset"}

        body = {"status": "ok" if all_ok else "degraded", "checks": checks}
        if not all_ok:
            raise HTTPException(status_code=503, detail=body)
        return body

    @app.put("/transactions/{txn_id}")
    async def handle_transaction(
        txn_id: str,
        request: Request,
        authorization: str | None = Header(None),
        content_length: str | None = Header(None),
    ) -> dict[str, Any]:
        """Receive a batch of Matrix events from Synapse."""
        _check_hs_token(authorization)

        # Cheap pre-check via Content-Length — Synapse always sets it.
        # Falls through to a hard cap when Synapse omits the header.
        if content_length is not None:
            try:
                if int(content_length) > cfg.transaction_max_bytes:
                    log.warning(
                        "rejecting oversized transaction: txn=%s declared=%s cap=%s",
                        txn_id,
                        content_length,
                        cfg.transaction_max_bytes,
                    )
                    raise HTTPException(status_code=413, detail="Payload Too Large")
            except ValueError:
                # Malformed Content-Length; fall through to the hard cap.
                pass

        raw = await request.body()
        if len(raw) > cfg.transaction_max_bytes:
            log.warning(
                "rejecting oversized transaction: txn=%s actual=%s cap=%s",
                txn_id,
                len(raw),
                cfg.transaction_max_bytes,
            )
            raise HTTPException(status_code=413, detail="Payload Too Large")

        # Decode after the size check so we don't pay JSON-parse cost on
        # rejected payloads.
        try:
            import json

            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON")

        events = body.get("events", []) if isinstance(body, dict) else []

        if cfg.sender_allowlist_enabled:
            kept: list[dict[str, Any]] = []
            dropped = 0
            for event in events:
                sender = event.get("sender") if isinstance(event, dict) else None
                if _sender_allowed(sender, cfg.server_name):
                    kept.append(event)
                else:
                    dropped += 1
                    log.warning(
                        "dropping event with disallowed sender: txn=%s "
                        "event_id=%s sender=%s",
                        txn_id,
                        event.get("event_id") if isinstance(event, dict) else None,
                        sender,
                    )
            events = kept
            if dropped:
                log.info(
                    "sender-allowlist filtered events: txn=%s kept=%s dropped=%s",
                    txn_id,
                    len(kept),
                    dropped,
                )

        processed = await fwd.forward(txn_id=txn_id, events=events)
        return {"processed": processed}

    @app.get("/_matrix/app/v1/users/{user_id}")
    async def query_user(
        user_id: str, authorization: str | None = Header(None)
    ) -> dict[str, Any]:
        """Provisioning query — return 200 if the agent is registered.

        PR D will wire this to ``platform-api`` /agents/{user_id}. For now
        we return 404 for any user — Synapse will then refuse to provision
        an on-demand account, which is the safe default during scaffolding.
        """
        _check_hs_token(authorization)
        log.debug("user query: %s", user_id)
        raise HTTPException(status_code=404, detail="Not provisioned")

    @app.get("/_matrix/app/v1/rooms/{room_alias}")
    async def query_room(
        room_alias: str, authorization: str | None = Header(None)
    ) -> dict[str, Any]:
        """Room alias query — same shape as the user query."""
        _check_hs_token(authorization)
        log.debug("room query: %s", room_alias)
        raise HTTPException(status_code=404, detail="Not provisioned")

    return app


# Module-level app for production (uvicorn matrix_bridge.main:app).
# Lazy: only constructed when imported by the ASGI server, so test code can
# import the package without HS_TOKEN being present in the environment.
def _lazy_app() -> FastAPI:  # pragma: no cover — exercised by uvicorn only
    return create_app()


# uvicorn looks for ``app`` as a module attribute. Resolved on first access.
class _LazyApp:  # pragma: no cover — runtime-only
    _instance: FastAPI | None = None

    def __getattr__(self, item: str) -> Any:
        if self._instance is None:
            self._instance = _lazy_app()
        return getattr(self._instance, item)


app = _LazyApp()
