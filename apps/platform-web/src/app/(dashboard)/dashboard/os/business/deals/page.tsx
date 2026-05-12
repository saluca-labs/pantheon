import { DollarSign, Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { listDeals } from '@/lib/agentic-os/business/deals-repo';
import { listPeople } from '@/lib/agentic-os/business/people-repo';
import { listOrganizations } from '@/lib/agentic-os/business/orgs-repo';
import DealForm from '@/components/agentic-os/business/deal-form';
import DealKanban from '@/components/agentic-os/business/deal-kanban';
import ForecastStrip from '@/components/agentic-os/business/forecast-strip';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ new?: string; q?: string; stage?: string }>;
}

export default async function DealsPage({ searchParams }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const showNew = sp.new === '1';

  const [deals, people, organizations] = await Promise.all([
    listDeals(user.userId, { q: sp.q, limit: 500 }),
    listPeople(user.userId, { archived: false, limit: 500 }),
    listOrganizations(user.userId, { archived: false, limit: 500 }),
  ]);

  const contacts = people.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName }));
  const orgs = organizations.map((o) => ({ id: o.id, name: o.name }));

  return (
    <div className="max-w-5xl">
      {/* Back link */}
      <Link
        href="/dashboard/os/business"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Business OS
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <DollarSign className="w-6 h-6 text-teal-300" />
          <h1 className="text-2xl font-semibold text-white">Deals</h1>
        </div>
        <Link
          href="?new=1"
          className="inline-flex items-center gap-2 rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add deal
        </Link>
      </div>

      {/* New deal form */}
      {showNew && (
        <div className="mb-6 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-6">
          <h2 className="text-lg font-medium text-white mb-4">New Deal</h2>
          <DealForm contacts={contacts} orgs={orgs} />
        </div>
      )}

      {/* Forecast strip */}
      {deals.length > 0 && (
        <div className="mb-6">
          <ForecastStrip deals={deals} />
        </div>
      )}

      {/* Kanban board */}
      {deals.length > 0 ? (
        <DealKanban deals={deals} contacts={contacts} orgs={orgs} />
      ) : (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-12 text-center">
          <p className="text-[#94a3b8] text-sm">
            No deals yet. Create your first deal to start tracking your pipeline.
          </p>
        </div>
      )}
    </div>
  );
}
