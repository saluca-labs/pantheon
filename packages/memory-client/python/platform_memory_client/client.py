"""Async HTTP client for @platform/memory-service."""

from __future__ import annotations

import os
from typing import Any, Optional, Sequence

import httpx
from pydantic import BaseModel, ConfigDict


class MemoryClientError(RuntimeError):
    """Raised when the memory service returns an error response."""


class Memory(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    content: str
    topics: list[str] = []
    created_at: Optional[str] = None


def _default_url() -> str:
    return os.environ.get("MEMORY_SERVICE_URL", "http://memory-service:8910")


def _default_key() -> str:
    return os.environ.get("MEMORY_SERVICE_KEY", "")


class MemoryClient:
    """Async client for the platform memory HTTP sidecar.

    Usage:
        mem = MemoryClient.from_env()
        await mem.remember("...", topics=["..."])
        hits = await mem.recall("topic", limit=5)
    """

    def __init__(
        self,
        base_url: str,
        api_key: str = "",
        *,
        timeout: float = 5.0,
        client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._client = client

    @classmethod
    def from_env(cls) -> "MemoryClient":
        return cls(_default_url(), _default_key())

    async def __aenter__(self) -> "MemoryClient":
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _headers(self) -> dict[str, str]:
        return {"X-Memory-Service-Key": self._api_key} if self._api_key else {}

    async def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=self._timeout,
                headers=self._headers(),
            )
        return self._client

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        client = await self._http()
        resp = await client.request(method, path, **kwargs)
        if resp.status_code >= 400:
            raise MemoryClientError(
                f"{method} {path} -> {resp.status_code}: {resp.text}"
            )
        if resp.headers.get("content-type", "").startswith("application/json"):
            return resp.json()
        return resp.text

    # ---- public API (mirrors @platform/memory) ----

    async def remember(
        self,
        content: str,
        *,
        topics: Optional[Sequence[str]] = None,
    ) -> Memory:
        body: dict[str, Any] = {"content": content}
        if topics is not None:
            body["topics"] = list(topics)
        data = await self._request("POST", "/v1/memories", json=body)
        return Memory.model_validate(data)

    async def list(self, limit: int = 20, offset: int = 0) -> list[Memory]:
        data = await self._request(
            "GET", "/v1/memories", params={"limit": limit, "offset": offset}
        )
        return [Memory.model_validate(m) for m in data]

    async def recall(self, topic: str, *, limit: int = 10) -> list[Memory]:
        data = await self._request(
            "GET",
            "/v1/memories/recall",
            params={"topic": topic, "limit": limit},
        )
        return [Memory.model_validate(m) for m in data]

    async def search(self, q: str, *, limit: int = 10) -> list[Memory]:
        data = await self._request(
            "GET",
            "/v1/memories/search",
            params={"q": q, "limit": limit},
        )
        return [Memory.model_validate(m) for m in data]

    async def forget(self, memory_id: int) -> bool:
        data = await self._request("DELETE", f"/v1/memories/{memory_id}")
        return bool(data.get("deleted", False))

    async def health(self) -> dict[str, Any]:
        return await self._request("GET", "/health/ready")
