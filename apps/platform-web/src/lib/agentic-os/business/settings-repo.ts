/**
 * Business OS Phase 1 — settings DB repository.
 *
 * Cross-tenant contract: every read scopes by `user_id` and the column is
 * UNIQUE at the DB. A settings row for another user is never visible —
 * `getSettings` returns null on lookup miss, then `getOrCreateSettings`
 * lazy-inserts a defaults row for the *caller*.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import { getBusinessPool } from './session';
import {
  defaultSettings,
  type BusinessSettings,
  type UpdateBusinessSettingsInput,
} from './settings';

const SETTINGS_COLUMNS = `id, user_id, business_name, logo_url, address, tax_id,
                          default_currency, invoice_number_prefix,
                          quote_number_prefix, default_payment_terms,
                          default_hourly_rate_cents, accent_color, metadata,
                          created_at, updated_at`;

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return new Date(0).toISOString();
}

function rowToSettings(row: any): BusinessSettings {
  return {
    id: row.id,
    userId: row.user_id,
    businessName: row.business_name ?? '',
    logoUrl: row.logo_url ?? null,
    address: row.address ?? '',
    taxId: row.tax_id ?? null,
    defaultCurrency: row.default_currency ?? 'USD',
    invoiceNumberPrefix: row.invoice_number_prefix ?? 'INV',
    quoteNumberPrefix: row.quote_number_prefix ?? 'Q',
    defaultPaymentTerms: row.default_payment_terms ?? 'net_30',
    defaultHourlyRateCents:
      row.default_hourly_rate_cents == null
        ? null
        : Number(row.default_hourly_rate_cents),
    accentColor: row.accent_color ?? 'teal',
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/**
 * Fetch the settings row for `userId`, or `null` if not present.
 * Callers wanting auto-create should use {@link getOrCreateSettings}.
 */
export async function getSettings(userId: string): Promise<BusinessSettings | null> {
  const pool = getBusinessPool();
  const r = await pool.query(
    `SELECT ${SETTINGS_COLUMNS}
       FROM agos_business_settings
      WHERE user_id = $1
      LIMIT 1`,
    [userId],
  );
  if ((r.rowCount ?? 0) === 0) return null;
  return rowToSettings(r.rows[0]);
}

/**
 * Get or lazy-create the settings row for the caller.  Returns a tuple
 * indicating whether the row was created on this call (the route uses
 * the flag to decide whether to fire `business.settings.created`).
 *
 * Concurrency: a UNIQUE constraint on `user_id` makes parallel
 * lazy-creates safe — the second caller hits 23505 and re-reads.
 */
export async function getOrCreateSettings(
  userId: string,
): Promise<{ settings: BusinessSettings; created: boolean }> {
  const existing = await getSettings(userId);
  if (existing) return { settings: existing, created: false };

  const pool = getBusinessPool();
  const id = randomUUID();
  const seed = defaultSettings(userId, id);
  try {
    await pool.query(
      `INSERT INTO agos_business_settings
         (id, user_id, business_name, logo_url, address, tax_id,
          default_currency, invoice_number_prefix, quote_number_prefix,
          default_payment_terms, default_hourly_rate_cents, accent_color,
          metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      [
        seed.id,
        seed.userId,
        seed.businessName,
        seed.logoUrl,
        seed.address,
        seed.taxId,
        seed.defaultCurrency,
        seed.invoiceNumberPrefix,
        seed.quoteNumberPrefix,
        seed.defaultPaymentTerms,
        seed.defaultHourlyRateCents,
        seed.accentColor,
        JSON.stringify(seed.metadata),
      ],
    );
  } catch (err: unknown) {
    if (!(err instanceof Error)) throw err;
    const errErr = err as Error & { code?: string; constraint?: string };
    if (errErr?.code !== '23505') throw err;
    // Race: another caller created the row first.  Re-read.
    const after = await getSettings(userId);
    if (!after) throw err;
    return { settings: after, created: false };
  }

  const created = await getSettings(userId);
  if (!created) throw new Error('Failed to create settings row');
  return { settings: created, created: true };
}

/**
 * Patch the caller's settings.  Lazy-creates the row first so callers
 * never see a 404 on PATCH after GET.  Returns null only on a DB-side
 * failure that's safe to expose as 404.
 */
export async function updateSettings(
  userId: string,
  patch: UpdateBusinessSettingsInput,
): Promise<BusinessSettings | null> {
  await getOrCreateSettings(userId);
  const pool = getBusinessPool();
  const set: string[] = [];
  const params: any[] = [userId];
  let n = 1;

  if (patch.businessName !== undefined) {
    params.push(patch.businessName);
    n += 1;
    set.push(`business_name = $${n}`);
  }
  if (patch.logoUrl !== undefined) {
    params.push(patch.logoUrl);
    n += 1;
    set.push(`logo_url = $${n}`);
  }
  if (patch.address !== undefined) {
    params.push(patch.address);
    n += 1;
    set.push(`address = $${n}`);
  }
  if (patch.taxId !== undefined) {
    params.push(patch.taxId);
    n += 1;
    set.push(`tax_id = $${n}`);
  }
  if (patch.defaultCurrency !== undefined) {
    params.push(patch.defaultCurrency);
    n += 1;
    set.push(`default_currency = $${n}`);
  }
  if (patch.invoiceNumberPrefix !== undefined) {
    params.push(patch.invoiceNumberPrefix);
    n += 1;
    set.push(`invoice_number_prefix = $${n}`);
  }
  if (patch.quoteNumberPrefix !== undefined) {
    params.push(patch.quoteNumberPrefix);
    n += 1;
    set.push(`quote_number_prefix = $${n}`);
  }
  if (patch.defaultPaymentTerms !== undefined) {
    params.push(patch.defaultPaymentTerms);
    n += 1;
    set.push(`default_payment_terms = $${n}`);
  }
  if (patch.defaultHourlyRateCents !== undefined) {
    params.push(patch.defaultHourlyRateCents);
    n += 1;
    set.push(`default_hourly_rate_cents = $${n}`);
  }
  if (patch.accentColor !== undefined) {
    params.push(patch.accentColor);
    n += 1;
    set.push(`accent_color = $${n}`);
  }
  if (patch.metadata !== undefined) {
    params.push(JSON.stringify(patch.metadata));
    n += 1;
    set.push(`metadata = $${n}::jsonb`);
  }

  if (set.length === 0) {
    return getSettings(userId);
  }

  set.push(`updated_at = now()`);

  await pool.query(
    `UPDATE agos_business_settings
        SET ${set.join(', ')}
      WHERE user_id = $1`,
    params,
  );
  return getSettings(userId);
}
