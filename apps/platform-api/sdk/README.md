# Tiresias SDK

Python SDK for the **Tiresias App Proxy** — the zero-trust agent
identity and authorization sub-product that ships inside the Pantheon
monorepo at `apps/platform-app-proxy/`.

> **Branding note.** The App Proxy stays branded as Tiresias under
> the Pantheon umbrella; the SDK targets the App Proxy directly and
> therefore keeps the Tiresias name. See
> [ADR-013](../../../docs/decisions/ADR-013-app-proxy-tiresias-branding.md)
> for the carve-out decision.

Use this SDK to talk to a Tiresias App Proxy instance — resolve agent
identity, evaluate Cedar policy decisions, and exchange SoulKeys for
short-lived capability tokens.

## Installation

```bash
pip install tiresias-sdk
```

## Quickstart

```python
import asyncio
from tiresias import TiresiasClient

async def main():
    async with TiresiasClient("https://tiresias.network") as client:
        # Check service health
        health = await client.get_health()
        print(f"Service: {health.service} v{health.version} - {health.status}")

        # Resolve agent identity
        identity = await client.resolve_identity("sk_agent_sal_alfred_abc123...")
        print(f"Agent: {identity.persona_id} ({identity.status})")

        # Evaluate access (PDP)
        result = await client.evaluate_access(
            soulkey="sk_agent_sal_alfred_abc123...",
            resource="memory",
            action="read",
            scope="cs:algorithms",
        )

        if result.allowed:
            print(f"Access granted! Token: {result.capability_token[:20]}...")
        else:
            print(f"Access denied: {result.reason}")

asyncio.run(main())
```

## Trial Registration

```python
async with TiresiasClient("https://tiresias.network") as client:
    # Register for a 14-day trial
    trial = await client.register_trial(
        contact_name="Cristian",
        contact_email="cristian@example.com",
        company_name="Example Corp",
        company_domain="example.com",
        use_case="Agent fleet authorization",
    )
    print(f"Trial registered: {trial.trial_id}")
    print(f"Check {trial.message}")
```

## Agent Self-Inspection

```python
async with TiresiasClient("https://tiresias.network") as client:
    info = await client.whoami("sk_agent_sal_alfred_abc123...")
    print(f"Persona: {info.persona_id}")
    print(f"Tenant: {info.tenant_id}")
    if info.policy_summary:
        print(f"Role: {info.policy_summary['role']}")
        print(f"Resources: {info.policy_summary['resources']}")
```

## Error Handling

```python
from tiresias import TiresiasClient, AuthenticationError, AuthorizationError, RateLimitError

async with TiresiasClient("https://tiresias.network") as client:
    try:
        result = await client.evaluate_access(
            soulkey="sk_agent_invalid",
            resource="vault",
            action="read",
            scope="*",
        )
    except AuthenticationError:
        print("Invalid or expired SoulKey")
    except AuthorizationError:
        print("Access denied by policy")
    except RateLimitError as e:
        print(f"Rate limited. Retry after {e.retry_after}s")
```

## API Reference

### TiresiasClient

| Method | Description |
|--------|-------------|
| `get_health()` | Check service health |
| `register_agent(tenant_id, agent_id, ...)` | Issue a new SoulKey |
| `resolve_identity(soulkey)` | Resolve SoulKey to agent identity |
| `whoami(soulkey)` | Agent self-inspection with policy summary |
| `evaluate_access(soulkey, resource, action, scope)` | PDP access evaluation |
| `request_token(soulkey, resource, action, scope)` | Request capability token |
| `list_audit_events(tenant_id, ...)` | Query audit log |
| `register_trial(name, email, company, domain)` | Register for trial |
| `verify_trial(trial_id, token)` | Verify and activate trial |

### Exceptions

| Exception | HTTP Status | Description |
|-----------|------------|-------------|
| `TiresiasError` | any | Base exception |
| `AuthenticationError` | 401 | Invalid SoulKey |
| `AuthorizationError` | 403 | Access denied |
| `TokenExpiredError` | 401 | Capability token expired |
| `RateLimitError` | 429 | Rate limit hit |
| `NotFoundError` | 404 | Resource not found |
| `ConnectionError` | - | Cannot reach service |
| `ValidationError` | 422 | Invalid request data |

## Requirements

- Python 3.10+
- httpx >= 0.25.0
- pydantic >= 2.0.0

## License

MIT - Saluca LLC
