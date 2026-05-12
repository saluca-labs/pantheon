/**
 * Business OS Phase 1 — settings domain types + pure helpers.
 *
 * DB calls live in `settings-repo.ts`.  The settings row is lazy-created
 * on first GET — there is no onboarding wizard in Phase 1.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

export interface BusinessSettings {
  id: string;
  userId: string;
  businessName: string;
  logoUrl: string | null;
  address: string;
  taxId: string | null;
  defaultCurrency: string;
  invoiceNumberPrefix: string;
  quoteNumberPrefix: string;
  defaultPaymentTerms: string;
  defaultHourlyRateCents: number | null;
  accentColor: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type UpdateBusinessSettingsInput = Partial<{
  businessName: string;
  logoUrl: string | null;
  address: string;
  taxId: string | null;
  defaultCurrency: string;
  invoiceNumberPrefix: string;
  quoteNumberPrefix: string;
  defaultPaymentTerms: string;
  defaultHourlyRateCents: number | null;
  accentColor: string;
  metadata: Record<string, unknown>;
}>;

/**
 * ISO-4217-ish allowlist for the default-currency dropdown.  The DB does
 * NOT enforce this — the column accepts any TEXT to allow future
 * jurisdictions without a migration.  Validator only flags clearly bogus
 * values (length 0, > 8).
 */
export const COMMON_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
  'CNY',
  'INR',
  'MXN',
  'CHF',
] as const;

/**
 * Payment term presets surfaced in the dropdown.  Free-form at the DB.
 */
export const PAYMENT_TERMS = [
  'due_on_receipt',
  'net_7',
  'net_14',
  'net_30',
  'net_60',
  'net_90',
] as const;

/**
 * Tailwind accent palette for the Business OS branding.  Mirrors the
 * registry accent options across the Oscar Suite.
 */
export const ACCENT_COLORS = [
  'teal',
  'emerald',
  'amber',
  'sky',
  'violet',
  'rose',
  'red',
  'indigo',
  'fuchsia',
] as const;

export function defaultSettings(userId: string, id: string): BusinessSettings {
  const now = new Date().toISOString();
  return {
    id,
    userId,
    businessName: '',
    logoUrl: null,
    address: '',
    taxId: null,
    defaultCurrency: 'USD',
    invoiceNumberPrefix: 'INV',
    quoteNumberPrefix: 'Q',
    defaultPaymentTerms: 'net_30',
    defaultHourlyRateCents: null,
    accentColor: 'teal',
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Validators ──────────────────────────────────────────────────────────

export function validateBusinessName(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.length > 200) return 'too long (max 200 chars)';
  return null;
}

export function validateCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.trim().length === 0) return 'cannot be empty';
  if (value.length > 8) return 'too long (max 8 chars)';
  return null;
}

export function validateLogoUrl(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return 'must be a string';
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 4000) return 'too long (max 4000 chars)';
  if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) return 'must be a valid http(s) URL';
  return null;
}

export function validateHourlyRateCents(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a number';
  if (!Number.isInteger(value)) return 'must be an integer (cents)';
  if (value < 0) return 'must be >= 0';
  if (value > 100_000_000) return 'too large (max $1,000,000/hr)';
  return null;
}

export function validateAccentColor(value: unknown): string | null {
  if (typeof value !== 'string') return 'must be a string';
  if (value.length > 30) return 'too long (max 30 chars)';
  return null;
}
