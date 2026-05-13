/**
 * Business OS Phase 5 — P&L summary PDF template.
 *
 * Renders a profit-and-loss statement with period metadata, per-currency
 * revenue/expense/margin totals, and a category breakdown table.
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@/lib/agentic-os/_shared/pdf/primitives';
import {
  PdfPageStyles,
  PdfHeader,
  PdfFooter,
  PdfMetadataBlock,
  PdfTable,
} from '@/lib/agentic-os/_shared/pdf/primitives';
import type {
  PnlSummaryCurrency,
  PnlSummaryGroup,
} from '../pnl-snapshots';

const styles = StyleSheet.create({
  ...PdfPageStyles,
  subtitle: {
    fontSize: 10,
    color: '#475569',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 2,
    padding: 8,
    marginHorizontal: 3,
  },
  summaryCardLabel: {
    fontSize: 8,
    color: '#475569',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryCardValue: {
    fontSize: 14,
    fontWeight: 700,
    color: '#0f172a',
  },
  summaryCardCurrency: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginTop: 14,
    marginBottom: 6,
    color: '#0f172a',
  },
});

function fmtCents(cents: number): string {
  const val = (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (cents < 0 ? '-' : '') + '$' + val.replace('-', '');
}

interface PnlSummaryPdfProps {
  summary: PnlSummaryCurrency[];
  groups: PnlSummaryGroup[];
  periodStart: string;
  periodEnd: string;
}

export function PnlSummaryDocument({
  summary,
  groups,
  periodStart,
  periodEnd,
}: PnlSummaryPdfProps) {
  const categoryGroups = groups.filter((g) => g.label !== '_all');

  const fields = [
    { label: 'Period Start', value: periodStart },
    { label: 'Period End', value: periodEnd },
    { label: 'Basis', value: 'Cash (payments received + expenses paid/incurred)' },
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PdfHeader
          title="Profit & Loss Statement"
          subtitle={`${periodStart} to ${periodEnd}`}
        />
        <PdfFooter />

        <PdfMetadataBlock fields={fields} />

        {/* Summary cards per currency */}
        {summary.map((s) => (
          <React.Fragment key={s.currency}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Revenue</Text>
                <Text style={styles.summaryCardValue}>{fmtCents(s.revenueCents)}</Text>
                <Text style={styles.summaryCardCurrency}>{s.currency}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Expenses</Text>
                <Text style={styles.summaryCardValue}>{fmtCents(s.expenseCents)}</Text>
                <Text style={styles.summaryCardCurrency}>{s.currency}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryCardLabel}>Net Margin</Text>
                <Text style={[
                  styles.summaryCardValue,
                  { color: s.marginCents >= 0 ? '#16a34a' : '#dc2626' },
                ]}>
                  {fmtCents(s.marginCents)}
                </Text>
                <Text style={styles.summaryCardCurrency}>{s.currency}</Text>
              </View>
            </View>
          </React.Fragment>
        ))}

        {/* Category breakdown */}
        {categoryGroups.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Expense Breakdown by Category</Text>
            <PdfTable
              columns={[
                { header: 'Category', width: 4, render: (r: PnlSummaryGroup) => r.label },
                {
                  header: 'Amount',
                  width: 2,
                  render: (r: PnlSummaryGroup) => {
                    const t = r.totals[0];
                    return t ? fmtCents(t.expenseCents) : '—';
                  },
                },
                {
                  header: '% of Total',
                  width: 2,
                  render: (r: PnlSummaryGroup) => {
                    const allExp = categoryGroups.reduce(
                      (sum, g) => sum + (g.totals[0]?.expenseCents ?? 0),
                      0,
                    );
                    const t = r.totals[0];
                    const pct = allExp > 0 && t ? ((t.expenseCents / allExp) * 100) : 0;
                    return `${pct.toFixed(1)}%`;
                  },
                },
              ]}
              rows={categoryGroups}
            />
          </>
        )}

        <Text style={{ marginTop: 24, fontSize: 8, color: '#94a3b8', textAlign: 'center' }}>
          Generated by Pantheon Business OS
        </Text>
      </Page>
    </Document>
  );
}
