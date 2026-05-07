"""
SoulAuth CLI — command-line interface for SoulAuth operations.

Usage::

    # Enterprise mode (existing commands)
    soulauth health
    soulauth register --tenant-id UUID --agent-id alfred --type orchestrator
    soulauth token request --soulkey KEY --resource memory --action read --scope "*"
    soulauth token validate --soulkey KEY
    soulauth audit --tenant-id UUID --limit 50
    soulauth policy test --soulkey KEY --action read --resource memory

    # Local (ID) mode — zero-config for independent developers
    soulauth init           # One-command setup + start
    soulauth dev            # Start local dev server
    soulauth playground     # Interactive agent REPL
    soulauth status         # Show local instance status
"""

import asyncio
import json
import os
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import click

from src.sdk.client import SoulAuthClient
from src.sdk.exceptions import SoulAuthError


def _run(coro):
    """Run an async coroutine from sync click context."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def _format_output(data: dict, fmt: str) -> str:
    """Format output as JSON or table."""
    if fmt == "json":
        return json.dumps(data, indent=2, default=str)

    # Table format: key-value pairs
    lines = []
    max_key_len = max((len(str(k)) for k in data), default=0)
    for key, value in data.items():
        if isinstance(value, dict):
            lines.append(f"  {key:<{max_key_len}}  {json.dumps(value, default=str)}")
        elif isinstance(value, list):
            lines.append(f"  {key:<{max_key_len}}  {', '.join(str(v) for v in value)}")
        else:
            lines.append(f"  {key:<{max_key_len}}  {value}")
    return "\n".join(lines)


def _format_list(items: list[dict], fmt: str) -> str:
    """Format a list of items as JSON or table."""
    if fmt == "json":
        return json.dumps(items, indent=2, default=str)

    if not items:
        return "  (no results)"

    # Table: show each item separated by a line
    lines = []
    for i, item in enumerate(items):
        if i > 0:
            lines.append("  ---")
        for key, value in item.items():
            lines.append(f"  {key}: {value}")
    return "\n".join(lines)


def _print_result(data, fmt: str):
    """Print formatted output."""
    if isinstance(data, dict):
        click.echo(_format_output(data, fmt))
    elif isinstance(data, list):
        click.echo(_format_list(data, fmt))
    else:
        click.echo(data)


def _is_port_open(port: int, host: str = "127.0.0.1") -> bool:
    """Check if a port is open (server running)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            return s.connect_ex((host, port)) == 0
    except Exception:
        return False


# ──────────────────────────────────────────────────────────────────────
# Main CLI group
# ──────────────────────────────────────────────────────────────────────

@click.group()
@click.option("--url", default="http://localhost:8000", envvar="SOULAUTH_URL",
              help="SoulAuth service URL (default: http://localhost:8000)")
@click.option("--format", "fmt", type=click.Choice(["json", "table"]), default="table",
              help="Output format (default: table)")
@click.option("--api-key", default=None, envvar="SOULAUTH_API_KEY",
              help="API key for authentication")
@click.pass_context
def cli(ctx, url: str, fmt: str, api_key: Optional[str]):
    """SoulAuth CLI — agent identity and zero-trust authorization."""
    ctx.ensure_object(dict)
    ctx.obj["url"] = url
    ctx.obj["fmt"] = fmt
    ctx.obj["api_key"] = api_key


# ──────────────────────────────────────────────────────────────────────
# Enterprise commands (existing)
# ──────────────────────────────────────────────────────────────────────

@cli.command()
@click.pass_context
def health(ctx):
    """Check the SoulAuth service health."""
    async def _health():
        async with SoulAuthClient(ctx.obj["url"], api_key=ctx.obj["api_key"]) as client:
            result = await client.get_health()
            return result.model_dump()

    try:
        data = _run(_health())
        _print_result(data, ctx.obj["fmt"])
    except SoulAuthError as e:
        click.echo(f"Error: {e.message}", err=True)
        sys.exit(1)


