/**
 * Research OS Phase 3 — evidence collection route.
 *
 * `GET  /api/tiresias/agentic-os/research/hypotheses/:id/evidence`
 *   List evidence rows for the hypothesis (ascending by created_at).
 *
 * `POST /api/tiresias/agentic-os/research/hypotheses/:id/evidence`
 *   Create a new evidence link. Body: { polarity, sourceKind,
 *   sourceId?, sourceUrl?, notes?, metadata? }.
 *
 *   Validation contract:
 *     - sourceKind = 'external_url'                    => sourceUrl required
 *     - sourceKind in (notebook_entry, paper, dataset) => sourceId required
 *     - sourceKind = 'free_text'                       => notes required
 *
 * Audited as `research.evidence.linked`.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { recordAudit } from '@/lib/agentic-os/research/repo';
import { isHypothesisOwnedByUser } from '@/lib/agentic-os/research/predictions-repo';
import {
  listEvidenceForHypothesis,
  createEvidence,
} from '@/lib/agentic-os/research/evidence-repo';
import {
  EVIDENCE_POLARITIES,
  EVIDENCE_SOURCE_KINDS,
  validateEvidenceInput,
  type EvidencePolarity,
  type EvidenceSourceKind,
} from '@/lib/agentic-os/research/evidence';

const CreateBody = z.object({
  polarity: z.enum(EVIDENCE_POLARITIES as unknown as [string, ...string[]]),
  sourceKind: z.enum(EVIDENCE_SOURCE_KINDS as unknown as [string, ...string[]]),
  sourceId: z.string().uuid().nullable().optional(),
  sourceUrl: z.string().max(4000).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: hypothesisId } = await params;
  const owned = await isHypothesisOwnedByUser(hypothesisId, user.userId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const evidence = await listEvidenceForHypothesis(hypothesisId, user.userId);
  return NextResponse.json({ evidence });
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: hypothesisId } = await params;
  const owned = await isHypothesisOwnedByUser(hypothesisId, user.userId);
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', detail: parsed.error.flatten() }, { status: 400 });
  }

  // Source-kind discriminator validation (route layer enforces; the DB
  // CHECK only covers the enum membership, not the conditional fields).
  const semanticErrors = validateEvidenceInput({
    polarity: parsed.data.polarity,
    sourceKind: parsed.data.sourceKind,
    sourceId: parsed.data.sourceId,
    sourceUrl: parsed.data.sourceUrl,
    notes: parsed.data.notes,
  });
  if (semanticErrors.length > 0) {
    return NextResponse.json(
      { error: 'Invalid body', detail: { fieldErrors: semanticErrors } },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const evidence = await createEvidence(hypothesisId, user.userId, {
    polarity: d.polarity as EvidencePolarity,
    sourceKind: d.sourceKind as EvidenceSourceKind,
    sourceId: d.sourceId ?? null,
    sourceUrl: d.sourceUrl ?? null,
    notes: d.notes ?? null,
    metadata: d.metadata,
  });

  await recordAudit({
    actorId: user.userId,
    action: 'research.evidence.linked',
    payload: {
      evidenceId: evidence.id,
      hypothesisId,
      polarity: evidence.polarity,
      sourceKind: evidence.sourceKind,
    },
  });

  return NextResponse.json({ evidence }, { status: 201 });
}
