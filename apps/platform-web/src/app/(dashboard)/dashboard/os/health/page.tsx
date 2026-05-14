import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { loadAgenticOsPlan } from '@/lib/agentic-os/plan-loader';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { RiskFlagBadges } from '@/components/agentic-os/health/risk-flag-badges';
import { ConsentGate } from '@/components/agentic-os/health/consent-gate';
import { HealthHubOverview } from '@/components/agentic-os/health/hub/health-hub-overview';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  listConsents,
  listRiskFlags,
  listMoodEntries,
  listScreeners,
  listJournalEntries,
  listCbtLogs,
} from '@/lib/agentic-os/health/repo';
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

  // The hub dashboard strip surfaces mental-health data (mood / screeners /
  // journal / CBT), so it only loads once the mental scope is granted —
  // mirrors the per-feature consent gating without changing any query.
  const moodSince = new Date();
  moodSince.setDate(moodSince.getDate() - 14);
  const [moodEntries, screeners, journalEntries, cbtLogs] = consentMap.mental
    ? await Promise.all([
        listMoodEntries(user.userId, {
          from: moodSince,
          withTags: false,
          limit: 50,
        }),
        listScreeners(user.userId, 10),
        listJournalEntries(user.userId, { limit: 6 }),
        listCbtLogs(user.userId, { limit: 8 }),
      ])
    : [[], [], [], []];

  return (
    <div className="max-w-5xl">
      {/* Wave C-1b: hub dashboard strip — "what should I do next" above the
          standard feature grid. Only shown once the mental scope is granted. */}
      {consentMap.mental ? (
        <HealthHubOverview
          flags={flags}
          moodEntries={moodEntries}
          screeners={screeners}
          journalEntries={journalEntries.map((j) => ({
            id: j.id,
            title: j.title,
            entryAt: j.entryAt,
          }))}
          cbtLogs={cbtLogs}
        />
      ) : null}

      <DashboardHub
        module={mod}
        flagBanner={flags.length > 0 ? <RiskFlagBadges flags={flags} /> : null}
        consentGate={<ConsentGate initial={consentMap} />}
        roadmapMarkdown={plan ?? null}
      />
    </div>
  );
}
