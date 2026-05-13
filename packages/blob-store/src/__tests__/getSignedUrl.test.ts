import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryBlobStore } from '../providers/memory.js';
import { SIGNED_URL_MAX_TTL } from '../types.js';

const TENANT = '11111111-1111-1111-1111-111111111111';

describe('MemoryBlobStore.getSignedUrl', () => {
  let store: MemoryBlobStore;
  beforeEach(async () => {
    store = new MemoryBlobStore();
    await store.put(
      { slug: 'filmmaker', tenantId: TENANT, key: 'shot1.png' },
      Buffer.from('img'),
      { contentType: 'image/png', maxBytes: 1024 },
    );
  });

  it('returns a signed URL for an existing object', async () => {
    const url = await store.getSignedUrl(
      { slug: 'filmmaker', tenantId: TENANT, key: 'shot1.png' },
      { ttlSeconds: 60 },
    );
    expect(url).toContain('expires=');
    expect(url).toContain('sig=');
  });

  it('rejects ttls beyond max', async () => {
    await expect(
      store.getSignedUrl(
        { slug: 'filmmaker', tenantId: TENANT, key: 'shot1.png' },
        { ttlSeconds: SIGNED_URL_MAX_TTL + 1 },
      ),
    ).rejects.toThrow(/exceeds max/);
  });

  it('rejects non-positive ttl', async () => {
    await expect(
      store.getSignedUrl(
        { slug: 'filmmaker', tenantId: TENANT, key: 'shot1.png' },
        { ttlSeconds: 0 },
      ),
    ).rejects.toThrow(/positive/);
  });
});
