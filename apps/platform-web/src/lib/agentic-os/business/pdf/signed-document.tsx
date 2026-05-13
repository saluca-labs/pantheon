/**
 * Business OS Phase 6 — signed document PDF template.
 *
 * Renders a document with metadata, body text, and signature images
 * in a clean production-paperwork layout.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@/lib/agentic-os/_shared/pdf/primitives';
import {
  PdfPageStyles,
  PdfHeader,
  PdfFooter,
} from '@/lib/agentic-os/_shared/pdf/primitives';
import type { BusinessDocument } from '../documents';
import type { BusinessSignature } from '../signatures';

interface Props {
  document: BusinessDocument;
  signatures: BusinessSignature[];
}

const localStyles = StyleSheet.create({
  bodyText: {
    fontSize: 10,
    lineHeight: 1.6,
    color: '#1e293b',
    marginTop: 8,
    marginBottom: 8,
  },
  signatureBlock: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    paddingTop: 12,
  },
  signatureTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 8,
    color: '#0f172a',
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  signatureBox: {
    width: '45%',
    alignItems: 'center',
  },
  signatureImage: {
    width: 180,
    height: 60,
    objectFit: 'contain',
    marginBottom: 4,
  },
  signatureName: {
    fontSize: 9,
    color: '#0f172a',
    marginTop: 4,
  },
  signatureMeta: {
    fontSize: 7,
    color: '#64748b',
    marginTop: 2,
  },
  documentMetaItem: {
    flexDirection: 'row',
    marginBottom: 4,
    gap: 4,
  },
  documentMetaLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: '#475569',
    width: 80,
  },
  documentMetaValue: {
    fontSize: 9,
    color: '#1e293b',
    flex: 1,
  },
});

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' ');
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
  declined: 'Declined',
  expired: 'Expired',
};

export function SignedDocumentPdf({
  document,
  signatures,
}: Props): React.ReactElement {
  const generatedAt = new Date();

  return (
    <Document>
      <Page size="A4" style={PdfPageStyles.page}>
        <PdfHeader
          title={document.title}
          subtitle={`Generated ${generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`}
        />

        {/* Metadata block */}
        <View style={{ marginBottom: 16 }}>
          <View style={localStyles.documentMetaItem}>
            <Text style={localStyles.documentMetaLabel}>Status</Text>
            <Text style={localStyles.documentMetaValue}>
              {STATUS_LABELS[document.status] ?? document.status}
            </Text>
          </View>
          <View style={localStyles.documentMetaItem}>
            <Text style={localStyles.documentMetaLabel}>Created</Text>
            <Text style={localStyles.documentMetaValue}>
              {fmtDateTime(document.createdAt)}
            </Text>
          </View>
          <View style={localStyles.documentMetaItem}>
            <Text style={localStyles.documentMetaLabel}>Sent</Text>
            <Text style={localStyles.documentMetaValue}>
              {fmtDate(document.sentAt)}
            </Text>
          </View>
          <View style={localStyles.documentMetaItem}>
            <Text style={localStyles.documentMetaLabel}>Signed</Text>
            <Text style={localStyles.documentMetaValue}>
              {fmtDate(document.signedAt)}
            </Text>
          </View>
        </View>

        {/* Counterparty section */}
        {signatures.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={PdfPageStyles.sectionTitle}>Signatories</Text>
            {signatures.map((sig) => (
              <View
                key={sig.id}
                style={{
                  flexDirection: 'row',
                  marginBottom: 4,
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 9, color: '#0f172a', width: 100 }}>
                  {sig.signerRole.charAt(0).toUpperCase() + sig.signerRole.slice(1)}
                </Text>
                <Text style={{ fontSize: 9, color: '#475569', flex: 1 }}>
                  {sig.signerName}
                </Text>
                <Text style={{ fontSize: 8, color: '#64748b', width: 100 }}>
                  {fmtDate(sig.signedAt)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Body section */}
        <View style={{ marginTop: 16 }}>
          <Text style={PdfPageStyles.sectionTitle}>Document Body</Text>
          <Text style={localStyles.bodyText}>{document.bodyMd}</Text>
        </View>

        {/* Signature images */}
        {signatures.length > 0 && (
          <View style={localStyles.signatureBlock}>
            <Text style={localStyles.signatureTitle}>Signatures</Text>
            <View style={localStyles.signatureRow}>
              {signatures.map((sig) => (
                <View key={sig.id} style={localStyles.signatureBox}>
                  <Image
                    src={sig.signatureImageUrl}
                    style={localStyles.signatureImage}
                  />
                  <Text style={localStyles.signatureName}>
                    {sig.signerName}
                  </Text>
                  <Text style={localStyles.signatureMeta}>
                    {sig.signerRole} — {fmtDate(sig.signedAt)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <PdfFooter projectName="Generated by Pantheon Business OS" />
      </Page>
    </Document>
  );
}
