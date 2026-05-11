/**
 * Agentic OS — shared PDF primitives.
 *
 * Re-exports the base elements from `@react-pdf/renderer` and provides
 * a small library of styled wrappers every per-OS PDF template uses:
 * standard header/footer, key/value metadata block, simple table.
 *
 * Templates compose these into a `<Document>` and hand the tree to
 * `renderPdfToBuffer()` from `./render`.
 *
 * @license MIT — Tiresias Agentic OS shared primitive.
 */

import * as React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';

export { Document, Page, View, Text, Image, StyleSheet, Font };

/**
 * Default page style sheet used by all OS PDFs.
 * Margins follow standard production-paperwork (~0.5in / 36pt).
 */
export const PdfPageStyles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#0f172a',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
    paddingBottom: 6,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 700,
  },
  headerSubtitle: {
    fontSize: 9,
    color: '#475569',
    marginTop: 2,
  },
  headerMeta: {
    fontSize: 9,
    color: '#475569',
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    left: 36,
    right: 36,
    bottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#64748b',
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    paddingTop: 4,
  },
  metaBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 2,
    padding: 6,
    marginBottom: 10,
  },
  metaCell: {
    width: '50%',
    paddingVertical: 2,
    paddingRight: 6,
    flexDirection: 'row',
  },
  metaLabel: {
    fontSize: 8,
    color: '#475569',
    width: 80,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: 9,
    flex: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
    paddingBottom: 3,
    marginBottom: 3,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: 700,
    textTransform: 'uppercase',
    color: '#0f172a',
    paddingRight: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
  },
  tableCell: {
    fontSize: 9,
    paddingRight: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginTop: 10,
    marginBottom: 4,
    color: '#0f172a',
  },
});

export interface PdfHeaderProps {
  title: string;
  subtitle?: string | null;
  projectName?: string | null;
  generatedAt?: Date;
}

export function PdfHeader({
  title,
  subtitle,
  projectName,
  generatedAt,
}: PdfHeaderProps): React.ReactElement {
  const stamp = (generatedAt ?? new Date()).toISOString().slice(0, 16).replace('T', ' ');
  return (
    <View style={PdfPageStyles.headerRow} fixed>
      <View>
        <Text style={PdfPageStyles.headerTitle}>{title}</Text>
        {subtitle ? (
          <Text style={PdfPageStyles.headerSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      <View>
        {projectName ? (
          <Text style={PdfPageStyles.headerMeta}>{projectName}</Text>
        ) : null}
        <Text style={PdfPageStyles.headerMeta}>Generated {stamp} UTC</Text>
      </View>
    </View>
  );
}

export interface PdfFooterProps {
  projectName?: string | null;
}

export function PdfFooter({ projectName }: PdfFooterProps): React.ReactElement {
  return (
    <View style={PdfPageStyles.footer} fixed>
      <Text>{projectName ?? ''}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

export interface PdfMetadataField {
  label: string;
  value: string;
}

export interface PdfMetadataBlockProps {
  fields: PdfMetadataField[];
}

export function PdfMetadataBlock({
  fields,
}: PdfMetadataBlockProps): React.ReactElement {
  return (
    <View style={PdfPageStyles.metaBlock}>
      {fields.map((f, i) => (
        <View key={`${f.label}-${i}`} style={PdfPageStyles.metaCell}>
          <Text style={PdfPageStyles.metaLabel}>{f.label}</Text>
          <Text style={PdfPageStyles.metaValue}>{f.value || '—'}</Text>
        </View>
      ))}
    </View>
  );
}

export interface PdfTableColumnDef<Row> {
  header: string;
  /** Column width as fraction (0..1) of the row. */
  width: number;
  render: (row: Row) => string;
}

export interface PdfTableProps<Row> {
  columns: PdfTableColumnDef<Row>[];
  rows: Row[];
}

export function PdfTable<Row>({
  columns,
  rows,
}: PdfTableProps<Row>): React.ReactElement {
  const totalWidth = columns.reduce((s, c) => s + c.width, 0) || 1;
  return (
    <View>
      <View style={PdfPageStyles.tableHeader} fixed>
        {columns.map((c, i) => (
          <Text
            key={`h-${i}`}
            style={[
              PdfPageStyles.tableHeaderCell,
              { width: `${(c.width / totalWidth) * 100}%` },
            ]}
          >
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={`r-${ri}`} style={PdfPageStyles.tableRow} wrap={false}>
          {columns.map((c, ci) => (
            <Text
              key={`c-${ri}-${ci}`}
              style={[
                PdfPageStyles.tableCell,
                { width: `${(c.width / totalWidth) * 100}%` },
              ]}
            >
              {c.render(row)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
