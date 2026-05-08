/**
 * Maker OS — My Builds page.
 *
 * Server component: loads the authenticated user's build list and hands it
 * to the BuildsManager client component for interactive CRUD.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import Link from 'next/link';
import { ArrowLeft, Wrench } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { listBuilds } from '@/lib/agentic-os/maker/repo';
import { BuildsManager } from '@/components/agentic-os/maker/BuildsManager';

export const dynamic = 'force-dynamic';

export default async function MakerBuildsPage() {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const builds = await listBuilds(user.userId);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/maker"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Maker OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Wrench className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">My Builds</h1>
      </div>

      <p className="text-sm text-[#94a3b8] mb-6">
        Track your hardware, electronics, and fabrication projects. Each build has a parts
        inventory so you know exactly what you have and what you still need to order.
      </p>

      <BuildsManager initialBuilds={builds} />
    </div>
  );
}
