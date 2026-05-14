/**
 * Maker OS — Workshop-global references library page.
 *
 * SSR-loads every reference the operator owns. Links to projects are
 * managed from the project hub References tab.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import 'server-only';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { listReferences } from '@/lib/agentic-os/maker/repo';
import { ReferenceList } from '@/components/agentic-os/maker/reference-list';

export const dynamic = 'force-dynamic';

export default async function MakerReferencesPage() {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const refs = await listReferences({ userId: user.userId });

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/os/maker"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Maker OS
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-semibold text-white">References</h1>
        </div>
        <p className="text-sm text-text-secondary">
          Workshop-global library of papers, tutorials, standards, articles, videos,
          books, and bare links. Open a project to link references from this library
          to a specific build.
        </p>
      </div>

      <ReferenceList initialReferences={refs} />
    </div>
  );
}
