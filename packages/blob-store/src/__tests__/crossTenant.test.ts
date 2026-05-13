import { describe, it, expect } from 'vitest';
import { MemoryBlobStore } from '../providers/memory.js';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe('cross-tenant access', () => {
  it('returns BLOB_NOT_FOUND when tenant B reads tenant A object', async () => {
    const store = new MemoryBlobStore();
    await store.put(
      { slug: 'maker', tenantId: A, key: 'private.stl' },
      Buffer.from('binary'),
      { contentType: 'application/octet-stream', maxBytes: 1024 },
    );
    await expect(
      store.get({ slug: 'maker', tenantId: B, key: 'private.stl' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('blob not found') });
  });

  it('refuses to mint signed URL for cross-tenant object', async () => {
    const store = new MemoryBlobStore();
    await store.put(
      { slug: 'maker', tenantId: A, key: 'private.stl' },
      Buffer.from('binary'),
      { contentType: 'application/octet-stream', maxBytes: 1024 },
    );
    await expect(
      store.getSignedUrl(
        { slug: 'maker', tenantId: B, key: 'private.stl' },
        { ttlSeconds: 60 },
      ),
    ).rejects.toThrow(/blob not found/);
  });

  it('list filters by tenant prefix', async () => {
    const store = new MemoryBlobStore();
    await store.put(
      { slug: 'maker', tenantId: A, key: 'a.stl' },
      Buffer.from('A'),
      { contentType: 'application/octet-stream', maxBytes: 16 },
    );
    await store.put(
      { slug: 'maker', tenantId: B, key: 'b.stl' },
      Buffer.from('B'),
      { contentType: 'application/octet-stream', maxBytes: 16 },
    );
    const aList = await store.list({ slug: 'maker', tenantId: A, key: '' });
    expect(aList.map((r) => r.key)).toEqual(['a.stl']);
  });
});
