/**
 * Autobiographer OS — workshop-global people roster page.
 *
 * Surfaces every person the user has captured with client-side filters on
 * consent state and a name+alias search. "Add person" CTA opens the
 * PersonForm in create mode.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Users } from 'lucide-react';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { listPeople } from '@/lib/agentic-os/autobiographer/people-repo';
import { PersonList } from '@/components/agentic-os/autobiographer/person-list';
import { PersonActions } from '@/components/agentic-os/autobiographer/person-edit-button';

export const dynamic = 'force-dynamic';

export default async function AutobiographerPeoplePage() {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');

  const people = await listPeople({ userId: user.userId, limit: 200 });

  const cards = people.map((p) => ({
    id: p.id,
    canonicalName: p.canonicalName,
    aliases: p.aliases,
    relation: p.relation,
    birthYear: p.birthYear,
    deathYear: p.deathYear,
    consentToPublish: p.consentToPublish,
    imageUrl: p.imageUrl,
    notes: p.notes,
  }));

  return (
    <div className="max-w-4xl space-y-5">
      <Link
        href="/dashboard/os/autobiographer"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Autobiographer OS
      </Link>

      <header className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-[#0f1117] p-2.5 border border-[#2a2d3e]">
            <Users className="w-6 h-6 text-[#4361EE]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h1 className="text-xl font-semibold text-white">People</h1>
              <PersonActions />
            </div>
            <p className="text-sm text-[#94a3b8] leading-relaxed">
              Workshop-global directory. Track who appears in your memories —
              family, friends, mentors, colleagues, public figures — and the
              consent state Phase 6 will key off when ghostwriting reaches
              the publication gate.
            </p>
          </div>
        </div>
      </header>

      <PersonList initial={cards} />
    </div>
  );
}
