import { z } from 'zod';
import type { Readable } from 'node:stream';

export type AgenticOsSlug =
  | 'autobiographer'
  | 'business'
  | 'creator'
  | 'cyber'
  | 'filmmaker'
  | 'health'
  | 'maker'
  | 'research'
  | 'secure-dev';

export const AGENTIC_OS_SLUGS: readonly AgenticOsSlug[] = [
  'autobiographer',
  'business',
  'creator',
  'cyber',
  'filmmaker',
  'health',
  'maker',
  'research',
  'secure-dev',
] as const;

export const blobRefSchema = z.object({
  slug: z.enum([
    'autobiographer',
    'business',
    'creator',
    'cyber',
    'filmmaker',
    'health',
    'maker',
    'research',
    'secure-dev',
  ] as const),
  tenantId: z.string().uuid('tenantId must be a UUID (taken from JWT tid claim)'),
  key: z
    .string()
    .min(1)
    .max(512)
    .refine((k) => !k.startsWith('/') && !k.includes('..'), {
      message: 'key must not start with / or contain path traversal',
    }),
});

export type BlobRef = z.infer<typeof blobRefSchema>;

export interface PutResult {
  url: string;
  etag: string;
  size: number;
}

export interface GetResult {
  stream: Readable;
  contentType: string;
  size: number;
}

export interface BlobStore {
  put(
    ref: BlobRef,
    body: Buffer | Readable,
    opts: { contentType: string; maxBytes: number },
  ): Promise<PutResult>;
  get(ref: BlobRef): Promise<GetResult>;
  getSignedUrl(ref: BlobRef, opts: { ttlSeconds: number }): Promise<string>;
  delete(ref: BlobRef): Promise<void>;
  list(prefix: BlobRef): Promise<BlobRef[]>;
}

export const SIGNED_URL_DEFAULT_TTL = 5 * 60;
export const SIGNED_URL_MAX_TTL = 60 * 60;

export function bucketFor(slug: AgenticOsSlug): string {
  return `agos-${slug}`;
}

export function objectKeyFor(ref: BlobRef): string {
  return `${ref.tenantId}/${ref.key}`;
}
