/**
 * Maker OS — /api/tiresias/agentic-os/maker/projects/[id]/tools
 *
 * GET  — list tools attached to a project. Returns the joined view
 *        (toolName/toolKind/toolStatus + required + notes).
 * POST — attach a tool to a project. Both project and tool must belong to
 *        the requesting user. Duplicate links return 409 (handled via the
 *        Postgres unique constraint on (project_id, tool_id)).
 *
 * Auth + audit on every handler.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import {
  listToolsForProject,
  attachToolToProject,
  recordAudit,
} from '@/lib/agentic-os/maker/repo';

const AttachBody = z.object({
  toolId: z.string().uuid(),
  required: z.boolean().optional(),
  notes: z.string().max(8000).nullable().optional(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;
  try {
    const tools = await listToolsForProject(projectId, user.userId);
    return NextResponse.json({ tools });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not found' },
      { status: 404 },
    );
  }
}

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentMakerUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: projectId } = await params;

  const parsed = AttachBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const link = await attachToolToProject(
      projectId,
      parsed.data.toolId,
      user.userId,
      { required: parsed.data.required, notes: parsed.data.notes },
    );
    await recordAudit({
      actorId: user.userId,
      action: 'maker.project.tool.attached',
      payload: {
        projectId,
        toolId: parsed.data.toolId,
        required: link.required,
      },
      projectId,
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to attach tool';
    // Postgres unique violation (23505) on (project_id, tool_id).
    const lower = msg.toLowerCase();
    if (
      lower.includes('duplicate key') ||
      lower.includes('unique constraint') ||
      lower.includes('agos_maker_project_tools_project_tool_unique')
    ) {
      return NextResponse.json(
        { error: 'Tool already attached to this project' },
        { status: 409 },
      );
    }
    if (lower.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
