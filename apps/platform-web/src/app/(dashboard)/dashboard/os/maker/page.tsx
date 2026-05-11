/**
 * Maker OS — dashboard hub.
 *
 * Mirrors the Health / Filmmaker / Cyber hubs: a `DashboardHub` shell driven
 * by the registry entry plus the markdown plan as a collapsed accordion. The
 * feature cards advertise the Phase 1 shipped surfaces (Projects, Parts) and
 * point at the same destination (parts is per-project, so both cards land on
 * the project list).
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { loadAgenticOsPlan } from '@/lib/agentic-os/plan-loader';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { getCurrentMakerUser } from '@/lib/agentic-os/maker/session';

export const dynamic = 'force-dynamic';

const MAKER_SLUG = 'maker';

export default async function MakerOsPage() {
  const user = await getCurrentMakerUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule(MAKER_SLUG);
  if (!mod) {
    throw new Error('Maker OS module missing from registry');
  }

  const plan = await loadAgenticOsPlan(MAKER_SLUG);

  return <DashboardHub module={mod} roadmapMarkdown={plan ?? null} />;
}
