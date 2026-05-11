/**
 * CyberSec OS — Vulnerability Exposure Report PDF template.
 *
 * Composed from the OS-agnostic `_shared/pdf` primitives (Filmmaker Phase 6).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import * as React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  PdfHeader,
  PdfFooter,
  PdfMetadataBlock,
  PdfTable,
  PdfPageStyles,
  type PdfTableColumnDef,
} from '../../_shared/pdf/primitives';
import type { ExposureWithRefs } from '../exposures';
import {
  VULNERABILITY_SEVERITIES,
  type VulnerabilitySeverity,
} from '../vulnerabilities';
import type { TrendsPayload } from '../repo';

interface ExposureReportPdfProps {
  user: { email?: string | null; displayName?: string | null };
  exposures: ExposureWithRefs[];
  stats: Pick<
    TrendsPayload,
    | 'exposuresMttrDays'
    | 'exposuresOpen'
    | 'exposuresClosedLast30d'
    | 'openVulnsBySeverity'
  >;
}

const SEV_ORDER: Record<VulnerabilitySeverity, number> = Object.fromEntries(
  VULNERABILITY_SEVERITIES.map((s) => [s.value, s.order]),
) as Record<VulnerabilitySeverity, number>;

function groupBySeverity(
  exposures: ExposureWithRefs[],
): { severity: VulnerabilitySeverity; rows: ExposureWithRefs[] }[] {
  const groups = new Map<VulnerabilitySeverity, ExposureWithRefs[]>();
  for (const e of exposures) {
    const sev = (e.vulnerabilitySeverity as VulnerabilitySeverity) || 'medium';
    if (!groups.has(sev)) groups.set(sev, []);
    groups.get(sev)!.push(e);
  }
  return Array.from(groups.entries())
    .map(([severity, rows]) => ({ severity, rows }))
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export function ExposureReportPdf({
  user,
  exposures,
  stats,
}: ExposureReportPdfProps): React.ReactElement {
  const tenant = user.displayName?.trim() || user.email?.trim() || 'Tenant';
  const grouped = groupBySeverity(exposures);

  const total = exposures.length;
  const closed = exposures.filter((e) =>
    ['resolved', 'mitigated', 'false_positive'].includes(e.status),
  ).length;
  const open = total - closed;
  const mttr =
    stats.exposuresMttrDays != null ? stats.exposuresMttrDays.toFixed(1) : '—';

  const counts = new Map<string, number>(
    stats.openVulnsBySeverity.map((row) => [row.severity, row.count]),
  );

  const columns: PdfTableColumnDef<ExposureWithRefs>[] = [
    { header: 'CVE',        width: 0.12, render: (e) => e.vulnerabilityCveId ?? '—' },
    { header: 'Title',      width: 0.28, render: (e) => e.vulnerabilityTitle ?? '—' },
    { header: 'Asset',      width: 0.16, render: (e) => e.assetName ?? '—' },
    { header: 'Status',     width: 0.10, render: (e) => e.status },
    { header: 'Priority',   width: 0.07, render: (e) => e.priority },
    { header: 'Detected',   width: 0.13, render: (e) => formatDate(e.detectedAt) },
    { header: 'Assignee',   width: 0.14, render: (e) => e.assignedTo ?? '—' },
  ];

  return (
    <Document>
      <Page size="LETTER" style={PdfPageStyles.page}>
        <PdfHeader
          title="Vulnerability Exposure Report"
          subtitle={`Open exposures ${open} · Closed ${closed} · MTTR ${mttr} days`}
          projectName={tenant}
        />

        <PdfMetadataBlock
          fields={[
            { label: 'Tenant',       value: tenant },
            { label: 'Total exp.',   value: String(total) },
            { label: 'Open',         value: String(open) },
            { label: 'Closed',       value: String(closed) },
            { label: 'MTTR (days)',  value: mttr },
            { label: 'Closed (30d)', value: String(stats.exposuresClosedLast30d) },
            { label: 'Critical vuln', value: String(counts.get('critical') ?? 0) },
            { label: 'High vuln',    value: String(counts.get('high') ?? 0) },
            { label: 'Medium vuln',  value: String(counts.get('medium') ?? 0) },
            { label: 'Low vuln',     value: String(counts.get('low') ?? 0) },
          ]}
        />

        {grouped.length === 0 ? (
          <View>
            <Text style={{ fontSize: 10, color: '#475569' }}>
              No exposures in scope.
            </Text>
          </View>
        ) : (
          grouped.map(({ severity, rows }) => (
            <View key={severity}>
              <Text style={PdfPageStyles.sectionTitle}>
                {severity.toUpperCase()} ({rows.length})
              </Text>
              <PdfTable columns={columns} rows={rows} />
            </View>
          ))
        )}

        <PdfFooter projectName={tenant} />
      </Page>
    </Document>
  );
}
