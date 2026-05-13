import { Readable } from 'node:stream';
import { createHash, randomBytes } from 'node:crypto';
import {
  blobRefSchema,
  bucketFor,
  objectKeyFor,
  SIGNED_URL_DEFAULT_TTL,
  SIGNED_URL_MAX_TTL,
  type BlobRef,
  type BlobStore,
  type GetResult,
  type PutResult,
} from '../types.js';

interface StoredObject {
  body: Buffer;
  contentType: string;
  etag: string;
  size: number;
  createdAt: number;
}

/**
 * In-memory blob store. Used for tests and as a transparent stand-in when
 * MinIO is not configured. Enforces the same per-tenant prefix rules and
 * cross-tenant 404 semantics as the production MinIO adapter.
 */
export class MemoryBlobStore implements BlobStore {
  private readonly buckets = new Map<string, Map<string, StoredObject>>();
  private readonly signingSecret = randomBytes(32);

  private bucket(slug: BlobRef['slug']): Map<string, StoredObject> {
    const name = bucketFor(slug);
    let b = this.buckets.get(name);
    if (!b) {
      b = new Map();
      this.buckets.set(name, b);
    }
    return b;
  }

  async put(
    ref: BlobRef,
    body: Buffer | Readable,
    opts: { contentType: string; maxBytes: number },
  ): Promise<PutResult> {
    blobRefSchema.parse(ref);
    const buf = Buffer.isBuffer(body) ? body : await streamToBuffer(body, opts.maxBytes);
    if (buf.byteLength > opts.maxBytes) {
      throw new Error(`blob exceeds maxBytes (${buf.byteLength} > ${opts.maxBytes})`);
    }
    const etag = createHash('sha256').update(buf).digest('hex').slice(0, 32);
    const key = objectKeyFor(ref);
    this.bucket(ref.slug).set(key, {
      body: buf,
      contentType: opts.contentType,
      etag,
      size: buf.byteLength,
      createdAt: Date.now(),
    });
    return {
      url: `memory://${bucketFor(ref.slug)}/${key}`,
      etag,
      size: buf.byteLength,
    };
  }

  async get(ref: BlobRef): Promise<GetResult> {
    blobRefSchema.parse(ref);
    const obj = this.bucket(ref.slug).get(objectKeyFor(ref));
    if (!obj) throw notFound(ref);
    return {
      stream: Readable.from(obj.body),
      contentType: obj.contentType,
      size: obj.size,
    };
  }

  async getSignedUrl(ref: BlobRef, opts: { ttlSeconds: number }): Promise<string> {
    blobRefSchema.parse(ref);
    if (opts.ttlSeconds < 1) {
      throw new Error('ttlSeconds must be positive');
    }
    if (opts.ttlSeconds > SIGNED_URL_MAX_TTL) {
      throw new Error(`ttlSeconds exceeds max (${opts.ttlSeconds} > ${SIGNED_URL_MAX_TTL})`);
    }
    // Cross-tenant 404 semantics: if the object does not exist under this tenant
    // prefix, refuse to mint a URL.
    if (!this.bucket(ref.slug).has(objectKeyFor(ref))) {
      throw notFound(ref);
    }
    const expires = Date.now() + opts.ttlSeconds * 1000;
    const sig = createHash('sha256')
      .update(this.signingSecret)
      .update(`${bucketFor(ref.slug)}/${objectKeyFor(ref)}/${expires}`)
      .digest('hex')
      .slice(0, 32);
    return `memory://${bucketFor(ref.slug)}/${objectKeyFor(ref)}?expires=${expires}&sig=${sig}`;
  }

  async delete(ref: BlobRef): Promise<void> {
    blobRefSchema.parse(ref);
    this.bucket(ref.slug).delete(objectKeyFor(ref));
  }

  async list(prefix: BlobRef): Promise<BlobRef[]> {
    // list() accepts an empty `key` to mean "list all under tenant". The
    // strict blobRefSchema rejects empty keys (required for put/get), so we
    // validate the non-key portion only here.
    if (typeof prefix.tenantId !== 'string') throw new Error('list: tenantId required');
    if (prefix.key.startsWith('/') || prefix.key.includes('..')) {
      throw new Error('list: key prefix must not start with / or contain ..');
    }
    const fullPrefix = `${prefix.tenantId}/${prefix.key}`;
    const out: BlobRef[] = [];
    for (const k of this.bucket(prefix.slug).keys()) {
      if (k.startsWith(fullPrefix)) {
        const after = k.slice(prefix.tenantId.length + 1);
        out.push({ slug: prefix.slug, tenantId: prefix.tenantId, key: after });
      }
    }
    return out;
  }
}

function notFound(ref: BlobRef): Error {
  // 404-equivalent — opaque to avoid leaking cross-tenant existence.
  const e = new Error(`blob not found: ${bucketFor(ref.slug)}/${ref.key}`);
  (e as Error & { code?: string }).code = 'BLOB_NOT_FOUND';
  return e;
}

async function streamToBuffer(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += b.byteLength;
    if (total > maxBytes) {
      throw new Error(`blob stream exceeds maxBytes (${total} > ${maxBytes})`);
    }
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

export const SIGNED_URL_DEFAULTS = {
  ttlSeconds: SIGNED_URL_DEFAULT_TTL,
  maxTtlSeconds: SIGNED_URL_MAX_TTL,
} as const;
