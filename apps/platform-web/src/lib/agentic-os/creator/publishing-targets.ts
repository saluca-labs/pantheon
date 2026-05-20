/**
 * Creator OS — Book publishing targets (domain types).
 *
 * A publishing target is one (book × platform × format) row representing
 * the author's intent to publish to a specific channel. Targets are added
 * to a book and then drive per-platform export presets (trim size, ePub
 * metadata, etc.) plus a pre-flight validator.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

export const PUBLISHING_PLATFORMS = [
  'kdp_paperback',
  'kdp_ebook',
  'lulu_paperback',
  'ingramspark_paperback',
  'generic_epub',
] as const;
export type PublishingPlatform = (typeof PUBLISHING_PLATFORMS)[number];

export const PUBLISHING_FORMATS = ['paperback', 'hardcover', 'ebook'] as const;
export type PublishingFormat = (typeof PUBLISHING_FORMATS)[number];

export const PUBLISHING_TARGET_STATUSES = [
  'draft',
  'ready',
  'uploaded',
  'published',
] as const;
export type PublishingTargetStatus = (typeof PUBLISHING_TARGET_STATUSES)[number];

export interface PublishingTarget {
  id: string;
  bookId: string;
  platform: PublishingPlatform;
  format: PublishingFormat;
  trimSize: string | null;
  isbn: string | null;
  bisacCodes: string[];
  priceUsd: number | null;
  status: PublishingTargetStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePublishingTargetInput {
  platform: PublishingPlatform;
  format: PublishingFormat;
  trimSize?: string | null;
  isbn?: string | null;
  bisacCodes?: string[];
  priceUsd?: number | null;
  status?: PublishingTargetStatus;
  notes?: string | null;
}

export interface UpdatePublishingTargetInput {
  platform?: PublishingPlatform;
  format?: PublishingFormat;
  trimSize?: string | null;
  isbn?: string | null;
  bisacCodes?: string[];
  priceUsd?: number | null;
  status?: PublishingTargetStatus;
  notes?: string | null;
}

/**
 * ISBN-13 format check: 13 digits (hyphens stripped), starting with 978 or
 * 979, with a valid check digit. Returns true for an empty string so the
 * caller can decide whether to enforce presence separately.
 */
export function isValidIsbn13(raw: string): boolean {
  if (raw === '') return true;
  const digits = raw.replace(/[-\s]/g, '');
  if (!/^(978|979)\d{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const d = Number(digits[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[12]);
}
