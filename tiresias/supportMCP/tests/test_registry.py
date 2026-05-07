from supportMCP.src.core.registry import TOOLS, get_tool, list_tools


def test_seven_tools_registered():
    names = [t.name for t in TOOLS]
    assert names == [
        "search_kb",
        "query_logs",
        "trace_replay",
        "get_policy",
        "check_quarantine",
        "get_usage",
        "decrypt_content",
    ]
    assert len(TOOLS) == 7


def test_only_decrypt_is_stubbed():
    stubbed = [t.name for t in TOOLS if t.stubbed]
    assert stubbed == ["decrypt_content"]


def test_list_tools_payload_shape():
    payload = list_tools()
    assert len(payload) == 7
    for entry in payload:
        assert "name" in entry
        assert "description" in entry
        assert "inputSchema" in entry
        assert "stubbed" in entry


def test_get_tool_lookup():
    assert get_tool("search_kb") is not None
    assert get_tool("does_not_exist") is None
