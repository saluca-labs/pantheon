/**
 * Health OS — Hub page.
 *
 * Server component. Wave D rollup retrofit: the hub's "at a glance" surface
 * is now wired through `DashboardHub`'s declarative `dashboard` prop
 * (v0.1.61) instead of the bolted-on `HealthHubOverview` sibling strip that
 * Wave C-1b shipped before the hub had an integration prop:
 *   - `widgets`  — the mood / screener / activity / nutrition rollup
 *                  (risk flags, average mood, latest screener, CBT practice,
 *                  meals + intake, activity sessions + minutes moved)
 *   - `chart`    — 14-day mood / energy / anxiety line chart
 *   - `activity` — merged chronological feed across all six surfaces
 *
 * The active-risk-flags banner stays in the `flagBanner` slot and the
 * consent gate stays in `consentGate` — both are hub-shell affordances,
 * not aggregate "at a glance" state. Every datum here already exists and
 * every deep-link is preserved; this only changes how the surface is
 * composed. No new DB queries beyond the two recent-log reads the rollup
 * needs (`listMealEntries` / `listActivityEntries`), both pre-existing.
 *
 * @license MIT — Tiresias Health OS (internal).
 */

import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { loadAgenticOsPlan } from '@/lib/agentic-os/plan-loader';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { RiskFlagBadges } from '@/components/agentic-os/health/risk-flag-badges';
import { ConsentGate } from '@/components/agentic-os/health/consent-gate';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  listConsents,
  listRiskFlags,
  listMoodEntries,
  listScreeners,
  listJournalEntries,
  listCbtLogs,
  listMealEntries,
  listActivityEntries,
} from '@/lib/agentic-os/health/repo';
import { buildHealthDashboardSpec } from '@/lib/agentic-os/health/dashboard-spec';
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

  // The hub rollup surfaces mental-health data (mood / screeners / journal /
  // CBT) plus the meal + activity logs, so it only loads once the mental
  // scope is granted — mirrors the per-feature consent gating without
  // changing any query.
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const sinceIso = since.toISOString().slice(0, 10);

  const [
    moodEntries,
    screeners,
    journalEntries,
    cbtLogs,
    mealEntries,
    activityEntries,
  ] = consentMap.mental
    ? await Promise.all([
        listMoodEntries(user.userId, {
          from: since,
          withTags: false,
          limit: 50,
        }),
        listScreeners(user.userId, 10),
        listJournalEntries(user.userId, { limit: 6 }),
        listCbtLogs(user.userId, { limit: 8 }),
        listMealEntries({
          tenantId: user.tenantId,
          userId: user.userId,
          fromDate: sinceIso,
          limit: 100,
        }),
        listActivityEntries({
          tenantId: user.tenantId,
          userId: user.userId,
          fromDate: sinceIso,
          limit: 100,
        }),
      ])
    : [[], [], [], [], [], []];

  // Build the declarative dashboard spec only when the mental scope is
  // granted — otherwise the hub renders without a dashboard region, same
  // as the pre-retrofit consent-gated behaviour.
  const dashboard = consentMap.mental
    ? buildHealthDashboardSpec({
        flags,
        moodEntries,
        screeners,
        journalEntries: journalEntries.map((j) => ({
          id: j.id,
          title: j.title,
          entryAt: j.entryAt,
        })),
        cbtLogs,
        mealEntries,
        activityEntries,
      })
    : undefined;

  return (
    <DashboardHub
      module={mod}
      flagBanner={flags.length > 0 ? <RiskFlagBadges flags={flags} /> : null}
      consentGate={<ConsentGate initial={consentMap} />}
      roadmapMarkdown={plan ?? null}
      dashboard={dashboard}
    />
  );
}
