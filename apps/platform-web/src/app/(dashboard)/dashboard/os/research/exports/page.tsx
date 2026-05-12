/**
 * Research OS Phase 5 — Reproducibility export landing page.
 *
 * Thin landing page that queries the audit log for
 * `research.experiment.export.pdf` events keyed to the current user and
 * lists the most-recent N. Each row deep-links to the experiment so the
 * user can re-trigger the download from the experiment header.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import 'server-only';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileDown } from 'lucide-react';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { getResearchPool } from '@/lib/agentic-os/research/session';
import { getExperiment } from '@/lib/agentic-os/research/repo';

export const dynamic = 'force-dynamic';

interface RecentExport {
  experimentId: string;
  experimentName: string;
  createdAt: string;
  notebookRendered: number;
  bytes: number;
}

async function loadRecentExports(userId: string, limit = 25): Promise<RecentExport[]> {
  const pool = getResearchPool();
  const r = await pool.query(
    `SELECT a.id, a.project_id, a.payload, a.created_at
       FROM agos_audit a
      WHERE a.os_slug = 'research'
        AND a.action  = 'research.experiment.export.pdf'
        AND a.actor_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  const out: RecentExport[] = [];
  for (const row of r.rows) {
    const experimentId =
      (row.project_id as string | null) ??
      ((row.payload?.experimentId as string | undefined) ?? null);
    if (!experimentId) continue;
    const experiment = await getExperiment(experimentId, userId).catch(() => null);
    if (!experiment) continue;
    const payload = (row.payload as Record<string, unknown>) ?? {};
    out.push({
      experimentId,
      experimentName: experiment.name,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      notebookRendered: Number(payload.notebookRendered ?? 0),
      bytes: Number(payload.bytes ?? 0),
    });
  }
  return out;
}

function formatBytes(b: number): string {
  if (b <= 0) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export default async function ExportsLandingPage() {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');
  const recent = await loadRecentExports(user.userId, 25);

  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/os/research"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Research OS
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <FileDown className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Reproducibility exports</h1>
      </div>

      <p className="text-sm text-[#94a3b8] mb-6">
        Each row below is a previous PDF export. To create a new one, open an
        experiment and click <strong>Export PDF</strong> in the header. Empty
        experiments are refused — there must be notebook entries, hypotheses,
        papers, datasets, or protocols.
      </p>

      {recent.length === 0 ? (
        <p
          className="text-sm text-[#94a3b8] italic py-6 text-center rounded-lg border border-[#2a2d3e] bg-[#1a1d27]"
          data-testid="exports-empty"
        >
          No exports yet. Open an experiment and click Export PDF to record one.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="exports-list">
          {recent.map((e, i) => (
            <li
              key={`${e.experimentId}-${i}`}
              className="rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-4 flex items-center justify-between gap-3 flex-wrap"
              data-testid={`exports-row-${i}`}
            >
              <div className="flex-1 min-w-0">
                <Link
                  href={`/dashboard/os/research/experiments/${e.experimentId}`}
                  className="text-sm font-semibold text-white hover:underline truncate block"
                >
                  {e.experimentName}
                </Link>
                <div className="text-xs text-[#94a3b8] flex flex-wrap gap-x-3 gap-y-1 mt-1">
                  <span>{e.createdAt.slice(0, 19).replace('T', ' ')} UTC</span>
                  <span>{e.notebookRendered} notebook rows rendered</span>
                  <span>{formatBytes(e.bytes)}</span>
                </div>
              </div>
              <Link
                href={`/dashboard/os/research/experiments/${e.experimentId}`}
                className="inline-flex items-center gap-1 text-xs text-[#4361EE] hover:underline"
              >
                <FileDown className="w-3.5 h-3.5" />
                Open experiment
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
