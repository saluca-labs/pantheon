/**
 * Research OS Phase 5 — Workshop-global protocols library.
 *
 * Lists ROOT protocol rows (one card per tree) with filter chips
 * (kind + tag), search across title, and an inline Add-protocol
 * affordance.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import { listProtocols } from '@/lib/agentic-os/research/protocols-repo';
import { ProtocolList } from '@/components/agentic-os/research/protocol-list';

export const dynamic = 'force-dynamic';

export default async function ProtocolsLibraryPage() {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');

  const protocols = await listProtocols(user.userId, { limit: 200 });

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/research"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Research OS
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <FileText className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Protocols library</h1>
      </div>

      <p className="text-sm text-[#94a3b8] mb-6">
        Workshop-global protocols, methods, SOPs, and analysis pipelines with
        version-history self-reference. Pin a protocol to an experiment at a
        frozen version string — the experiment stays reproducible against the
        methods doc even when it evolves later.
      </p>

      <ProtocolList initialProtocols={protocols} />
    </div>
  );
}
