# tiresias-matrix-bridge (appservice)

FastAPI application service for the Tiresias Matrix bridge. Receives Matrix
events from Synapse via the appservice transaction API, forwards them to the
SoulWatch ingest endpoint, and exposes a stub user/room provisioning surface.

License: Apache-2.0

See `apps/matrix-bridge/README.md` (one level up) for the full bridge layout,
boot order, and Compose profile usage.
