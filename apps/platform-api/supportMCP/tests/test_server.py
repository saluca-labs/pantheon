import uuid

import pytest
from fastapi.testclient import TestClient

from supportMCP.src.core.server import app


@pytest.fixture
def client():
    return TestClient(app)


def _sk() -> str:
    return f"sk_agent_{uuid.uuid4().hex}_abc_deadbeef"


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["tools"] == 7


def test_initialize(client):
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "initialize"})
    assert r.status_code == 200
    data = r.json()
    assert data["result"]["serverInfo"]["name"] == "tiresias-support-mcp"


def test_tools_list_returns_seven(client):
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    assert r.status_code == 200
    tools = r.json()["result"]["tools"]
    assert len(tools) == 7
    names = {t["name"] for t in tools}
    assert names == {
        "search_kb",
        "query_logs",
        "trace_replay",
        "get_policy",
        "check_quarantine",
        "get_usage",
        "decrypt_content",
    }


def test_tools_call_rejects_missing_soulkey(client):
    r = client.post(
        "/mcp",
        json={
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "search_kb", "arguments": {"query": "hello"}},
        },
    )
    data = r.json()
    assert "error" in data
    assert "tenant scope" in data["error"]["message"]


def test_tools_call_search_kb_with_soulkey(client):
    r = client.post(
        "/mcp",
        headers={"Authorization": f"Bearer {_sk()}"},
        json={
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {"name": "search_kb", "arguments": {"query": "hello"}},
        },
    )
    data = r.json()
    assert "result" in data
    payload = data["result"]["content"][0]["json"]
    assert payload["backend_pending"] is True


def test_tools_call_decrypt_returns_stub(client):
    r = client.post(
        "/mcp",
        headers={"Authorization": f"Bearer {_sk()}"},
        json={
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {"name": "decrypt_content", "arguments": {"audit_row_id": "x"}},
        },
    )
    payload = r.json()["result"]["content"][0]["json"]
    assert payload["error"] == "not_implemented"
    assert payload["eta"] == "G.1_after_tier4"


def test_unknown_tool_returns_error(client):
    r = client.post(
        "/mcp",
        headers={"Authorization": f"Bearer {_sk()}"},
        json={
            "jsonrpc": "2.0",
            "id": 6,
            "method": "tools/call",
            "params": {"name": "no_such_tool", "arguments": {}},
        },
    )
    assert "error" in r.json()
