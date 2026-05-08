import Link from 'next/link';
import { ArrowLeft, Briefcase } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { listPeople, listInteractions } from '@/lib/agentic-os/business/repo';
import { ContactsCrm } from '@/components/agentic-os/business/contacts-crm';

export const dynamic = 'force-dynamic';

export default async function BusinessContactsPage() {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const people = await listPeople(user.userId);
  const interactions = await listInteractions(user.userId);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/business"
        className="inline-flex items-center gap-1.5 text-sm text-[#94a3b8] hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Business OS
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Briefcase className="w-6 h-6 text-[#4361EE]" />
        <h1 className="text-2xl font-semibold text-white">Contacts CRM</h1>
      </div>
      <p className="text-sm text-[#94a3b8] mb-6">
        Manage people, organizations, and log interactions across your sales pipeline.
      </p>

      <ContactsCrm initial={people} interactions={interactions} />
    </div>
  );
}
