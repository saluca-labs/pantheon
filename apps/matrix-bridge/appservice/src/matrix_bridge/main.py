"""Tiresias Matrix appservice — FastAPI entrypoint.

Receives Matrix events from Synapse and forwards them to SoulWatch.
Exposes the standard Matrix appservice endpoints:

  PUT /transactions/{txn_id}                 — receive event batches
  GET /_matrix/app/v1/users/{user_id}        — provisioning query
  GET /_matrix/app/v1/rooms/{room_alias}     — room alias query
  GET /healthz                               — liveness probe

On startup, when ``SEED_ROOMS_ON_BOOT=1``, the four canonical rooms
(``#tiresias-console``, ``#pantheon-ops``, ``#notifications``,
``#tiresias-audit``) are minted idempotently via the Synapse client/v3
API. See ``seed_rooms.py``.

License: Apache-2.0.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, Header, HTTPException, Request

from .config import AppserviceConfig
from .event_forwarder import EventForwarder
from .room_provisioner import RoomProvisioner
from .seed_rooms import SeedRoomBootstrap
from .synapse_admin import SynapseAdminClient
from .user_provisioner import derive_user_matrix_id

log = logging.getLogger("matrix_bridge")


def create_app(
    config: AppserviceConfig | None = None,
    *,
    admin_client: SynapseAdminClient | None = None,
    seed_bootstrap: SeedRoomBootstrap | None = None,
) -> FastAPI:
    """Build a FastAPI instance.

    Tests construct an app with an injected config so they don't need to
    set HS_TOKEN/AS_TOKEN in ``os.environ``. ``admin_client`` and
    ``seed_bootstrap`` are also injectable so seed-room tests can run
    against a fake Synapse without spinning up the real container.
    """
    cfg = config or AppserviceConfig.from_env()
    forwarder = EventForwarder(soulwatch_url=cfg.soulwatch_url)

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

    app = FastAPI(
        title="Tiresias Matrix Appservice",
        version="0.2.0",
        lifespan=lifespan,
    )
    app.state.config = cfg
    app.state.forwarder = forwarder

    def _check_hs_token(authorization: str | None) -> None:
        # Synapse may send the token via either ``Authorization: Bearer …`` or
        # the legacy ``?access_token=…`` query string. We accept the header
        # form only — query-string tokens are deprecated in MSC2832.
        if not authorization or authorization != f"Bearer {cfg.hs_token}":
            raise HTTPException(status_code=403, detail="Forbidden")

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.put("/transactions/{txn_id}")
    async def handle_transaction(
        txn_id: str,
        request: Request,
        authorization: str | None = Header(None),
    ) -> dict[str, Any]:
        """Receive a batch of Matrix events from Synapse."""
        _check_hs_token(authorization)
        body = await request.json()
        events = body.get("events", []) if isinstance(body, dict) else []
        processed = await forwarder.forward(txn_id=txn_id, events=events)
        return {"processed": processed}

    @app.get("/_matrix/app/v1/users/{user_id}")
    async def query_user(
        user_id: str, authorization: str | None = Header(None)
    ) -> dict[str, Any]:
        """Provisioning query — return 200 if the agent is registered.

        PR D will wire this to ``platform-api`` /agents/{user_id}. For now we
        return 404 for any user — Synapse will then refuse to provision an
        on-demand account, which is the safe default during scaffolding.
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
