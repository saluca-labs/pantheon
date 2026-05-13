import { describe, it, expect, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { MemoryBlobStore } from '../providers/memory.js';
import type { BlobRef } from '../types.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

function ref(key: string, tenantId = TENANT): BlobRef {
  return { slug: 'maker', tenantId, key };
}

describe('MemoryBlobStore.put', () => {
  let store: MemoryBlobStore;
  beforeEach(() => {
    store = new MemoryBlobStore();
  });

  it('stores a buffer and returns etag + size', async () => {
    const body = Buffer.from('hello');
    const r = await store.put(ref('a.txt'), body, { contentType: 'text/plain', maxBytes: 1024 });
    expect(r.size).toBe(5);
    expect(r.etag).toMatch(/^[a-f0-9]{32}$/);
    expect(r.url).toContain('agos-maker');
  });

  it('rejects bodies larger than maxBytes', async () => {
    const body = Buffer.alloc(2048);
    await expect(
      store.put(ref('big.bin'), body, { contentType: 'application/octet-stream', maxBytes: 1024 }),
    ).rejects.toThrow(/maxBytes/);
  });

  it('streams via Readable and respects maxBytes', async () => {
    const body = Readable.from([Buffer.alloc(600), Buffer.alloc(600)]);
    await expect(
      store.put(ref('s.bin'), body, { contentType: 'application/octet-stream', maxBytes: 1024 }),
    ).rejects.toThrow(/maxBytes/);
  });

  it('rejects non-uuid tenantId', async () => {
    await expect(
      store.put({ slug: 'maker', tenantId: 'not-a-uuid', key: 'x' }, Buffer.from('x'), {
        contentType: 'text/plain',
        maxBytes: 16,
      }),
    ).rejects.toThrow();
  });

  it('rejects path traversal in key', async () => {
    await expect(
      store.put({ slug: 'maker', tenantId: TENANT, key: '../etc/passwd' }, Buffer.from('x'), {
        contentType: 'text/plain',
        maxBytes: 16,
      }),
    ).rejects.toThrow();
  });

  it('isolates tenants under the same slug', async () => {
    await store.put(ref('shared.txt', TENANT), Buffer.from('a'), {
      contentType: 'text/plain',
      maxBytes: 16,
    });
    await store.put(ref('shared.txt', TENANT_B), Buffer.from('b'), {
      contentType: 'text/plain',
      maxBytes: 16,
    });
    const a = await store.get(ref('shared.txt', TENANT));
    const b = await store.get(ref('shared.txt', TENANT_B));
    const aBuf: Buffer[] = [];
    for await (const c of a.stream) aBuf.push(c as Buffer);
    const bBuf: Buffer[] = [];
    for await (const c of b.stream) bBuf.push(c as Buffer);
    expect(Buffer.concat(aBuf).toString()).toBe('a');
    expect(Buffer.concat(bBuf).toString()).toBe('b');
  });
});
