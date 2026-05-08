"""Tests for the platform-sovereign FastAPI app entrypoint."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure both the package src/ and the parent apps/platform-sovereign are on path.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src"))

from src.main import create_app  # noqa: E402


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


def test_health_live(client):
    res = client.get("/health/live")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_health_ready_after_startup(client):
    res = client.get("/health/ready")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ready"
    assert body["principles_count"] >= 0


def test_list_principles_returns_count_and_array(client):
    res = client.get("/v1/principles")
    assert res.status_code == 200
    body = res.json()
    assert "count" in body
    assert "principles" in body
    assert isinstance(body["principles"], list)
    assert body["count"] == len(body["principles"])


def test_cascade_route_echo_provider(client):
    res = client.post("/v1/route", json={"payload": {"prompt": "hello"}})
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "echo"
    assert body["request"] == {"prompt": "hello"}


def test_cascade_route_default_payload(client):
    res = client.post("/v1/route", json={})
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "echo"
    assert body["request"] == {}
