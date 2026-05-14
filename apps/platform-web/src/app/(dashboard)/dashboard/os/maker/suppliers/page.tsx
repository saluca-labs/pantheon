/**
 * Maker OS — Suppliers directory page.
 *
 * Lists the user's suppliers with an inline edit drawer + create form.
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2 } from 'lucide-react';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { listSuppliers } from '@/lib/agentic-os/maker/repo';
import { SupplierManager } from '@/components/agentic-os/maker/supplier-manager';

export const dynamic = 'force-dynamic';

export default async function MakerSuppliersPage() {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const suppliers = await listSuppliers(user.userId);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/maker"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Maker OS
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Building2 className="w-6 h-6 text-accent" />
        <div>
          <h1 className="text-2xl font-semibold text-white">Suppliers</h1>
          <p className="text-sm text-text-secondary">
            Vendors and quote sources. Link them to catalog rows for unit prices and lead times.
          </p>
        </div>
      </div>

      <SupplierManager initialSuppliers={suppliers} />
    </div>
  );
}
