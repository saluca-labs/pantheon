"""Matrix bridge ingest router.

Accepts Matrix events forwarded by the matrix-bridge appservice and
normalises them into SoulWatch event envelopes.  Designed to be called
service-to-service over the internal Compose network only — never
exposed publicly.

Endpoint:
    POST /ingest/matrix
        body: { "source": "matrix_appservice",
                "txn_id": "<synapse-transaction-id>",
                "event":  { ...matrix m.room.* event... } }
        auth: X-Internal-Key header (shared with SoulWatch)
        returns: { "accepted": true, "event_id": "..." }

License: Apache-2.0
"""

from __future__ import annotations

import os
import uuid as _uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/ingest", tags=["Matrix Ingest"])


class MatrixIngestRequest(BaseModel):
    """Wire shape posted by the matrix-bridge appservice."""

    source: str = Field(default="matrix_appservice")
    txn_id: str = Field(..., description="Synapse appservice transaction id")
    event: dict[str, Any] = Field(..., description="Raw Matrix event")


class MatrixIngestResponse(BaseModel):
    accepted: bool
    event_id: str
    soulwatch_envelope_kind: str


def _normalise(req: MatrixIngestRequest) -> dict[str, Any]:
    """Project a Matrix event into a SoulWatch envelope.

    Best-effort: missing fields fall back to safe defaults so a malformed
    Matrix event never crashes the ingest path.  Detection rules in
    `infrastructure/rules/rules/matrix-comms/` consume this envelope.
    """
    event = req.event or {}
    sender: str = event.get("sender", "") or ""
    sender_localpart = sender.split(":", 1)[0].lstrip("@") if sender else ""
    room_id: str = event.get("room_id", "") or ""
    event_id: str = event.get("event_id") or f"evt_{_uuid.uuid4().hex[:12]}"
    event_type: str = event.get("type", "") or ""

    sender_namespace = "agent" if sender_localpart.startswith("agent-") else (
        "user" if sender_localpart.startswith("user-") else "other"
    )

    return {
        "event_type": "matrix_event",
        "event_subtype": event_type,
        "version": "1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": req.source,
        "txn_id": req.txn_id,
        "event_id": event_id,
        "sender": sender,
        "sender_localpart": sender_localpart,
        "sender_namespace": sender_namespace,
        "room_id": room_id,
        "room_alias": event.get("room_alias", ""),
        "tenant_id": event.get("tiresias_tenant_id", ""),
        "membership": (event.get("content") or {}).get("membership"),
        "content_keys": list((event.get("content") or {}).keys()),
        "raw_size_bytes": len(str(event)),
    }


@router.post(
    "/matrix",
    response_model=MatrixIngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def ingest_matrix_event(
    req: MatrixIngestRequest,
    x_internal_key: str | None = Header(default=None),
) -> MatrixIngestResponse:
    """Accept a Matrix event from the bridge and normalise it.

    Authenticated via the same `X-Internal-Key` header SoulWatch uses for
    other internal service-to-service calls.  When the env var is unset
    (e.g. in unit tests or first-boot dev) the auth check is skipped so
    the bridge can come up before keys are minted.
    """
    expected_key = os.environ.get("INTERNAL_API_KEY") or os.environ.get(
        "SOULWATCH_INTERNAL_API_KEY"
    )
    if expected_key:
        if not x_internal_key or x_internal_key != expected_key:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="invalid X-Internal-Key",
            )

    envelope = _normalise(req)

    # Fire-and-forget downstream: structured log + (optional) SoulWatch.
    # Sigma rules in `matrix-comms/` match against this log structure.
    logger.info("matrix_ingest.event", **envelope)

    return MatrixIngestResponse(
        accepted=True,
        event_id=envelope["event_id"],
        soulwatch_envelope_kind=envelope["event_type"],
    )
