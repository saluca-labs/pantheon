/**
 * Business OS Phase 1 — organization detail page.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import Link from 'next/link';
import { ArrowLeft, FileText, Receipt } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { getOrganization } from '@/lib/agentic-os/business/orgs-repo';
import { listPeople } from '@/lib/agentic-os/business/people-repo';
import { listInteractions } from '@/lib/agentic-os/business/interactions-repo';
import { OrganizationDetailShell } from '@/components/agentic-os/business/organization-detail-shell';
import { OrganizationArchiveButton } from '@/components/agentic-os/business/organization-archive-button';

export const dynamic = 'force-dynamic';

const TABS = ['overview', 'quotes', 'invoices'] as const;
type Tab = (typeof TABS)[number];

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function OrgDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const sp = await searchParams;
  const activeTab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'overview';

  const organization = await getOrganization(id, user.userId);
  if (!organization) notFound();

  const [people, interactions] = await Promise.all([
    listPeople(user.userId, { organizationId: id, archived: false, limit: 500 }),
    listInteractions(user.userId, { organizationId: id, limit: 100 }),
  ]);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/business/organizations"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Organizations
      </Link>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 mb-6 border-b border-[#2a2d3e]">
        {TABS.map((tab) => {
          const icons: Record<Tab, React.ReactNode> = {
            overview: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
            quotes: <FileText className="w-3.5 h-3.5" />,
            invoices: <Receipt className="w-3.5 h-3.5" />,
          };
          return (
            <Link
              key={tab}
              href={tab === 'overview' ? '?' : `?tab=${tab}`}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[#4361EE] text-white'
                  : 'border-transparent text-[#94a3b8] hover:text-white hover:border-[#2a2d3e]'
              }`}
            >
              {icons[tab]}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Link>
          );
        })}
      </div>

      {/* ─── OVERVIEW TAB ──────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          <div className="flex items-center justify-end gap-2 mb-4">
            <OrganizationArchiveButton
              organizationId={organization.id}
              archived={organization.archivedAt != null}
            />
          </div>

          <OrganizationDetailShell
            organization={organization}
            people={people}
            initialInteractions={interactions}
          />
        </>
      )}

      {/* ─── QUOTES TAB ────────────────────────────────────────────────── */}
      {activeTab === 'quotes' && (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-8 text-center">
          <FileText className="w-8 h-8 text-[#64748b] mx-auto mb-3" />
          <p className="text-[#94a3b8] text-sm">
            Quotes and invoices are per-contact. Open a contact to see their billing history.
          </p>
        </div>
      )}

      {/* ─── INVOICES TAB ──────────────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-8 text-center">
          <Receipt className="w-8 h-8 text-[#64748b] mx-auto mb-3" />
          <p className="text-[#94a3b8] text-sm">
            Quotes and invoices are per-contact. Open a contact to see their billing history.
          </p>
        </div>
      )}
    </div>
  );
}
