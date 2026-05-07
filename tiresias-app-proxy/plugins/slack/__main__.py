"""Entry point: python -m plugins.slack runs the Slack plugin as an MCP stdio server."""

from __future__ import annotations

from plugins.slack.plugin import SlackPlugin

try:
    from app_proxy.sdk.mcp_adapter import run_stdio_server
except ImportError:
    # mcp_adapter not yet available — minimal stub for development/testing.
    import asyncio
    import json
    import sys

    from plugins.slack.plugin import ToolContext, ToolResult

    async def _stdio_loop(plugin: SlackPlugin) -> None:
        """Minimal JSON-RPC 2.0 stdio loop for development."""
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await asyncio.get_event_loop().connect_read_pipe(lambda: protocol, sys.stdin)

        while True:
            line = await reader.readline()
            if not line:
                break
            try:
                request = json.loads(line)
            except json.JSONDecodeError:
                continue

            req_id = request.get("id")
            method = request.get("method", "")
            params = request.get("params", {})

            if method == "tools/list":
                tools_data = [
                    {
                        "name": t.name,
                        "description": t.description,
                        "inputSchema": t.inputSchema,
                        "annotations": t.annotations,
                    }
                    for t in plugin.tools()
                ]
                response = {"jsonrpc": "2.0", "id": req_id, "result": {"tools": tools_data}}

            elif method == "tools/call":
                tool_name = params.get("name", "")
                arguments = params.get("arguments", {})
                import os
                ctx = ToolContext(
                    secrets={"SLACK_BOT_TOKEN": os.environ.get("SLACK_BOT_TOKEN", "")},
                    caller_agent_id="stdio-dev",
                    caller_tenant_id="local",
                )
                result = await plugin.call(tool_name, arguments, ctx)
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {"content": result.content, "isError": result.is_error},
                }
            else:
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32601, "message": f"Method not found: {method}"},
                }

            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()

    def run_stdio_server(plugin: SlackPlugin) -> None:  # type: ignore[misc]
        asyncio.run(_stdio_loop(plugin))


def main() -> None:
    run_stdio_server(SlackPlugin())


if __name__ == "__main__":
    main()