@cli.command()
@click.option("--tenant-id", required=True, help="Tenant UUID")
@click.option("--agent-id", required=True, help="Agent persona identifier")
@click.option("--type", "agent_type", default="agent", help="Agent type (default: agent)")
@click.option("--label", default=None, help="Human-readable label")
@click.pass_context
def register(ctx, tenant_id: str, agent_id: str, agent_type: str, label: Optional[str]):
    """Register an agent and receive a soulkey."""
    async def _register():
        async with SoulAuthClient(ctx.obj["url"], api_key=ctx.obj["api_key"]) as client:
            result = await client.register_agent(
                tenant_id=tenant_id,
                agent_id=agent_id,
                agent_type=agent_type,
                label=label,
            )
            return result.model_dump()

    try:
        data = _run(_register())
        _print_result(data, ctx.obj["fmt"])
        if ctx.obj["fmt"] == "table":
            click.echo("\n  WARNING: Save the raw_key above. It will not be shown again.")
    except SoulAuthError as e:
        click.echo(f"Error: {e.message}", err=True)
        sys.exit(1)


@cli.group()
def token():
    """Token management commands."""
    pass


@token.command("request")
@click.option("--soulkey", required=True, envvar="SOULAUTH_SOULKEY",
              help="Raw soulkey for authentication")
@click.option("--resource", required=True, help="Target resource (e.g. memory, vault)")
@click.option("--action", required=True, help="Requested action (e.g. read, write)")
@click.option("--scope", default="*", help="Scope string (default: *)")
@click.pass_context
def token_request(ctx, soulkey: str, resource: str, action: str, scope: str):
    """Request a capability token via PDP evaluation."""
    async def _request():
        async with SoulAuthClient(ctx.obj["url"], api_key=ctx.obj["api_key"]) as client:
            result = await client.request_token(
                soulkey=soulkey,
                resource=resource,
                action=action,
                scope=scope,
            )
            return result.model_dump()

    try:
        data = _run(_request())
        _print_result(data, ctx.obj["fmt"])
    except SoulAuthError as e:
        click.echo(f"Error: {e.message}", err=True)
        sys.exit(1)


@token.command("validate")
@click.option("--soulkey", required=True, envvar="SOULAUTH_SOULKEY",
              help="Soulkey to validate")
@click.pass_context
def token_validate(ctx, soulkey: str):
    """Validate a soulkey by resolving its identity."""
    async def _validate():
        async with SoulAuthClient(ctx.obj["url"], api_key=ctx.obj["api_key"]) as client:
            result = await client.resolve_identity(soulkey=soulkey)
            return result.model_dump()

    try:
        data = _run(_validate())
        _print_result(data, ctx.obj["fmt"])
    except SoulAuthError as e:
        click.echo(f"Error: {e.message}", err=True)
        sys.exit(1)


@cli.command()
@click.option("--tenant-id", required=True, help="Tenant UUID")
@click.option("--event-type", default=None, help="Filter by event type")
@click.option("--persona-id", default=None, help="Filter by persona")
@click.option("--limit", default=100, type=int, help="Max events (default: 100)")
@click.pass_context
def audit(ctx, tenant_id: str, event_type: Optional[str], persona_id: Optional[str], limit: int):
    """Query the audit log."""
    async def _audit():
        async with SoulAuthClient(ctx.obj["url"], api_key=ctx.obj["api_key"]) as client:
            result = await client.list_audit_events(
                tenant_id=tenant_id,
                event_type=event_type,
                persona_id=persona_id,
                limit=limit,
            )
            return result.model_dump()

    try:
        data = _run(_audit())
        if ctx.obj["fmt"] == "json":
            click.echo(json.dumps(data, indent=2, default=str))
        else:
            click.echo(f"  Tenant: {data['tenant_id']}")
            click.echo(f"  Count:  {data['count']}")
            click.echo()
            _print_result(data.get("events", []), ctx.obj["fmt"])
    except SoulAuthError as e:
        click.echo(f"Error: {e.message}", err=True)
        sys.exit(1)


@cli.group()
def policy():
    """Policy management commands."""
    pass


@policy.command("test")
@click.option("--soulkey", required=True, envvar="SOULAUTH_SOULKEY",
              help="Raw soulkey for authentication")
