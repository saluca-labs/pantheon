/**
 * Business OS Phase 4 — quote PDF export route.
 *
 * GET /api/tiresias/agentic-os/business/quotes/[id]/export.pdf
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { getQuote } from '@/lib/agentic-os/business/quotes-repo';
import { listLineItems } from '@/lib/agentic-os/business/line-items-repo';
import { getOrCreateSettings } from '@/lib/agentic-os/business/settings-repo';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import { respondWithPdf } from '@/lib/agentic-os/_shared/blob-store';

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: 'Helvetica', fontSize: 11, color: '#1f2937' },
  header: { fontSize: 20, fontWeight: 'bold', marginBottom: 24 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  metaSection: { marginBottom: 24 },
  metaLabel: { fontSize: 9, color: '#6b7280', marginBottom: 2 },
  metaValue: { fontSize: 11 },
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '2 solid #e5e7eb',
    paddingBottom: 6,
    marginBottom: 6,
  },
  tableRow: { flexDirection: 'row', borderBottom: '1 solid #e5e7eb', paddingVertical: 4 },
  colDesc: { flex: 3 },
  colQty: { flex: 1, textAlign: 'right' },
  colPrice: { flex: 1.5, textAlign: 'right' },
  colTotal: { flex: 1.5, textAlign: 'right' },
  totalsSection: { marginTop: 16, borderTop: '1 solid #d1d5db', paddingTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
  totalLabel: { width: 120, textAlign: 'right', marginRight: 16, fontSize: 10, color: '#6b7280' },
  totalValue: { width: 100, textAlign: 'right', fontWeight: 'bold' },
  grandTotal: { fontSize: 14, fontWeight: 'bold' },
  footer: { marginTop: 32, fontSize: 9, color: '#9ca3af', textAlign: 'center' },
});

function fmtCents(cents: number, currency: string): string {
  const val = (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${val}`;
}

interface QuotePdfProps {
  quote: any;
  lineItems: any[];
  settings: any;
}

function QuotePdfDocument({ quote, lineItems, settings }: QuotePdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>QUOTE {quote.quoteNumber}</Text>

        {/* From / To */}
        <View style={styles.metaSection}>
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaLabel}>From</Text>
              <Text style={styles.metaValue}>{settings.businessName || 'Your Business'}</Text>
              {settings.address ? <Text style={{ fontSize: 9 }}>{settings.address}</Text> : null}
            </View>
            <View>
              <Text style={styles.metaLabel}>To</Text>
              <Text style={styles.metaValue}>Contact ID: {quote.contactId ?? 'N/A'}</Text>
            </View>
          </View>
        </View>

        {/* Quote Meta */}
        <View style={styles.metaSection}>
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaLabel}>Quote Number</Text>
              <Text style={styles.metaValue}>{quote.quoteNumber}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{quote.quoteDate}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Expires</Text>
              <Text style={styles.metaValue}>{quote.expiresOn ?? 'N/A'}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Status</Text>
              <Text style={styles.metaValue}>{quote.status}</Text>
            </View>
          </View>
        </View>

        {/* Line Items Table */}
        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>Description</Text>
          <Text style={styles.colQty}>Qty</Text>
          <Text style={styles.colPrice}>Unit Price</Text>
          <Text style={styles.colTotal}>Line Total</Text>
        </View>

        {lineItems.map((item: any) => (
          <View style={styles.tableRow} key={item.id}>
            <Text style={styles.colDesc}>{item.description}</Text>
            <Text style={styles.colQty}>{item.quantity}</Text>
            <Text style={styles.colPrice}>{fmtCents(item.unitPriceCents, quote.currency)}</Text>
            <Text style={styles.colTotal}>{fmtCents(item.lineTotalCents, quote.currency)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{fmtCents(quote.subtotalCents, quote.currency)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <Text style={styles.totalValue}>{fmtCents(quote.taxCents, quote.currency)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={[styles.totalValue, styles.grandTotal]}>
              {fmtCents(quote.totalCents, quote.currency)}
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {settings.businessName} — Generated {new Date().toISOString().slice(0, 10)}
        </Text>
      </Page>
    </Document>
  );
}

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const quote = await getQuote(id, user.userId);
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [lineItems, settings] = await Promise.all([
    listLineItems('quote', id, user.userId),
    getOrCreateSettings(user.userId),
  ]);

  const buf = await renderPdfToBuffer(
    React.createElement(QuotePdfDocument, { quote, lineItems, settings }),
  );

  await recordAudit({
    actorId: user.userId,
    action: 'business.quote.export.pdf',
    payload: { quoteId: id },
  });

  return respondWithPdf({
    buffer: buf,
    slug: 'business',
    tenantId: user.userId,
    key: `quotes/${id}/quote-${quote.quoteNumber}.pdf`,
    filename: `quote-${quote.quoteNumber}.pdf`,
    disposition: 'inline',
  });
}
