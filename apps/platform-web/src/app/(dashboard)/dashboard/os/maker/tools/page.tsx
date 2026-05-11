/**
 * Maker OS — Tools page (workshop-global list).
 *
 * Server component preloads the full tool list via `listTools` and hands it
 * to `ToolList`. The client component owns filter state and the compose form.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Wrench } from 'lucide-react';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { listTools } from '@/lib/agentic-os/maker/repo';
import { ToolList } from '@/components/agentic-os/maker/tool-list';

export const dynamic = 'force-dynamic';

export default async function MakerToolsPage() {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const tools = await listTools({ userId: user.userId });

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/maker"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Maker OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Wrench className="w-6 h-6 text-[#4361EE]" />
        <div>
          <h1 className="text-2xl font-semibold text-white">Tools &amp; maintenance</h1>
          <p className="text-sm text-[#94a3b8]">
            Workshop-global tools — track consumables, log maintenance, link to projects.
          </p>
        </div>
      </div>

      <ToolList initialTools={tools} />
    </div>
  );
}
