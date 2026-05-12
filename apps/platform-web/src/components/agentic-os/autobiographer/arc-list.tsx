/**
 * Autobiographer OS — ArcList.
 *
 * Renders the per-book arc list section. Composes ArcCard rows and a
 * NewArcButton CTA. Resolves chapter counts inline via a server-side
 * SQL on the join table so the cards render without a client fetch.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 5 (internal).
 */

import { getAutobiographerPool } from '@/lib/agentic-os/autobiographer/session';
import type { AutobiographerArc } from '@/lib/agentic-os/autobiographer/arcs-repo';
import { ArcCard } from './arc-card';
import { NewArcButton } from './new-arc-button';
import { ArcChapterList } from './arc-chapter-list';

async function chapterCountByArc(
  arcIds: readonly string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (arcIds.length === 0) return map;
  const pool = getAutobiographerPool();
  const r = await pool.query(
    `SELECT arc_id, COUNT(*)::int AS n
       FROM agos_autobiographer_arc_chapters
      WHERE arc_id = ANY($1::uuid[])
      GROUP BY arc_id`,
    [Array.from(new Set(arcIds))],
  );
  for (const row of r.rows) map.set(String(row.arc_id), Number(row.n));
  return map;
}

export interface ArcListProps {
  bookId: string;
  arcs: AutobiographerArc[];
}

export async function ArcList({ bookId, arcs }: ArcListProps) {
  const counts = await chapterCountByArc(arcs.map((a) => a.id));

  return (
    <div className="space-y-3">
      <NewArcButton bookId={bookId} />
      {arcs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#2a2d3e] bg-[#1a1d27]/50 p-6 text-center text-sm text-[#94a3b8]">
          No arcs yet. Create one to define a custom chapter ordering for
          this book — or stick with the default position order.
        </div>
      ) : (
        arcs.map((a) => (
          <details
            key={a.id}
            className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27]/50 group"
          >
            <summary className="list-none cursor-pointer">
              <ArcCard
                arc={{
                  id: a.id,
                  title: a.title,
                  kind: a.kind,
                  description: a.description,
                  isPrimary: a.isPrimary,
                  chapterCount: counts.get(a.id) ?? 0,
                }}
              />
            </summary>
            <div className="border-t border-[#2a2d3e] p-3 bg-[#0f1117]/40">
              <ArcChapterList arcId={a.id} bookId={bookId} />
            </div>
          </details>
        ))
      )}
    </div>
  );
}
