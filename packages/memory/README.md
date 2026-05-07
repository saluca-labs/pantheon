# @platform/memory

Vendored from saluca-labs/elysium @ commit 758a4a5. **Internal package, do not publish.**

Local-first agent memory providing topic index, full-text search, hybrid vector search (BM25 + embeddings + RRF), and temporal decay.

## Overview

This package is vendored from the upstream `saluca-labs/elysium` repository. It is private and not published to npm. Use it as a workspace dependency:

```json
{
  "dependencies": {
    "@platform/memory": "workspace:*"
  }
}
```

## Usage

```typescript
import { MemoryStore } from '@platform/memory';

const store = new MemoryStore({ database: './memory.db' });
```

## Development

```bash
pnpm build   # compile TypeScript
pnpm test    # run vitest suite
pnpm clean   # remove dist/
```

## Upstream

Original repository: `saluca-labs/elysium`  
Vendored at commit: `758a4a5`  
Original package name: `@saluca/asphodel`  

Do not sync upstream changes without review. All modifications to this package must be made in this repository.
