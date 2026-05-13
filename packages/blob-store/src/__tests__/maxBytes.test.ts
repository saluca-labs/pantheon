import { describe, it, expect } from 'vitest';
import { MemoryBlobStore } from '../providers/memory.js';

const T = '11111111-1111-1111-1111-111111111111';

describe('maxBytes enforcement', () => {
  it('accepts at boundary', async () => {
    const store = new MemoryBlobStore();
    const r = await store.put(
      { slug: 'maker', tenantId: T, key: 'x' },
      Buffer.alloc(1024),
      { contentType: 'application/octet-stream', maxBytes: 1024 },
    );
    expect(r.size).toBe(1024);
  });

  it('rejects one byte over', async () => {
    const store = new MemoryBlobStore();
    await expect(
      store.put(
        { slug: 'maker', tenantId: T, key: 'x' },
        Buffer.alloc(1025),
        { contentType: 'application/octet-stream', maxBytes: 1024 },
      ),
    ).rejects.toThrow(/maxBytes/);
  });
});