@click.option("--action", required=True, help="Action to test (e.g. read, write)")
@click.option("--resource", required=True, help="Resource to test (e.g. memory, vault)")
@click.option("--scope", default="*", help="Scope string (default: *)")
@click.pass_context
def policy_test(ctx, soulkey: str, action: str, resource: str, scope: str):
    """Test policy evaluation — check if an action would be allowed."""
    async def _test():
        async with SoulAuthClient(ctx.obj["url"], api_key=ctx.obj["api_key"]) as client:
            result = await client.evaluate_access(
                soulkey=soulkey,
                action=action,
                resource=resource,
                scope=scope,
            )
            return result.model_dump()

    try:
        data = _run(_test())
        _print_result(data, ctx.obj["fmt"])

        if ctx.obj["fmt"] == "table":
            decision = data.get("decision", "").upper()
            if decision == "GRANT":
                click.echo("\n  Result: ACCESS GRANTED")
            else:
                click.echo(f"\n  Result: ACCESS DENIED — {data.get('reason', 'no reason')}")
    except SoulAuthError as e:
        click.echo(f"Error: {e.message}", err=True)
        sys.exit(1)


@cli.command()
@click.option("--soulkey", required=True, envvar="SOULAUTH_SOULKEY",
              help="Raw soulkey to inspect")
@click.pass_context
def whoami(ctx, soulkey: str):
    """Inspect agent identity and permissions."""
    async def _whoami():
        async with SoulAuthClient(ctx.obj["url"], api_key=ctx.obj["api_key"]) as client:
            result = await client.whoami(soulkey=soulkey)
            return result.model_dump()

    try:
        data = _run(_whoami())
        _print_result(data, ctx.obj["fmt"])
    except SoulAuthError as e:
        click.echo(f"Error: {e.message}", err=True)
        sys.exit(1)


# ──────────────────────────────────────────────────────────────────────
# Local (ID) mode commands
# ──────────────────────────────────────────────────────────────────────

