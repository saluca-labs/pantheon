/**
 * @platform/blob-store — S3-compatible blob storage with per-tenant prefix
 * enforcement and per-OS bucket isolation. MinIO in dev; any S3-compatible
 * service in prod.
 *
 * Ported from tiresias-monorepo Wave 0 (foundation). Env variables renamed
 * to the pantheon `BLOB_STORE_*` convention:
 *   - BLOB_STORE_DRIVER:        "memory" (default) | "minio"
 *   - BLOB_STORE_BUCKET:        reserved for future single-bucket modes
 *   - BLOB_STORE_ENDPOINT:      e.g. http://minio.pantheon.svc.cluster.local:9000
 *   - BLOB_STORE_REGION:        SigV4 region, default us-east-1
 *   - BLOB_STORE_ACCESS_KEY:    MinIO / S3 access key id
 *   - BLOB_STORE_SECRET_KEY:    MinIO / S3 secret access key
 *   - BLOB_STORE_KMS_MASTER_KEY: optional, >=32 chars, enables SSE-S3
 */

export { MinioBlobStore, type MinioConfig } from './providers/minio.js';
export { MemoryBlobStore } from './providers/memory.js';
export {
  AGENTIC_OS_SLUGS,
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
} from './types.js';

import { MemoryBlobStore } from './providers/memory.js';
import { MinioBlobStore, type MinioConfig } from './providers/minio.js';
import type { BlobStore } from './types.js';

let _instance: BlobStore | null = null;

/**
 * Resolve the configured BlobStore. If `BLOB_STORE_DRIVER` is unset or set
 * to `memory` returns the in-memory adapter (also used to drive the inline
 * Buffer fallback in PDF routes). Otherwise constructs MinIO from env.
 */
export function getBlobStore(): BlobStore {
  if (_instance) return _instance;
  const driver = process.env['BLOB_STORE_DRIVER'] ?? 'memory';
  if (driver === 'memory') {
    _instance = new MemoryBlobStore();
    return _instance;
  }
  if (driver !== 'minio' && driver !== 's3') {
    throw new Error(`BLOB_STORE_DRIVER must be one of: memory, minio, s3 (got ${driver})`);
  }
  const cfg: MinioConfig = {
    endpoint: requireEnv('BLOB_STORE_ENDPOINT'),
    accessKey: requireEnv('BLOB_STORE_ACCESS_KEY'),
    secretKey: requireEnv('BLOB_STORE_SECRET_KEY'),
    ...(process.env['BLOB_STORE_KMS_MASTER_KEY']
      ? { kmsMasterKey: process.env['BLOB_STORE_KMS_MASTER_KEY'] }
      : {}),
    ...(process.env['BLOB_STORE_REGION'] ? { region: process.env['BLOB_STORE_REGION'] } : {}),
  };
  _instance = new MinioBlobStore(cfg);
  return _instance;
}

/**
 * Returns true when the driver is configured to a real backend (minio/s3).
 * Routes use this to decide between offloaded vs inline Buffer responses.
 */
export function isBlobStoreOffloadEnabled(): boolean {
  const driver = process.env['BLOB_STORE_DRIVER'];
  return driver === 'minio' || driver === 's3';
}

/** Test-only — reset the singleton. */
export function _resetBlobStoreForTests(): void {
  _instance = null;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set (CFG-01 will reject in production)`);
  return v;
}
