import { describe, it, expect } from 'vitest';
import { MemoryBlobStore } from '../providers/memory.js';

const T = '11111111-1111-1111-1111-111111111111';

describe('content type round trip', () => {
  it('preserves content-type', async () => {
    const store = new MemoryBlobStore();
    await store.put(
      { slug: 'creator', tenantId: T, key: 'pod.mp3' },
      Buffer.from('id3'),
      { contentType: 'audio/mpeg', maxBytes: 1024 },
    );
    const got = await store.get({ slug: 'creator', tenantId: T, key: 'pod.mp3' });
    expect(got.contentType).toBe('audio/mpeg');
  });
});
