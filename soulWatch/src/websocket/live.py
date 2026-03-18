"""
WebSocket live anomaly/detection stream for SoulWatch.
Broadcasts real-time events to connected clients with tenant-scoped subscriptions.
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    """
    Manages WebSocket connections with tenant-scoped subscriptions.
    Clients can subscribe to specific tenant_ids or receive all events.
    """

    def __init__(self, max_connections: int = 100):
        self._max_connections = max_connections
        # All active connections: ws -> {"tenant_id": Optional[str]}
        self._connections: dict[WebSocket, dict] = {}

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    async def connect(self, websocket: WebSocket, tenant_id: Optional[str] = None) -> bool:
        """Accept a new WebSocket connection."""
        if len(self._connections) >= self._max_connections:
            await websocket.close(code=1013, reason="Max connections reached")
            return False

        await websocket.accept()
        self._connections[websocket] = {"tenant_id": tenant_id}
        logger.info(
            "ws.connected",
            tenant_id=tenant_id,
            total_connections=len(self._connections),
        )
        return True

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a disconnected WebSocket."""
        self._connections.pop(websocket, None)
        logger.info("ws.disconnected", total_connections=len(self._connections))

    async def broadcast(self, data: dict, tenant_id: Optional[str] = None) -> int:
        """
        Broadcast data to all connected clients.
        If tenant_id is provided, only send to clients subscribed to that tenant
        or clients with no tenant filter (global subscribers).
        """
        sent = 0
        disconnected = []

        for ws, meta in self._connections.items():
            # Tenant scoping: send if client has no filter OR matches tenant
            client_tenant = meta.get("tenant_id")
            if tenant_id and client_tenant and client_tenant != tenant_id:
                continue

            try:
                await ws.send_json(data)
                sent += 1
            except Exception:
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(ws)

        return sent

    async def send_heartbeat(self) -> None:
        """Send heartbeat ping to all connections."""
        disconnected = []
        for ws in self._connections:
            try:
                await ws.send_json({
                    "type": "heartbeat",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            except Exception:
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(ws)


# Module-level singleton
_manager: Optional[ConnectionManager] = None


def get_ws_manager() -> ConnectionManager:
    global _manager
    if _manager is None:
        _manager = ConnectionManager()
    return _manager


def init_ws_manager(max_connections: int = 100) -> ConnectionManager:
    global _manager
    _manager = ConnectionManager(max_connections=max_connections)
    return _manager


@router.websocket("/watch/v1/ws/live")
async def websocket_live(
    websocket: WebSocket,
    tenant_id: Optional[str] = Query(None),
):
    """
    WebSocket endpoint for live anomaly and detection streaming.
    Connect with optional ?tenant_id= to filter by tenant.
    """
    manager = get_ws_manager()
    connected = await manager.connect(websocket, tenant_id=tenant_id)
    if not connected:
        return

    try:
        # Send welcome message
        await websocket.send_json({
            "type": "connected",
            "message": "SoulWatch live stream connected",
            "tenant_filter": tenant_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # Keep connection alive - listen for client messages
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=60)
                # Handle subscription changes
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "subscribe" and "tenant_id" in msg:
                        manager._connections[websocket]["tenant_id"] = msg["tenant_id"]
                        await websocket.send_json({
                            "type": "subscribed",
                            "tenant_id": msg["tenant_id"],
                        })
                    elif msg.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except (json.JSONDecodeError, KeyError):
                    pass
            except asyncio.TimeoutError:
                # Send heartbeat on timeout
                try:
                    await websocket.send_json({
                        "type": "heartbeat",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                except Exception:
                    break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("ws.error", error=str(e))
    finally:
        manager.disconnect(websocket)
