/**
 * Maker OS — /api/tiresias/agentic-os/maker/builds/[buildId]/parts
 *                                          (legacy 308 proxy)
 *
 * Phase 1 (v0.1.29) lifted parts to `…/maker/projects/[id]/parts`. This
 * handler is a thin 308 redirect for one release.
 *
 * Remove in Phase 2.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';

interface Props {
  params: Promise<{ buildId: string }>;
}

async function redirect(request: NextRequest, params: Props['params']): Promise<NextResponse> {
  const { buildId } = await params;
  const url = new URL(request.url);
  url.pathname = `/api/tiresias/agentic-os/maker/projects/${buildId}/parts`;
  return NextResponse.redirect(url, 308);
}

export async function GET(request: NextRequest, ctx: Props) {
  return redirect(request, ctx.params);
}

export async function POST(request: NextRequest, ctx: Props) {
  return redirect(request, ctx.params);
}

export async function PATCH(request: NextRequest, ctx: Props) {
  return redirect(request, ctx.params);
}

export async function DELETE(request: NextRequest, ctx: Props) {
  return redirect(request, ctx.params);
}
