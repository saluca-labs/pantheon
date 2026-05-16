/**
 * Research OS Phase 5 — experiment PDF export route.
 *
 * GET /api/tiresias/agentic-os/research/experiments/:id/export.pdf
 *   Renders a single-experiment reproducibility packet PDF:
 *   cover + counts + description, notebook timeline (last 50),
 *   hypotheses with predictions/falsifiers, references grouped by
 *   relevance, datasets table, pinned protocols.
 *
 *   Returns 400 when the experiment has zero notebook entries, zero
 *   hypotheses, zero datasets, AND zero protocols (truly empty — no
 *   content to export). Papers also count as content.
 *
 *   Filename: `<experiment-slug>-<YYYY-MM-DD>.pdf`.
 *   Audit `research.experiment.export.pdf`.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import * as React from 'react';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import { getExperiment } from '@/lib/agentic-os/research/repo';
import {
  experimentSlug,
  hasAnyExportContent,
} from '@/lib/agentic-os/research/experiments';
import { listNotebookEntriesForExperiment } from '@/lib/agentic-os/research/notebook-entries-repo';
import { listLinkedHypothesesForExperiment } from '@/lib/agentic-os/research/experiment-hypotheses-repo';
import { listPredictionsForHypothesis } from '@/lib/agentic-os/research/predictions-repo';
import type { Prediction } from '@/lib/agentic-os/research/predictions';
import { listFalsifiersForHypothesis } from '@/lib/agentic-os/research/falsifiers-repo';
import type { Falsifier } from '@/lib/agentic-os/research/falsifiers';
import { listReferencesForExperiment } from '@/lib/agentic-os/research/experiment-references-repo';
import { listOrderedAuthorsForPaper } from '@/lib/agentic-os/research/paper-authors-repo';
import type { OrderedAuthor } from '@/lib/agentic-os/research/paper-authors';
import { listDatasetsForExperiment } from '@/lib/agentic-os/research/datasets-repo';
import { listProtocolsForExperiment } from '@/lib/agentic-os/research/experiment-protocols-repo';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import { respondWithPdf } from '@/lib/agentic-os/_shared/blob-store';
import {
  ExperimentExportPdf,
  type ExperimentPdfHypothesisRow,
  type ExperimentPdfNotebookRow,
  type ExperimentPdfReferenceRow,
} from '@/lib/agentic-os/research/pdf/experiment-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

function statementOf(h: { ifClause?: string; thenClause?: string; becauseClause?: string }): string {
  const parts: string[] = [];
  if (h.ifClause) parts.push(`If ${h.ifClause}`);
  if (h.thenClause) parts.push(`then ${h.thenClause}`);
  if (h.becauseClause) parts.push(`because ${h.becauseClause}`);
  return parts.join(' · ');
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: experimentId } = await params;
  const experiment = await getExperiment(experimentId, user.userId);
  if (!experiment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Hydrate every content surface in parallel.
  const [notebookAll, linkedHypotheses, references, datasets, protocolPins] =
    await Promise.all([
      listNotebookEntriesForExperiment(experimentId, user.userId, { limit: 500 }),
      listLinkedHypothesesForExperiment(experimentId, user.userId),
      listReferencesForExperiment(experimentId, user.userId),
      listDatasetsForExperiment(experimentId, user.userId, { limit: 500 }),
      listProtocolsForExperiment(experimentId, user.userId),
    ]);

  const counts = {
    notebookEntries: notebookAll.length,
    hypotheses: linkedHypotheses.length,
    papers: references.length,
    datasets: datasets.length,
    protocols: protocolPins.length,
  };

  if (!hasAnyExportContent(counts)) {
    return NextResponse.json(
      { error: 'Experiment is empty — nothing to export.' },
      { status: 400 },
    );
  }

  // Notebook — last 50 by entry_at DESC (the list comes back already ordered DESC).
  const notebook: ExperimentPdfNotebookRow[] = notebookAll.slice(0, 50).map((n) => ({
    id: n.id,
    title: n.title,
    entryKind: n.entryKind,
    entryAt: n.entryAt,
    bodyMd: n.bodyMd,
  }));

  // Hypotheses — for each linked hypothesis, count + first-N predictions and falsifiers.
  const hypotheses: ExperimentPdfHypothesisRow[] = [];
  for (const lh of linkedHypotheses) {
    const h = lh.hypothesis;
    const [preds, fals] = await Promise.all([
      listPredictionsForHypothesis(h.id, user.userId).catch(() => []),
      listFalsifiersForHypothesis(h.id, user.userId).catch(() => []),
    ]);
    hypotheses.push({
      id: h.id,
      title: h.title,
      statement: statementOf(h),
      predictionCount: preds.length,
      topPredictions: preds.slice(0, 3).map((p: Prediction) => p.text ?? ''),
      falsifierCount: fals.length,
      topFalsifiers: fals.slice(0, 2).map((f: Falsifier) => f.text ?? ''),
    });
  }

  // References — hydrate paper title + authors string + venue/year + identifier.
  const refRows: ExperimentPdfReferenceRow[] = [];
  for (const r of references) {
    const paper = r.paper;
    let authors = paper.authorsText ?? '';
    if (!authors) {
      try {
        const ordered = await listOrderedAuthorsForPaper(paper.id, user.userId);
        if (Array.isArray(ordered) && ordered.length > 0) {
          authors = ordered
            .map((a: OrderedAuthor) => a?.author?.displayName ?? '')
            .filter(Boolean)
            .join(', ');
        }
      } catch {
        // Tolerate missing author hydration — fall back to authorsText.
      }
    }
    const venueYear = paper.venue
      ? paper.year != null
        ? `${paper.venue} ${paper.year}`
        : paper.venue
      : paper.year != null
        ? String(paper.year)
        : '';
    const identifier = paper.doi
      ? `doi:${paper.doi}`
      : paper.arxivId
        ? `arXiv:${paper.arxivId}`
        : paper.url ?? '';
    refRows.push({
      paperTitle: paper.title,
      authors,
      venueYear,
      identifier,
      relevance: r.link.relevance,
    });
  }

  // Datasets — direct map to PDF rows.
  const datasetRows = datasets.map((d) => ({
    id: d.id,
    name: d.name,
    kind: d.kind,
    version: d.version,
    url: d.url,
    archived: d.archived,
    checksum: d.checksum,
  }));

  // Protocols — use resolved content (the row whose version matches pinned_version).
  const protocolRows = protocolPins.map((p) => ({
    id: p.link.id,
    title: p.resolved.title,
    pinnedVersion: p.link.pinnedVersion,
    kind: p.resolved.kind,
    bodyMd: p.resolved.bodyMd,
  }));

  const buffer = await renderPdfToBuffer(
    React.createElement(ExperimentExportPdf, {
      header: {
        title: experiment.name,
        status: experiment.status,
        description: experiment.description ?? '',
        targetCompletionDate: experiment.targetCompletionDate,
        tags: experiment.tags ?? [],
      },
      counts,
      notebook,
      hypotheses,
      references: refRows,
      datasets: datasetRows,
      protocols: protocolRows,
    }),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = experimentSlug(experiment.name) || 'experiment';
  const filename = `${slug}-${stamp}.pdf`;

  await recordAudit({
    actorId: user.userId,
    action: 'research.experiment.export.pdf',
    payload: {
      experimentId,
      counts,
      notebookRendered: notebook.length,
      bytes: buffer.length,
    },
    projectId: experimentId,
  });

  return respondWithPdf({
    buffer,
    slug: 'research',
    tenantId: user.userId,
    key: `experiments/${experimentId}/export-${stamp}.pdf`,
    filename,
    disposition: 'attachment',
  });
}
