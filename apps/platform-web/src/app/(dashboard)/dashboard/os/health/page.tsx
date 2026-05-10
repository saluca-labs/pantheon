import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { loadAgenticOsPlan } from '@/lib/agentic-os/plan-loader';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { RiskFlagBadges } from '@/components/agentic-os/health/risk-flag-badges';
import { ConsentGate } from '@/components/agentic-os/health/consent-gate';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import { listConsents, listRiskFlags } from '@/lib/agentic-os/health/repo';
import type { ConsentScope } from '@/lib/agentic-os/health/schemas';

export const dynamic = 'force-dynamic';

const HEALTH_SLUG = 'health';

export default async function HealthOsPage() {
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule(HEALTH_SLUG);
  if (!mod) {
    // Defensive — registry must contain Health while this page is shipped.
    throw new Error('Health OS module missing from registry');
  }

  const [plan, flags, consents] = await Promise.all([
    loadAgenticOsPlan(HEALTH_SLUG),
    listRiskFlags(user.userId, user.tenantId, { activeOnly: true }),
    listConsents(user.userId, user.tenantId),
  ]);

  const consentMap: Record<ConsentScope, boolean> = {
    physical: false,
    mental: false,
    integrations: false,
  };
  for (const row of consents) {
    consentMap[row.scope] = row.granted;
  }

  return (
    <DashboardHub
      module={mod}
      flagBanner={flags.length > 0 ? <RiskFlagBadges flags={flags} /> : null}
      consentGate={<ConsentGate initial={consentMap} />}
      roadmapMarkdown={plan ?? null}
    />
  );
}
