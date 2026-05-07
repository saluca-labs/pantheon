# platform-memory-client (Python)

Async Python client for `@platform/memory-service`. Lets `apps/platform-api` and other Python services consume the memory capabilities provided by `packages/memory` (vendored from `saluca-labs/elysium`).

## Install (workspace)

In `apps/platform-api/pyproject.toml`:

```toml
dependencies = [
  "platform-memory-client @ {root:uri}/../../packages/memory-client/python",
  # ...
]
```

Or via `uv`/`pip` editable install:

```bash
pip install -e packages/memory-client/python
```

## Use

```python
from platform_memory_client import MemoryClient

# Reads MEMORY_SERVICE_URL + MEMORY_SERVICE_KEY from env
async with MemoryClient.from_env() as mem:
    await mem.remember("user prefers dark mode", topics=["preferences", "ui"])
    hits = await mem.recall("preferences", limit=5)
    for h in hits:
        print(h.id, h.content)
```

## Env

| Var | Default | Notes |
|---|---|---|
| `MEMORY_SERVICE_URL` | `http://memory-service:8910` | base URL of the sidecar |
| `MEMORY_SERVICE_KEY` | (empty) | required when sidecar is configured with a key |

## Surface

`MemoryClient` mirrors the JS `Asphodel` API:

- `remember(content, topics=None) -> Memory`
- `list(limit=20, offset=0) -> list[Memory]`
- `recall(topic, limit=10) -> list[Memory]`
- `search(q, limit=10) -> list[Memory]`
- `forget(id) -> bool`
- `health() -> dict`