@cli.command("init")
@click.option("--db-path", default=None, help="Custom database path (default: ~/.soulauth/soulauth.db)")
@click.option("--agent-id", default="default-agent", help="Default agent persona ID")
@click.option("--no-server", is_flag=True, help="Skip starting the server after init")
def init_local(db_path: Optional[str], agent_id: str, no_server: bool):
    """One-command local setup for independent developers.

    Creates ~/.soulauth/ with database, keys, config, and a default agent.
    Then starts the local server on port 8000.
    """
    import uuid

    click.echo()
    click.echo("  SoulAuth ID — Local Developer Setup")
    click.echo("  " + "=" * 40)
    click.echo()

    async def _init():
        from src.database.local import (
            ensure_local_setup, LOCAL_TENANT_ID, LOCAL_TENANT_SLUG,
            DEFAULT_DB_PATH, DEFAULT_KEYS_DIR, DEFAULT_POLICIES_DIR,
        )
        from src.auth.soulkey import generate_soulkey

        # Step 1: Create directory structure, DB, keys
        click.echo("  [1/5] Creating directory structure...")
        local_db = await ensure_local_setup(db_path=db_path)

        actual_path = local_db.db_path
        click.echo(f"         Database: {actual_path}")
        click.echo(f"         Keys:     {DEFAULT_KEYS_DIR}/")
        click.echo(f"         Policies: {DEFAULT_POLICIES_DIR}/")
        click.echo()

        # Step 2: Keys (already done by ensure_local_setup)
        click.echo("  [2/5] ES256 keypair ready")
        click.echo()

        # Step 3: Schema (already done)
        click.echo("  [3/5] SQLite database initialized (6 tables)")
        click.echo()

        # Step 4: Default tenant (already done)
        click.echo(f"  [4/5] Default tenant: {LOCAL_TENANT_SLUG}")
        click.echo()

        # Step 5: Register default agent
        click.echo(f"  [5/5] Registering default agent: {agent_id}")
        raw_key, key_hash = generate_soulkey(LOCAL_TENANT_SLUG, agent_id)

        now = datetime.now(timezone.utc).isoformat()
        soulkey_id = str(uuid.uuid4())

        async with local_db.engine.begin() as conn:
            await conn.exec_driver_sql(
                """INSERT OR IGNORE INTO _soulkeys
                   (id, tenant_id, persona_id, key_hash, label, status, issued_at, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    soulkey_id,
                    str(LOCAL_TENANT_ID),
                    agent_id,
                    key_hash,
                    f"Default agent ({agent_id})",
                    "active",
                    now,
                    "{}",
                ),
            )

        click.echo()
        click.echo("  " + "=" * 40)
        click.echo("  You're ready!")
        click.echo("  " + "=" * 40)
        click.echo()
        click.echo(f"  Your soulkey (save this — shown once):")
        click.echo(f"  {raw_key}")
        click.echo()
        click.echo("  Quick start:")
        click.echo(f"    export SOULAUTH_SOULKEY=\"{raw_key}\"")
        click.echo("    export SOULAUTH_MODE=local")
        click.echo("    soulauth dev              # Start server")
        click.echo("    soulauth playground        # Interactive REPL")
        click.echo("    soulauth status            # Check status")
        click.echo()

        await local_db.close()
        return raw_key

    try:
        raw_key = _run(_init())

        if not no_server:
            click.echo("  Starting local server on http://127.0.0.1:8000 ...")
            click.echo("  Press Ctrl+C to stop.")
            click.echo()
            os.environ["SOULAUTH_MODE"] = "local"
            if db_path:
                os.environ["SOULAUTH_LOCAL_DB_PATH"] = db_path
            _start_local_server()
    except KeyboardInterrupt:
        click.echo("\n  Server stopped.")
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@cli.command("dev")
@click.option("--port", default=8000, type=int, help="Port to bind (default: 8000)")
@click.option("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
@click.option("--reload", "auto_reload", is_flag=True, default=True, help="Auto-reload on changes")
def dev_server(port: int, host: str, auto_reload: bool):
    """Start SoulAuth in local dev mode.

    Runs on localhost with pretty console output.
    """
    os.environ["SOULAUTH_MODE"] = "local"
    os.environ["SOULAUTH_DEBUG"] = "true"
    os.environ["SOULAUTH_HOST"] = host
    os.environ["SOULAUTH_PORT"] = str(port)

    click.echo()
    click.echo("  SoulAuth Dev Server (local mode)")
    click.echo("  " + "-" * 35)

    # Show local info
    from src.database.local import SOULAUTH_HOME, DEFAULT_DB_PATH
    click.echo(f"  Database:  {DEFAULT_DB_PATH}")
    click.echo(f"  Config:    {SOULAUTH_HOME / 'config.yml'}")
    click.echo(f"  Server:    http://{host}:{port}")
    click.echo(f"  Docs:      http://{host}:{port}/docs")
    click.echo()

    try:
        _start_local_server(host=host, port=port, reload=auto_reload)
    except KeyboardInterrupt:
        click.echo("\n  Server stopped.")


@cli.command("status")
@click.pass_context
def status(ctx):
    """Show local instance status."""
    from src.database.local import DEFAULT_DB_PATH, DEFAULT_KEYS_DIR, DEFAULT_POLICIES_DIR, SOULAUTH_HOME

    click.echo()
    click.echo("  SoulAuth Local Status")
    click.echo("  " + "=" * 30)
    click.echo()

    # Database
    db_exists = DEFAULT_DB_PATH.exists()
    if db_exists:
        size_bytes = DEFAULT_DB_PATH.stat().st_size
        if size_bytes < 1024:
            size_str = f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            size_str = f"{size_bytes / 1024:.1f} KB"
        else:
            size_str = f"{size_bytes / (1024 * 1024):.1f} MB"
        click.echo(f"  Database:    {DEFAULT_DB_PATH} ({size_str})")
    else:
        click.echo(f"  Database:    Not initialized (run 'soulauth init')")
        click.echo()
        return

    # Keys
    priv_key = DEFAULT_KEYS_DIR / "private.pem"
    pub_key = DEFAULT_KEYS_DIR / "public.pem"
    click.echo(f"  Private key: {'present' if priv_key.exists() else 'MISSING'}")
    click.echo(f"  Public key:  {'present' if pub_key.exists() else 'MISSING'}")

    # Policies
    policy_files = list(DEFAULT_POLICIES_DIR.glob("*.yml")) + list(DEFAULT_POLICIES_DIR.glob("*.yaml"))
    click.echo(f"  Policies:    {len(policy_files)} loaded")

    # Query database for counts
    async def _status():
        import aiosqlite
        async with aiosqlite.connect(str(DEFAULT_DB_PATH)) as db:
            # Agents
            cursor = await db.execute("SELECT COUNT(*) FROM _soulkeys WHERE status = 'active'")
            agents = (await cursor.fetchone())[0]

            # Today's tokens (audit events of type token_issued)
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            cursor = await db.execute(
                "SELECT COUNT(*) FROM _soulauth_audit WHERE event_type = 'token_issued' AND timestamp >= ?",
                (today,),
            )
            tokens_today = (await cursor.fetchone())[0]

            # Total audit events
            cursor = await db.execute("SELECT COUNT(*) FROM _soulauth_audit")
            total_events = (await cursor.fetchone())[0]

            return agents, tokens_today, total_events

    try:
        agents, tokens_today, total_events = _run(_status())
        click.echo(f"  Agents:      {agents} registered")
        click.echo(f"  Tokens:      {tokens_today} issued today")
        click.echo(f"  Audit:       {total_events} total events")
    except Exception:
        click.echo("  Agents:      (unable to query)")

    # Server status
    click.echo()
    server_running = _is_port_open(8000)
    click.echo(f"  Server:      {'RUNNING on :8000' if server_running else 'not running'}")
    click.echo()


@cli.command("playground")
def playground():
    """Interactive agent REPL for local development.

    Register agents, request tokens, test policies, and view the audit trail.
    """
    os.environ["SOULAUTH_MODE"] = "local"

    click.echo()
    click.echo("  SoulAuth Playground (local mode)")
    click.echo("  " + "-" * 35)
    click.echo("  Commands: register, evaluate, tokens, audit, policies, status, help, quit")
    click.echo()

    from src.database.local import DEFAULT_DB_PATH, LOCAL_TENANT_ID

    if not DEFAULT_DB_PATH.exists():
        click.echo("  Not initialized. Run 'soulauth init' first.")
        return

    while True:
        try:
            raw = input("  soulauth> ").strip()
        except (EOFError, KeyboardInterrupt):
            click.echo("\n  Goodbye.")
            break

        if not raw:
            continue

        parts = raw.split()
        cmd = parts[0].lower()

        if cmd in ("quit", "exit", "q"):
            click.echo("  Goodbye.")
            break

        elif cmd == "help":
            click.echo("  Commands:")
            click.echo("    register <persona_id>           Register a new agent")
            click.echo("    evaluate <soulkey> <resource> <action>  Evaluate access")
            click.echo("    tokens <soulkey> <resource> <action>    Request a token")
            click.echo("    audit [limit]                   Show recent audit events")
            click.echo("    policies                        List loaded policies")
            click.echo("    agents                          List registered agents")
            click.echo("    status                          Show status")
            click.echo("    quit                            Exit playground")

        elif cmd == "register":
            if len(parts) < 2:
                click.echo("  Usage: register <persona_id>")
                continue
            persona_id = parts[1]
            _run(_playground_register(persona_id))

        elif cmd == "evaluate":
            if len(parts) < 4:
                click.echo("  Usage: evaluate <soulkey> <resource> <action>")
                continue
            _run(_playground_evaluate(parts[1], parts[2], parts[3]))

        elif cmd == "tokens":
            if len(parts) < 4:
                click.echo("  Usage: tokens <soulkey> <resource> <action>")
                continue
            _run(_playground_token(parts[1], parts[2], parts[3]))

        elif cmd == "audit":
            limit = int(parts[1]) if len(parts) > 1 else 10
            _run(_playground_audit(limit))

        elif cmd == "policies":
            _playground_policies()

        elif cmd == "agents":
            _run(_playground_agents())

        elif cmd == "status":
            # Reuse the status command's context
            ctx = click.Context(status)
            ctx.invoke(status)

        else:
            click.echo(f"  Unknown command: {cmd}. Type 'help' for commands.")


async def _playground_register(persona_id: str):
    """Register an agent in playground mode."""
    import uuid
    from src.database.local import ensure_local_setup, LOCAL_TENANT_ID, LOCAL_TENANT_SLUG
    from src.auth.soulkey import generate_soulkey

    local_db = await ensure_local_setup()
    raw_key, key_hash = generate_soulkey(LOCAL_TENANT_SLUG, persona_id)
    soulkey_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    async with local_db.engine.begin() as conn:
        await conn.exec_driver_sql(
            """INSERT INTO _soulkeys
               (id, tenant_id, persona_id, key_hash, label, status, issued_at, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                soulkey_id,
                str(LOCAL_TENANT_ID),
                persona_id,
                key_hash,
                f"Playground agent ({persona_id})",
                "active",
                now,
                "{}",
            ),
        )
        # Audit log
        await conn.exec_driver_sql(
            """INSERT INTO _soulauth_audit
               (id, tenant_id, timestamp, event_type, soulkey_id, persona_id, context)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                str(uuid.uuid4()),
                str(LOCAL_TENANT_ID),
                now,
                "agent_registered",
                soulkey_id,
                persona_id,
                json.dumps({"source": "playground"}),
            ),
        )

    click.echo(f"  Registered: {persona_id}")
    click.echo(f"  Soulkey:    {raw_key}")
    click.echo("  (save this — shown once)")


async def _playground_evaluate(raw_key: str, resource: str, action: str):
    """Evaluate access in playground mode."""
    import uuid
    from src.database.local import ensure_local_setup, LOCAL_TENANT_ID
    from src.auth.soulkey import hash_soulkey

    local_db = await ensure_local_setup()
    key_hash = hash_soulkey(raw_key)

    async with local_db.engine.begin() as conn:
        result = await conn.exec_driver_sql(
            "SELECT id, persona_id, status FROM _soulkeys WHERE key_hash = ?",
            (key_hash,),
        )
        row = result.fetchone()

    if row is None:
        click.echo("  DENIED: Unknown soulkey")
        return

    soulkey_id, persona_id, sk_status = row
    if sk_status != "active":
        click.echo(f"  DENIED: Soulkey is {sk_status}")
        return

    # In local dev mode with starter policy, everything is allowed
    click.echo(f"  GRANTED: {persona_id} -> {action} on {resource}")
    click.echo(f"  Policy: local_dev (wildcard match)")

    # Audit
    now = datetime.now(timezone.utc).isoformat()
    async with local_db.engine.begin() as conn:
        await conn.exec_driver_sql(
            """INSERT INTO _soulauth_audit
               (id, tenant_id, timestamp, event_type, soulkey_id, persona_id, resource, action, decision, context)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                str(uuid.uuid4()),
                str(LOCAL_TENANT_ID),
                now,
                "access_evaluated",
                soulkey_id,
                persona_id,
                resource,
                action,
                "grant",
                json.dumps({"source": "playground"}),
            ),
        )


