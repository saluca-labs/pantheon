/**
 * Business OS Phase 5 — project profitability PDF template.
 *
 * Renders project-level profitability: budget vs actual, invoiced vs paid,
 * expense totals, and net margin.
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
import type { Project } from '../projects';
import type { Invoice } from '../invoices';
import type { Expense } from '../expenses';

const styles = StyleSheet.create({
  ...PdfPageStyles,
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
  summaryCardSub: {
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

function fmtCents(cents: number, currency: string): string {
  const val = (Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (cents < 0 ? '-' : '') + currency + ' ' + val;
}

interface ProjectProfitabilityProps {
  project: Project;
  invoices: Invoice[];
  expenses: Expense[];
  totalInvoiced: number;
  totalPaid: number;
  totalExpenses: number;
  net: number;
}

export function ProjectProfitabilityDocument({
  project,
  invoices,
  expenses,
  totalInvoiced,
  totalPaid,
  totalExpenses,
  net,
}: ProjectProfitabilityProps) {
  const currency = project.currency || 'USD';

  const fields = [
    { label: 'Project', value: project.title },
    { label: 'Status', value: project.status },
    { label: 'Billing Model', value: project.billingModel },
    { label: 'Budget', value: project.budgetCents ? fmtCents(project.budgetCents, currency) : 'Not set' },
    { label: 'Currency', value: currency },
    { label: 'Start Date', value: project.startDate || 'N/A' },
    { label: 'Target Completion', value: project.targetCompletionDate || 'N/A' },
  ];

  const budgetVsActual = project.budgetCents ? project.budgetCents - totalExpenses : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PdfHeader
          title={`${project.title} — Profitability Report`}
          subtitle="Project financial summary"
        />
        <PdfFooter />

        <PdfMetadataBlock fields={fields} />

        {/* Key metrics */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardLabel}>Invoiced</Text>
            <Text style={styles.summaryCardValue}>{fmtCents(totalInvoiced, currency)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardLabel}>Paid</Text>
            <Text style={[styles.summaryCardValue, { color: '#16a34a' }]}>
              {fmtCents(totalPaid, currency)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardLabel}>Expenses</Text>
            <Text style={[styles.summaryCardValue, { color: '#dc2626' }]}>
              {fmtCents(totalExpenses, currency)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardLabel}>Net</Text>
            <Text style={[
              styles.summaryCardValue,
              { color: net >= 0 ? '#16a34a' : '#dc2626' },
            ]}>
              {fmtCents(net, currency)}
            </Text>
          </View>
        </View>

        {/* Budget row */}
        {project.budgetCents && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryCardLabel}>Budget Remaining</Text>
              <Text style={[
                styles.summaryCardValue,
                { color: (budgetVsActual ?? 0) >= 0 ? '#16a34a' : '#dc2626' },
              ]}>
                {fmtCents(budgetVsActual ?? 0, currency)}
              </Text>
              <Text style={styles.summaryCardSub}>
                Budget {fmtCents(project.budgetCents, currency)} - Expenses {fmtCents(totalExpenses, currency)}
              </Text>
            </View>
          </View>
        )}

        {/* Collection rate */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCardLabel}>Collection Rate</Text>
            <Text style={styles.summaryCardValue}>
              {totalInvoiced > 0 ? `${((totalPaid / totalInvoiced) * 100).toFixed(0)}%` : 'N/A'}
            </Text>
            <Text style={styles.summaryCardSub}>
              {fmtCents(totalPaid, currency)} of {fmtCents(totalInvoiced, currency)} invoiced
            </Text>
          </View>
        </View>

        {/* Invoices table */}
        {invoices.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Invoices</Text>
            <PdfTable
              columns={[
                { header: 'Number', width: 2, render: (r: Invoice) => r.invoiceNumber },
                { header: 'Status', width: 1.5, render: (r: Invoice) => r.status },
                { header: 'Date', width: 1.5, render: (r: Invoice) => r.invoiceDate },
                { header: 'Total', width: 2, render: (r: Invoice) => fmtCents(r.totalCents, r.currency) },
                { header: 'Paid', width: 2, render: (r: Invoice) => fmtCents(r.paidCents, r.currency) },
              ]}
              rows={invoices}
            />
          </>
        )}

        {/* Expenses table */}
        {expenses.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Expenses</Text>
            <PdfTable
              columns={[
                { header: 'Date', width: 1.5, render: (r: Expense) => r.incurredOn },
                { header: 'Category', width: 2, render: (r: Expense) => r.category },
                { header: 'Vendor', width: 2, render: (r: Expense) => r.vendor ?? '' },
                { header: 'Description', width: 3, render: (r: Expense) => r.description },
                { header: 'Amount', width: 2, render: (r: Expense) => fmtCents(r.amountCents, r.currency) },
              ]}
              rows={expenses}
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
