/**
 * Maker OS — Workshop-global spec sheets list page.
 *
 * SSR-loads every spec sheet the operator owns, regardless of attachment.
 * The list is filterable client-side by attachment / kind / tag.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import 'server-only';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { listSpecSheets } from '@/lib/agentic-os/maker/repo';
import { SpecSheetList } from '@/components/agentic-os/maker/spec-sheet-list';

export const dynamic = 'force-dynamic';

export default async function MakerSpecSheetsPage() {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const sheets = await listSpecSheets({ userId: user.userId });

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/maker"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Maker OS
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-6 h-6 text-[#4361EE]" />
          <h1 className="text-2xl font-semibold text-white">Spec sheets</h1>
        </div>
        <p className="text-sm text-[#94a3b8]">
          Datasheets, drawings, manuals, and compliance certificates attached to a
          part, tool, or project. URL-only — link to your cloud drive, vendor site,
          or external host.
        </p>
      </div>

      <SpecSheetList scope={{ kind: 'workshop' }} initialSheets={sheets} />
    </div>
  );
}
