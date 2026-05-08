"""Matrix bridge ingest endpoint for SoulWatch event forwarding.

The `apps/matrix-bridge/appservice` posts batches of Matrix events to
`/ingest/matrix` here.  Each event is normalised into the SoulWatch
event envelope and forwarded fire-and-forget downstream.

License: Apache-2.0
"""

from src.matrix_ingest.router import router

__all__ = ["router"]
