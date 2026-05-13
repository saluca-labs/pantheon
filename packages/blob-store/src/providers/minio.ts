import { Readable } from 'node:stream';
import { createHash, createHmac } from 'node:crypto';
import {
  blobRefSchema,
  bucketFor,
  objectKeyFor,
  SIGNED_URL_DEFAULT_TTL,
  SIGNED_URL_MAX_TTL,
  type AgenticOsSlug,
  type BlobRef,
  type BlobStore,
  type GetResult,
  type PutResult,
} from '../types.js';

export interface MinioConfig {
  endpoint: string;            // e.g. http://127.0.0.1:9000
  accessKey: string;
  secretKey: string;
  region?: string;             // default: us-east-1
  kmsMasterKey?: string;       // CFG-01 >=32 chars; passed via SSE-S3 metadata
}

/**
 * MinIO / S3-compatible blob store.
 *
 * Implementation notes:
 * - Uses signed S3 v4 PUT/GET via `fetch`. We avoid the heavyweight aws-sdk
 *   to keep package size lean — MinIO accepts standard SigV4.
 * - Per-tenant key prefix is enforced by the package: callers cannot bypass
 *   `objectKeyFor()`.
 * - Cross-tenant access returns a 404-equivalent exception.
 *
 * Bucket creation is idempotent and runs at startup via `ensureBuckets()`.
 */
export class MinioBlobStore implements BlobStore {
  constructor(private readonly cfg: MinioConfig) {
    if (!cfg.endpoint) throw new Error('MinioBlobStore: endpoint required');
    if (!cfg.accessKey || !cfg.secretKey) {
      throw new Error('MinioBlobStore: accessKey + secretKey required');
    }
    if (cfg.kmsMasterKey && cfg.kmsMasterKey.length < 32) {
      throw new Error('BLOB_STORE_KMS_MASTER_KEY must be at least 32 characters (CFG-01)');
    }
  }

