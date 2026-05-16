/**
 * Business OS Phase 4 — invoice PDF export route.
 *
 * GET /api/tiresias/agentic-os/business/invoices/[id]/export.pdf
 *
 * @license MIT — Tiresias Business OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { getInvoice } from '@/lib/agentic-os/business/invoices-repo';
import type { Invoice } from '@/lib/agentic-os/business/invoices';
import { listLineItems } from '@/lib/agentic-os/business/line-items-repo';
import type { LineItem } from '@/lib/agentic-os/business/line-items';
import { listPayments } from '@/lib/agentic-os/business/payments-repo';
import type { Payment } from '@/lib/agentic-os/business/payments';
import { getOrCreateSettings } from '@/lib/agentic-os/business/settings-repo';
import type { BusinessSettings } from '@/lib/agentic-os/business/settings';
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
  sectionTitle: { fontSize: 13, fontWeight: 'bold', marginTop: 20, marginBottom: 8 },
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

interface InvoicePdfProps {
  invoice: Invoice;
  lineItems: LineItem[];
  payments: Payment[];
  settings: BusinessSettings;
}

function InvoicePdfDocument({ invoice, lineItems, payments, settings }: InvoicePdfProps) {
  const outstanding = invoice.totalCents - invoice.paidCents;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>INVOICE {invoice.invoiceNumber}</Text>

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
              <Text style={styles.metaValue}>Contact ID: {invoice.contactId ?? 'N/A'}</Text>
            </View>
          </View>
        </View>

        {/* Invoice Meta */}
        <View style={styles.metaSection}>
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaLabel}>Invoice Number</Text>
              <Text style={styles.metaValue}>{invoice.invoiceNumber}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{invoice.invoiceDate}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Due Date</Text>
              <Text style={styles.metaValue}>{invoice.dueOn}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Terms</Text>
              <Text style={styles.metaValue}>{invoice.terms || 'N/A'}</Text>
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

        {lineItems.map((item: LineItem) => (
          <View style={styles.tableRow} key={item.id}>
            <Text style={styles.colDesc}>{item.description}</Text>
            <Text style={styles.colQty}>{item.quantity}</Text>
            <Text style={styles.colPrice}>{fmtCents(item.unitPriceCents, invoice.currency)}</Text>
            <Text style={styles.colTotal}>{fmtCents(item.lineTotalCents, invoice.currency)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>
              {fmtCents(invoice.subtotalCents, invoice.currency)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <Text style={styles.totalValue}>
              {fmtCents(invoice.taxCents, invoice.currency)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={[styles.totalValue, styles.grandTotal]}>
              {fmtCents(invoice.totalCents, invoice.currency)}
            </Text>
          </View>
        </View>

        {/* Payments */}
        {payments.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Payments</Text>
            <View style={styles.tableHeader}>
              <Text style={styles.colDesc}>Method</Text>
              <Text style={styles.colQty}>Date</Text>
              <Text style={styles.colPrice}>Reference</Text>
              <Text style={styles.colTotal}>Amount</Text>
            </View>
            {payments.map((p: Payment) => (
              <View style={styles.tableRow} key={p.id}>
                <Text style={styles.colDesc}>{p.method}</Text>
                <Text style={styles.colQty}>{p.receivedOn}</Text>
                <Text style={styles.colPrice}>{p.reference ?? ''}</Text>
                <Text style={styles.colTotal}>
                  {fmtCents(p.amountCents, p.currency || invoice.currency)}
                </Text>
              </View>
            ))}
            <View style={[styles.totalRow, { marginTop: 8 }]}>
              <Text style={styles.totalLabel}>Paid</Text>
              <Text style={styles.totalValue}>
                {fmtCents(invoice.paidCents, invoice.currency)}
              </Text>
            </View>
          </>
        )}

        {/* Outstanding */}
        {outstanding > 0 && (
          <View style={[styles.totalRow, { marginTop: 8 }]}>
            <Text style={styles.totalLabel}>Outstanding</Text>
            <Text style={[styles.totalValue, { color: '#dc2626' }]}>
              {fmtCents(outstanding, invoice.currency)}
            </Text>
          </View>
        )}

        {outstanding <= 0 && invoice.paidCents >= invoice.totalCents && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#16a34a', textAlign: 'center' }}>
              PAID IN FULL
            </Text>
          </View>
        )}

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

  const invoice = await getInvoice(id, user.userId);
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [lineItems, payments, settingsResult] = await Promise.all([
    listLineItems('invoice', id, user.userId),
    listPayments(user.userId, { invoiceId: id }),
    getOrCreateSettings(user.userId),
  ]);
  const settings = settingsResult.settings;

  const buf = await renderPdfToBuffer(
    React.createElement(InvoicePdfDocument, { invoice, lineItems, payments, settings }),
  );

  await recordAudit({
    actorId: user.userId,
    action: 'business.invoice.export.pdf',
    payload: { invoiceId: id },
  });

  return respondWithPdf({
    buffer: buf,
    slug: 'business',
    tenantId: user.userId,
    key: `invoices/${id}/invoice-${invoice.invoiceNumber}.pdf`,
    filename: `invoice-${invoice.invoiceNumber}.pdf`,
    disposition: 'inline',
  });
}
