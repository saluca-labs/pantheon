/**
 * Maker OS — Project Export PDF template.
 *
 * Composes the shared `_shared/pdf` primitives (established in Filmmaker
 * Phase 6, reused by Cyber Phase 5) into a one-document build-packet that
 * a teammate (or a future-you) can hand-carry as a build's source of
 * truth: cover + phase progress, BOM, build steps, milestones, tools,
 * references.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
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
import type { MakerProject } from '../repo';
import type { BomSummary, BomSummaryRow } from '../bom';
import type { BuildStep } from '../steps';
import { stepStatus, STEP_STATUS_LABELS } from '../steps';
import type { BuildMilestone } from '../milestones';
import { milestoneStatus, MILESTONE_STATUS_LABELS } from '../milestones';
import type { ProjectToolJoined } from '../tools';
import { TOOL_KIND_LABELS } from '../tools';
import type { ProjectReferenceJoined } from '../references';
import { REFERENCE_KIND_LABELS } from '../references';
import {
  MAKER_PHASES,
  MAKER_PHASE_LABELS,
  PROJECT_STATUS_LABELS,
  projectPhaseAvg,
} from '../projects';

function formatCents(cents: number | null, currency: string): string {
  if (cents == null) return '—';
  const major = (cents / 100).toFixed(2);
  return `${currency} ${major}`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return value.slice(0, 10);
}

export interface ProjectExportPdfProps {
  project: MakerProject;
  bom: BomSummary | null;
  steps: BuildStep[];
  milestones: BuildMilestone[];
  tools: ProjectToolJoined[];
  references: ProjectReferenceJoined[];
  /** Optional fixed render time — defaults to now(). Tests inject. */
  generatedAt?: Date;
}

