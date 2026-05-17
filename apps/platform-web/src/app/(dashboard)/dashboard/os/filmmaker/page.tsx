/**
 * Filmmaker OS — dashboard hub.
 *
 * Server component. Wave C-5 (UI Depth Wave): Filmmaker previously had no
 * explicit hub page — it rendered through the generic inline
 * `os/[slug]/page.tsx` route (the oldest of the three hub tiers). This file
 * converges Filmmaker to the `_shared/DashboardHub` tier: same metadata
 * header, same feature grid, same execution roadmap accordion that
 * `[slug]/page.tsx` produced for `filmmaker`, plus the declarative
 * `dashboard` prop (v0.1.61) on top.
 *
 * Being an explicit `filmmaker/page.tsx` Next.js route, this file naturally
 * takes precedence over `[slug]` for the `filmmaker` slug — `[slug]` is left
 * untouched (it stays for the Wave E cleanup once every OS has an explicit
 * page; Filmmaker is the last of the nine to converge).
 *
 * The `dashboard` region surfaces Filmmaker's slate — the user's film
 * projects — as aggregate `widgets` + a recent-projects `activity` feed. The
 * data-shape adapter lives in `lib/agentic-os/filmmaker/dashboard-spec.tsx`
 * (mirrors the Cyber / Secure-Dev sub-wave pattern); the hub fetches the repo
 * payload server-side, the spec is pure. No `chart` — Filmmaker has no
 * cross-project time-series surface (adoption matrix marks ChartCard `—`),
 * and `DashboardHub` renders fine with widgets + activity only.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { getCurrentFilmmakerUser } from '@/lib/agentic-os/filmmaker/session';
import { listProjects } from '@/lib/agentic-os/filmmaker/repo';
import { buildFilmmakerDashboardSpec } from '@/lib/agentic-os/filmmaker/dashboard-spec';

export const dynamic = 'force-dynamic';

const FILMMAKER_SLUG = 'filmmaker';

export default async function FilmmakerOsHubPage() {
  const user = await getCurrentFilmmakerUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule(FILMMAKER_SLUG);
  if (!mod) {
    throw new Error('Filmmaker OS module missing from registry');
  }

  const projects = await listProjects(user.userId);

  const dashboard = buildFilmmakerDashboardSpec({ projects });

  return <DashboardHub module={mod} dashboard={dashboard} />;
}