async def _playground_token(raw_key: str, resource: str, action: str):
    """Request a token in playground mode."""
    import uuid
    from src.database.local import ensure_local_setup, LOCAL_TENANT_ID
    from src.auth.soulkey import hash_soulkey

    local_db = await ensure_local_setup()
    key_hash = hash_soulkey(raw_key)

    async with local_db.engine.begin() as conn:
        result = await conn.exec_driver_sql(
            "SELECT id, persona_id, status FROM _soulkeys WHERE key_hash = ?",
            (key_hash,),
        )
        row = result.fetchone()

    if row is None:
        click.echo("  Error: Unknown soulkey")
        return

    soulkey_id, persona_id, sk_status = row
    if sk_status != "active":
        click.echo(f"  Error: Soulkey is {sk_status}")
        return

    # Issue a capability token
    from src.tokens.capability import issue_capability_token
    token, jti, exp = issue_capability_token(
        soulkey_id=uuid.UUID(soulkey_id),
        tenant_id=LOCAL_TENANT_ID,
        persona_id=persona_id,
        granted_scopes=[f"{resource}:{action}:*"],
        ttl=300,
    )

    click.echo(f"  Token issued for {persona_id}")
    click.echo(f"  JTI:     {jti}")
    click.echo(f"  Expires: {exp.isoformat()}")
    click.echo(f"  Token:   {token[:50]}...")

    # Audit
    now = datetime.now(timezone.utc).isoformat()
    async with local_db.engine.begin() as conn:
        await conn.exec_driver_sql(
            """INSERT INTO _soulauth_audit
               (id, tenant_id, timestamp, event_type, soulkey_id, persona_id, resource, action, capability_id, decision, context)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                str(uuid.uuid4()),
                str(LOCAL_TENANT_ID),
                now,
                "token_issued",
                soulkey_id,
                persona_id,
                resource,
                action,
                jti,
                "grant",
                json.dumps({"source": "playground"}),
            ),
        )


async def _playground_audit(limit: int):
    """Show recent audit events in playground mode."""
    from src.database.local import DEFAULT_DB_PATH

    import aiosqlite
    async with aiosqlite.connect(str(DEFAULT_DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT timestamp, event_type, persona_id, resource, action, decision FROM _soulauth_audit ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        )
        rows = await cursor.fetchall()

    if not rows:
        click.echo("  No audit events yet.")
        return

    click.echo(f"  Recent audit events (last {limit}):")
    click.echo("  " + "-" * 70)
    for row in rows:
        ts = row["timestamp"][:19] if row["timestamp"] else "?"
        evt = row["event_type"] or "?"
        pid = row["persona_id"] or "-"
        res = row["resource"] or "-"
        act = row["action"] or "-"
        dec = row["decision"] or "-"
        click.echo(f"  {ts}  {evt:<20}  {pid:<15}  {res}:{act}  [{dec}]")


def _playground_policies():
    """List loaded policies."""
    from src.database.local import DEFAULT_POLICIES_DIR

    policy_files = list(DEFAULT_POLICIES_DIR.glob("*.yml")) + list(DEFAULT_POLICIES_DIR.glob("*.yaml"))
    if not policy_files:
        click.echo("  No policies found.")
        return

    click.echo(f"  Policies ({len(policy_files)}):")
    for pf in policy_files:
        click.echo(f"    - {pf.name}")
        try:
            import yaml
            data = yaml.safe_load(pf.read_text())
            meta = data.get("metadata", {})
            click.echo(f"      persona: {meta.get('persona', '?')}, role: {meta.get('role', '?')}")
        except Exception:
            pass


async def _playground_agents():
    """List registered agents in playground mode."""
    from src.database.local import DEFAULT_DB_PATH

    import aiosqlite
    async with aiosqlite.connect(str(DEFAULT_DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT persona_id, status, label, issued_at, last_used_at FROM _soulkeys ORDER BY issued_at DESC"
        )
        rows = await cursor.fetchall()

    if not rows:
        click.echo("  No agents registered.")
        return

    click.echo(f"  Registered agents ({len(rows)}):")
    click.echo("  " + "-" * 60)
    for row in rows:
        pid = row["persona_id"]
        st = row["status"]
        label = row["label"] or ""
        issued = row["issued_at"][:10] if row["issued_at"] else "?"
        last_used = row["last_used_at"][:19] if row["last_used_at"] else "never"
        click.echo(f"  {pid:<20}  [{st}]  {label}  (since {issued}, last used: {last_used})")


def _start_local_server(host: str = "127.0.0.1", port: int = 8000, reload: bool = False):
    """Start the local uvicorn server."""
    import uvicorn

    # Ensure local mode init runs before the app starts
    os.environ["SOULAUTH_MODE"] = "local"

    uvicorn.run(
        "src.main:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info",
    )


def main():
    """Entry point for the CLI."""
    cli()


if __name__ == "__main__":
    main()
