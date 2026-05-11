/**
 * Maker OS — /api/tiresias/agentic-os/maker/builds (legacy 308 proxy)
 *
 * Phase 1 (v0.1.29) renamed `agos_maker_builds` to `agos_maker_projects` and
 * lifted the route to `/api/tiresias/agentic-os/maker/projects`. This handler
 * stays for one release so any cached clients (browsers, scripts) get a 308
 * permanent redirect with the rewritten path.
 *
 * Remove in Phase 2.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';

const TARGET = '/api/tiresias/agentic-os/maker/projects';

function redirect(request: NextRequest): NextResponse {
  const url = new URL(request.url);
  url.pathname = TARGET;
  return NextResponse.redirect(url, 308);
}

export async function GET(request: NextRequest) {
  return redirect(request);
}

export async function POST(request: NextRequest) {
  return redirect(request);
}

export async function PATCH(request: NextRequest) {
  return redirect(request);
}

export async function DELETE(request: NextRequest) {
  return redirect(request);
}
