/**
 * Agentic OS — shared blob-store accessor + PDF offload helper.
 *
 * Wraps `@platform/blob-store` with two pantheon-specific concerns:
 *
 *  1. A singleton accessor that respects the `BLOB_STORE_DRIVER` env-var
 *     and falls back to in-memory storage when the env is unset (typical
 *     for dev, CI, and the pre-env-vars-wave production state).
 *
 *  2. `respondWithPdf({ buffer, slug, tenantId, key, filename, disposition })`
 *     — the canonical "I rendered a PDF, now ship it" path. When
 *     `BLOB_STORE_DRIVER` is set to a real backend (minio/s3) it offloads
 *     the buffer to blob storage and replies with a short-lived signed URL
 *     redirect. When unset, it falls back to the existing inline
 *     `Content-Type: application/pdf` Buffer response so behavior matches
 *     the pre-blob-store baseline.
 *
 * Routes call `respondWithPdf` instead of building the `new Response(buf, ...)`
 * by hand. The wave-1 env-vars rollout flips the driver; no route change
 * is required to switch storage modes.
 */

import 'server-only';
import { NextResponse } from 'next/server';
import {
  getBlobStore as _getBlobStore,
  isBlobStoreOffloadEnabled,
  SIGNED_URL_DEFAULT_TTL,
  type AgenticOsSlug,
  type BlobStore,
} from '@platform/blob-store';

export { isBlobStoreOffloadEnabled } from '@platform/blob-store';
export type { AgenticOsSlug } from '@platform/blob-store';

/**
 * Returns the singleton BlobStore. In environments where
 * `BLOB_STORE_DRIVER` is unset this is the in-memory adapter and is safe
 * to use as a tenant-isolated scratch space (e.g. tests).
 */
export function getBlobStore(): BlobStore {
  return _getBlobStore();
}

export interface RespondWithPdfArgs {
  buffer: Buffer;
  slug: AgenticOsSlug;
  /**
   * Tenant ID, expected to be a UUID. Most pantheon OSes scope by
   * `user.userId`. Routes that lack a real UUID tenant should pass the
   * zero-UUID and only use the inline path (offload disabled).
   */
  tenantId: string;
  /** Per-OS object key under the tenant prefix, e.g. `quotes/Q-2026-001.pdf`. */
  key: string;
  /** Filename used in the Content-Disposition header for the inline path. */
  filename: string;
  /** `inline` (default) or `attachment` — only used by the inline path. */
  disposition?: 'inline' | 'attachment';
  /**
   * TTL for the signed URL when offload is enabled. Defaults to the
   * package default (5 minutes). Capped by SIGNED_URL_MAX_TTL.
   */
  ttlSeconds?: number;
}

/**
 * Ship a freshly-rendered PDF buffer.
 *
 * - With offload enabled (BLOB_STORE_DRIVER=minio|s3): uploads to the
 *   per-OS bucket under `<tenantId>/<key>` and 302-redirects to a
 *   short-lived signed URL.
 * - Without offload: returns the buffer inline with
 *   `Content-Type: application/pdf`. This is the FALLBACK path required
 *   for the env-vars-deferred rollout — routes work identically to
 *   their pre-blob-store form.
 */
export async function respondWithPdf(args: RespondWithPdfArgs): Promise<Response> {
  const {
    buffer,
    slug,
    tenantId,
    key,
    filename,
    disposition = 'inline',
    ttlSeconds = SIGNED_URL_DEFAULT_TTL,
  } = args;

  if (!isBlobStoreOffloadEnabled()) {
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // Offload path.
  const store = getBlobStore();
  await store.put(
    { slug, tenantId, key },
    buffer,
    { contentType: 'application/pdf', maxBytes: 50 * 1024 * 1024 },
  );
  const url = await store.getSignedUrl({ slug, tenantId, key }, { ttlSeconds });
  return NextResponse.redirect(url, 302);
}
