"""Mock MCP server — stdio JSON-RPC 2.0 plugin for end-to-end tests.

Reads one JSON-RPC request per line from stdin, writes one JSON-RPC
response per line to stdout.  Handles: initialize, tools/list, tools/call.
"""

from __future__ import annotations

import json
import sys


def _make_response(req_id: int | str | None, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _make_error(req_id: int | str | None, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "message": {"type": "string"},
    },
    "required": ["message"],
}


def handle_request(request: dict) -> dict:
    req_id = request.get("id")
    method = request.get("method", "")
    params = request.get("params", {})

    if method == "initialize":
        return _make_response(req_id, {
            "protocolVersion": "1.0",
            "serverInfo": {"name": "mock-plugin"},
            "capabilities": {"tools": {"listChanged": False}},
        })

    if method == "tools/list":
        return _make_response(req_id, {
            "tools": [
                {
                    "name": "echo",
                    "description": "Echo input back",
                    "inputSchema": TOOL_SCHEMA,
                }
            ],
        })

    if method == "tools/call":
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})
        if tool_name == "echo":
            return _make_response(req_id, {
                "content": [
                    {"type": "text", "text": arguments.get("message", "")},
                ],
            })
        return _make_error(req_id, -32602, f"Unknown tool: {tool_name}")

    return _make_error(req_id, -32601, f"Method not found: {method}")


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            response = _make_error(None, -32700, "Parse error")
        else:
            response = handle_request(request)

        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
