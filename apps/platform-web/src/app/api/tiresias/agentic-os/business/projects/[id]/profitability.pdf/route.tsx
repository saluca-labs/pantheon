/**
 * Business OS Phase 5 — project profitability PDF export route.
 *
 * GET /api/tiresias/agentic-os/business/projects/[id]/profitability.pdf
 *
 * @license MIT — Tiresias Business OS Phase 5 (internal).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { recordAudit } from '@/lib/agentic-os/business/repo';
import { getProject } from '@/lib/agentic-os/business/projects-repo';
import { listInvoices } from '@/lib/agentic-os/business/invoices-repo';
import { listExpenses } from '@/lib/agentic-os/business/expenses-repo';
import { ProjectProfitabilityDocument } from '@/lib/agentic-os/business/pdf/project-profitability';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import { respondWithPdf } from '@/lib/agentic-os/_shared/blob-store';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const project = await getProject(id, user.userId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const [invoices, expenses] = await Promise.all([
    listInvoices(user.userId, { projectId: id, limit: 500 }),
    listExpenses(user.userId, { projectId: id, limit: 500 }),
  ]);

  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalCents, 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + inv.paidCents, 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amountCents, 0);
  const net = totalPaid - totalExpenses;

  const buf = await renderPdfToBuffer(
    React.createElement(ProjectProfitabilityDocument, {
      project,
      invoices,
      expenses,
      totalInvoiced,
      totalPaid,
      totalExpenses,
      net,
    }),
  );

  await recordAudit({
    actorId: user.userId,
    action: 'business.project.profitability.export.pdf',
    payload: { projectId: id },
  });

  const slug = project.slug || 'project';
  return respondWithPdf({
    buffer: buf,
    slug: 'business',
    tenantId: user.userId,
    key: `projects/${id}/profitability.pdf`,
    filename: `${slug}-profitability.pdf`,
    disposition: 'inline',
  });
}
