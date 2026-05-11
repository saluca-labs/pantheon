/**
 * Maker OS — Parts catalog page.
 *
 * Workshop-global catalog index. Server component loads the initial row set
 * via the repo and hands it to the client-side `CatalogManager`. The client
 * component owns search/filter state + the create form; the server keeps the
 * first-render hydrated so SSR loads with content.
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';
import { listCatalog } from '@/lib/agentic-os/maker/repo';
import { CatalogManager } from '@/components/agentic-os/maker/catalog-manager';

export const dynamic = 'force-dynamic';

export default async function MakerCatalogPage() {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const rows = await listCatalog({ userId: user.userId });

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
        <ShoppingBag className="w-6 h-6 text-[#4361EE]" />
        <div>
          <h1 className="text-2xl font-semibold text-white">Parts catalog</h1>
          <p className="text-sm text-[#94a3b8]">
            Workshop-global SKUs — every BOM line picks from this list.
          </p>
        </div>
      </div>

      <CatalogManager initialRows={rows} />
    </div>
  );
}