export function ProjectExportPdf({
  project,
  bom,
  steps,
  milestones,
  tools,
  references,
  generatedAt,
}: ProjectExportPdfProps): React.ReactElement {
  const avg = projectPhaseAvg(project.phaseProgress);

  // ─── Phase progress rows ───────────────────────────────────────────────
  const phaseRows = MAKER_PHASES.map((p) => ({
    label: MAKER_PHASE_LABELS[p],
    pct: project.phaseProgress[p] ?? 0,
  }));
  const phaseColumns: PdfTableColumnDef<typeof phaseRows[number]>[] = [
    { header: 'Phase', width: 0.55, render: (r) => r.label },
    { header: 'Progress', width: 0.25, render: (r) => `${r.pct}%` },
    {
      header: 'Bar',
      width: 0.2,
      render: (r) => {
        const filled = Math.round((r.pct / 100) * 10);
        return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
      },
    },
  ];

  // ─── BOM rows ──────────────────────────────────────────────────────────
  const bomRows: BomSummaryRow[] = bom?.rows ?? [];
  const bomColumns: PdfTableColumnDef<BomSummaryRow>[] = [
    {
      header: 'Part',
      width: 0.32,
      render: (r) =>
        r.variant
          ? `${r.catalog.name} (${r.variant.variantLabel})`
          : r.catalog.name,
    },
    { header: 'Mfr P/N', width: 0.18, render: (r) => r.catalog.mfgPartNumber ?? '—' },
    { header: 'Needed', width: 0.1, render: (r) => String(r.needed) },
    { header: 'On hand', width: 0.1, render: (r) => String(r.onHand) },
    { header: 'Deficit', width: 0.1, render: (r) => (r.deficit > 0 ? String(r.deficit) : '—') },
    {
      header: 'Est. cost',
      width: 0.2,
      render: (r) => formatCents(r.estCostCents, r.currency),
    },
  ];

  // ─── Build steps ───────────────────────────────────────────────────────
  const stepColumns: PdfTableColumnDef<BuildStep>[] = [
    { header: '#', width: 0.06, render: (s) => String(s.ordinal) },
    { header: 'Title', width: 0.42, render: (s) => s.title },
    {
      header: 'Status',
      width: 0.12,
      render: (s) => STEP_STATUS_LABELS[stepStatus(s)],
    },
    {
      header: 'Done',
      width: 0.18,
      render: (s) => formatDate(s.completedAt),
    },
    {
      header: 'Notes',
      width: 0.22,
      render: (s) => s.body ?? s.blockerText ?? '—',
    },
  ];

  // ─── Milestones ────────────────────────────────────────────────────────
  const today = generatedAt ?? new Date();
  const milestoneColumns: PdfTableColumnDef<BuildMilestone>[] = [
    { header: 'Milestone', width: 0.42, render: (m) => m.label },
    { header: 'Due', width: 0.18, render: (m) => formatDate(m.dueAt) },
    { header: 'Done', width: 0.18, render: (m) => formatDate(m.completedAt) },
    {
      header: 'Status',
      width: 0.22,
      render: (m) => MILESTONE_STATUS_LABELS[milestoneStatus(m, today)],
    },
  ];

  // ─── Tools ─────────────────────────────────────────────────────────────
  const toolColumns: PdfTableColumnDef<ProjectToolJoined>[] = [
    { header: 'Tool', width: 0.4, render: (t) => t.toolName },
    { header: 'Kind', width: 0.22, render: (t) => TOOL_KIND_LABELS[t.toolKind] },
    {
      header: 'Required',
      width: 0.18,
      render: (t) => (t.required ? 'Required' : 'Optional'),
    },
    { header: 'Status', width: 0.2, render: (t) => t.toolStatus },
  ];

  // ─── References ────────────────────────────────────────────────────────
  const referenceColumns: PdfTableColumnDef<ProjectReferenceJoined>[] = [
    { header: 'Title', width: 0.42, render: (r) => r.referenceTitle },
    {
      header: 'Kind',
      width: 0.13,
      render: (r) => REFERENCE_KIND_LABELS[r.referenceKind],
    },
    { header: 'Authors', width: 0.2, render: (r) => r.referenceAuthors ?? '—' },
    { header: 'URL', width: 0.25, render: (r) => r.referenceUrl },
  ];

  // ─── Meta block ────────────────────────────────────────────────────────
  const metaFields = [
    { label: 'Status', value: PROJECT_STATUS_LABELS[project.status] },
    { label: 'Progress', value: `${avg}%` },
    {
      label: 'Target',
      value: project.targetCompletionDate ?? '—',
    },
    {
      label: 'Team size',
      value: project.teamSize == null ? '—' : String(project.teamSize),
    },
    {
      label: 'Tags',
      value: project.tags.length > 0 ? project.tags.join(', ') : '—',
    },
    {
      label: 'BOM lines',
      value: String(bom?.linesCount ?? 0),
    },
    {
      label: 'Est. total',
      value: bom
        ? formatCents(bom.totalEstCostCents, bom.currency)
        : '—',
    },
    {
      label: 'Steps',
      value: String(steps.length),
    },
    {
      label: 'Milestones',
      value: String(milestones.length),
    },
    {
      label: 'Tools',
      value: String(tools.length),
    },
    {
      label: 'References',
      value: String(references.length),
    },
  ];

  return (
    <Document>
      <Page size="LETTER" style={PdfPageStyles.page}>
        <PdfHeader
          title={project.name}
          subtitle="Maker OS — Build packet"
          projectName="Generated by Pantheon Maker OS"
          generatedAt={generatedAt}
        />

        {project.description ? (
          <Text style={{ fontSize: 10, color: '#475569', marginBottom: 8 }}>
            {project.description}
          </Text>
        ) : null}

        <PdfMetadataBlock fields={metaFields} />

        {/* Phase progress */}
        <Text style={PdfPageStyles.sectionTitle}>Phase progress</Text>
        <PdfTable columns={phaseColumns} rows={phaseRows} />

        {/* BOM */}
        <Text style={PdfPageStyles.sectionTitle}>
          Bill of materials ({bomRows.length})
        </Text>
        {bomRows.length === 0 ? (
          <Text style={{ fontSize: 9, color: '#475569' }}>No BOM lines yet.</Text>
        ) : (
          <PdfTable columns={bomColumns} rows={bomRows} />
        )}

        {/* Steps */}
        <Text style={PdfPageStyles.sectionTitle}>Build steps ({steps.length})</Text>
        {steps.length === 0 ? (
          <Text style={{ fontSize: 9, color: '#475569' }}>No build steps yet.</Text>
        ) : (
          <PdfTable columns={stepColumns} rows={steps} />
        )}

        {/* Milestones */}
        <Text style={PdfPageStyles.sectionTitle}>
          Milestones ({milestones.length})
        </Text>
        {milestones.length === 0 ? (
          <Text style={{ fontSize: 9, color: '#475569' }}>No milestones yet.</Text>
        ) : (
          <PdfTable columns={milestoneColumns} rows={milestones} />
        )}

        {/* Tools */}
        <Text style={PdfPageStyles.sectionTitle}>Tools required ({tools.length})</Text>
        {tools.length === 0 ? (
          <Text style={{ fontSize: 9, color: '#475569' }}>No tools linked.</Text>
        ) : (
          <PdfTable columns={toolColumns} rows={tools} />
        )}

        {/* References */}
        <Text style={PdfPageStyles.sectionTitle}>
          References ({references.length})
        </Text>
        {references.length === 0 ? (
          <Text style={{ fontSize: 9, color: '#475569' }}>No references linked.</Text>
        ) : (
          <View>
            <PdfTable columns={referenceColumns} rows={references} />
          </View>
        )}

        <PdfFooter projectName={project.name} />
      </Page>
    </Document>
  );
}
