/**
 * Secure-Dev OS — dashboard hub.
 *
 * Server component. Wave C-4b (UI Depth Wave): Secure-Dev previously had no
 * explicit hub page — it rendered through the generic inline
 * `os/[slug]/page.tsx` route (the oldest of the three hub tiers). This file
 * converges Secure-Dev to the `_shared/DashboardHub` tier: same metadata
 * header, same feature grid, same execution roadmap accordion that
 * `[slug]/page.tsx` produced for `secure-dev`, plus the declarative
 * `dashboard` prop (v0.1.61) on top.
 *
 * Being an explicit `secure-dev/page.tsx` Next.js route, this file naturally
 * takes precedence over `[slug]` for the `secure-dev` slug — `[slug]` is left
 * untouched (filmmaker still renders through it until a later sub-wave).
 *
 * The `dashboard` region surfaces Secure-Dev's one persisted entity — saved
 * STRIDE threat models — as `widgets` + an `activity` feed. The data-shape
 * adapter lives in `lib/agentic-os/secure-dev/dashboard-spec.tsx` (mirrors
 * the Cyber / Maker sub-wave pattern); the hub fetches the repo payload
 * server-side, the spec is pure. No `chart` — Secure-Dev has no time-series
 * surface yet, and `DashboardHub` renders fine with widgets + activity only.
 *
 * @license MIT — Tiresias Secure-Dev OS (internal).
 */

import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { getCurrentSecureDevUser } from '@/lib/agentic-os/secure-dev/session';
import { listThreatModels } from '@/lib/agentic-os/secure-dev/repo';
import { buildSecureDevDashboardSpec } from '@/lib/agentic-os/secure-dev/dashboard-spec';

export const dynamic = 'force-dynamic';

const SECURE_DEV_SLUG = 'secure-dev';

export default async function SecureDevOsPage() {
  const user = await getCurrentSecureDevUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule(SECURE_DEV_SLUG);
  if (!mod) {
    throw new Error('Secure-Dev OS module missing from registry');
  }

  const models = await listThreatModels(user.userId);

  const dashboard = buildSecureDevDashboardSpec({ models });

  return <DashboardHub module={mod} dashboard={dashboard} />;
}