  async ensureBuckets(slugs: readonly AgenticOsSlug[]): Promise<void> {
    for (const slug of slugs) {
      const name = bucketFor(slug);
      const url = `${this.cfg.endpoint}/${name}`;
      const res = await this.signedFetch('HEAD', url);
      if (res.status === 200) continue;
      if (res.status === 404) {
        const create = await this.signedFetch('PUT', url);
        if (!create.ok && create.status !== 409) {
          throw new Error(`failed to create bucket ${name}: ${create.status}`);
        }
        continue;
      }
      throw new Error(`unexpected status ${res.status} probing bucket ${name}`);
    }
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
    const url = `${this.cfg.endpoint}/${bucketFor(ref.slug)}/${objectKeyFor(ref)}`;
    const headers: Record<string, string> = { 'content-type': opts.contentType };
    if (this.cfg.kmsMasterKey) {
      headers['x-amz-server-side-encryption'] = 'AES256';
    }
    const res = await this.signedFetch('PUT', url, buf, headers);
    if (!res.ok) throw new Error(`MinIO PUT failed: ${res.status}`);
    const etag = (res.headers.get('etag') ?? '').replace(/"/g, '');
    return { url, etag, size: buf.byteLength };
  }

  async get(ref: BlobRef): Promise<GetResult> {
    blobRefSchema.parse(ref);
    const url = `${this.cfg.endpoint}/${bucketFor(ref.slug)}/${objectKeyFor(ref)}`;
    const res = await this.signedFetch('GET', url);
    if (res.status === 404) throw notFound(ref);
    if (!res.ok) throw new Error(`MinIO GET failed: ${res.status}`);
    const reader = res.body as unknown as Readable;
    return {
      stream: reader ?? Readable.from(Buffer.from(await res.arrayBuffer())),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      size: Number(res.headers.get('content-length') ?? 0),
    };
  }

  async getSignedUrl(ref: BlobRef, opts: { ttlSeconds: number }): Promise<string> {
    blobRefSchema.parse(ref);
    if (opts.ttlSeconds < 1) throw new Error('ttlSeconds must be positive');
    if (opts.ttlSeconds > SIGNED_URL_MAX_TTL) {
      throw new Error(`ttlSeconds exceeds max (${opts.ttlSeconds} > ${SIGNED_URL_MAX_TTL})`);
    }
    // Cross-tenant 404 — refuse to sign for objects this tenant cannot see.
    const head = await this.signedFetch(
      'HEAD',
      `${this.cfg.endpoint}/${bucketFor(ref.slug)}/${objectKeyFor(ref)}`,
    );
    if (head.status === 404) throw notFound(ref);
    return signGetUrl(this.cfg, bucketFor(ref.slug), objectKeyFor(ref), opts.ttlSeconds);
  }

  async delete(ref: BlobRef): Promise<void> {
    blobRefSchema.parse(ref);
    const url = `${this.cfg.endpoint}/${bucketFor(ref.slug)}/${objectKeyFor(ref)}`;
    await this.signedFetch('DELETE', url);
  }

  async list(prefix: BlobRef): Promise<BlobRef[]> {
    // list() accepts an empty `key` to mean "list all under tenant". See
    // matching note in MemoryBlobStore.list — strict schema is intentional
    // for put/get but blocks the bulk-list pattern.
    if (typeof prefix.tenantId !== 'string') throw new Error('list: tenantId required');
    if (prefix.key.startsWith('/') || prefix.key.includes('..')) {
      throw new Error('list: key prefix must not start with / or contain ..');
    }
    const fullPrefix = `${prefix.tenantId}/${prefix.key}`;
    const url = `${this.cfg.endpoint}/${bucketFor(prefix.slug)}?prefix=${encodeURIComponent(fullPrefix)}&list-type=2`;
    const res = await this.signedFetch('GET', url);
    if (!res.ok) return [];
    const xml = await res.text();
    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]!);
    return keys.map((k) => ({
      slug: prefix.slug,
      tenantId: prefix.tenantId,
      key: k.slice(prefix.tenantId.length + 1),
    }));
  }

  private async signedFetch(
    method: string,
    url: string,
    body?: Buffer,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const u = new URL(url);
    const region = this.cfg.region ?? 'us-east-1';
    const date = new Date();
    const isoDate = date
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+/, '');
    const dateStamp = isoDate.slice(0, 8);
    const payloadHash = body
      ? createHash('sha256').update(body).digest('hex')
      : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    const headers: Record<string, string> = {
      host: u.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': isoDate,
      ...extraHeaders,
    };

    const sortedHeaderNames = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort();
    const canonicalHeaders =
      sortedHeaderNames.map((h) => `${h}:${headers[h] ?? headers[h.toLowerCase()] ?? ''}\n`).join('') +
      '';
    const signedHeaders = sortedHeaderNames.join(';');
    const canonicalRequest = [
      method,
      u.pathname || '/',
      u.search.replace(/^\?/, ''),
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      isoDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const kDate = createHmac('sha256', `AWS4${this.cfg.secretKey}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${this.cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const init: RequestInit = { method, headers };
    if (body) init.body = body;
    return fetch(url, init);
  }
}

function signGetUrl(cfg: MinioConfig, bucket: string, key: string, ttl: number): string {
  const u = new URL(`${cfg.endpoint}/${bucket}/${key}`);
  const region = cfg.region ?? 'us-east-1';
  const date = new Date();
  const isoDate = date.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const dateStamp = isoDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const params: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${cfg.accessKey}/${credentialScope}`],
    ['X-Amz-Date', isoDate],
    ['X-Amz-Expires', String(ttl)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const canonicalQuery = params
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const canonicalRequest = [
    'GET',
    u.pathname,
    canonicalQuery,
    `host:${u.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    isoDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const kDate = createHmac('sha256', `AWS4${cfg.secretKey}`).update(dateStamp).digest();
  const kRegion = createHmac('sha256', kDate).update(region).digest();
  const kService = createHmac('sha256', kRegion).update('s3').digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return `${u.origin}${u.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function notFound(ref: BlobRef): Error {
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
    if (total > maxBytes) throw new Error(`blob stream exceeds maxBytes (${total} > ${maxBytes})`);
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}
