/**
 * Maker OS — Tool detail page.
 *
 * Loads the tool, its consumables, its maintenance event log, and the list
 * of projects linking to it. All hand-off to client-side `ToolDetail` for
 * interactive editing.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import 'server-only';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  getTool,
  listConsumables,
  listMaintenanceEvents,
  listProjectsUsingTool,
  listSpecSheets,
} from '@/lib/agentic-os/maker/repo';
import { ToolDetail } from '@/components/agentic-os/maker/tool-detail';
import { SpecSheetList } from '@/components/agentic-os/maker/spec-sheet-list';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ toolId: string }>;
}

export default async function MakerToolDetailPage({ params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const { toolId } = await params;
  const tool = await getTool(toolId, user.userId);
  if (!tool) notFound();

  const [consumables, events, projectsUsing, specSheets] = await Promise.all([
    listConsumables(toolId, user.userId),
    listMaintenanceEvents(toolId, user.userId),
    listProjectsUsingTool(toolId, user.userId),
    listSpecSheets({ userId: user.userId, toolId }),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <Link
        href="/dashboard/os/maker/tools"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to tools
      </Link>

      <ToolDetail
        tool={tool}
        initialConsumables={consumables}
        initialMaintenance={events}
        projectsUsing={projectsUsing}
      />

      <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
          Spec sheets
        </h3>
        <SpecSheetList
          scope={{ kind: 'tool', toolId }}
          initialSheets={specSheets}
        />
      </div>
    </div>
  );
}
