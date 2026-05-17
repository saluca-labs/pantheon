import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "pantheon-portal",
      mode: process.env.PANTHEON_DEPLOY_MODE || process.env.TIRESIAS_DEPLOY_MODE || "local",
      version: process.env.NEXT_PUBLIC_APP_VERSION || "unknown",
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
