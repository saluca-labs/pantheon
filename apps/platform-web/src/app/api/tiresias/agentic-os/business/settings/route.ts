/**
 * Business OS Phase 1 — settings route.
 *
 * GET   /api/tiresias/agentic-os/business/settings
 *   Returns the caller's settings row, lazy-creating defaults on first
 *   read.  Audits `business.settings.created` once when the row is born.
 *
 * PATCH /api/tiresias/agentic-os/business/settings
 *   Partial update.  Lazy-creates first if needed, then applies the
 *   patch.  Audits `business.settings.updated`.
 *
 * Cross-tenant: the settings row is keyed by UNIQUE(user_id); we only
 * ever read/write the caller's own row.  There is no path to read
 * another user's row from this endpoint.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import {
  getOrCreateSettings,
  updateSettings,
} from '@/lib/agentic-os/business/settings-repo';

const PatchBody = z
  .object({
    business_name: z.string().max(200).optional(),
    logo_url: z.string().url().max(4000).nullable().optional(),
    address: z.string().max(2000).optional(),
    tax_id: z.string().max(60).nullable().optional(),
    default_currency: z.string().min(1).max(8).optional(),
    invoice_number_prefix: z.string().max(20).optional(),
    quote_number_prefix: z.string().max(20).optional(),
    default_payment_terms: z.string().max(40).optional(),
    default_hourly_rate_cents: z
      .number()
      .int()
      .min(0)
      .max(100_000_000)
      .nullable()
      .optional(),
    accent_color: z.string().max(30).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export async function GET() {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { settings, created } = await getOrCreateSettings(user.userId);
  if (created) {
    await recordAudit({
      actorId: user.userId,
      action: 'business.settings.created',
      payload: { settingsId: settings.id },
    });
  }
  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const settings = await updateSettings(user.userId, {
    businessName: d.business_name,
    logoUrl: d.logo_url,
    address: d.address,
    taxId: d.tax_id,
    defaultCurrency: d.default_currency,
    invoiceNumberPrefix: d.invoice_number_prefix,
    quoteNumberPrefix: d.quote_number_prefix,
    defaultPaymentTerms: d.default_payment_terms,
    defaultHourlyRateCents: d.default_hourly_rate_cents,
    accentColor: d.accent_color,
    metadata: d.metadata,
  });
  if (!settings) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await recordAudit({
    actorId: user.userId,
    action: 'business.settings.updated',
    payload: { fields: Object.keys(d) },
  });
  return NextResponse.json({ settings });
}
