/**
 * Cyber coach context snapshot.
 *
 * Pulls a compact, current-state SOC view: optional case detail, recent open
 * alerts, active IOCs, open vuln severity rollup, top-priority exposures,
 * active playbook runs, and the active-detection-rule count.
 *
 * Composes existing cyber repo helpers — no new SQL primitives.
 */

import 'server-only';
import {
  getCaseDetail,
  getCyberDashboardStats,
  listAlerts,
  listDetectionRules,
  listExposures,
  listPlaybookRuns,
  listVulnerabilities,
  searchIocs,
} from '../repo';
import type { CoachMode } from './modes';

export interface CyberCoachCaseSummary {
  id: string;
  title: string;
  severity: string;
  status: string;
  priority: string;
  openTaskCount: number;
  alertCount: number;
  evidenceCount: number;
}

export interface CyberCoachOpenAlert {
  id: string;
  title: string;
  severity: string;
  source: string;
  occurredAt: string;
  assetId: string | null;
  tactic: string | null;
  technique: string | null;
}

export interface CyberCoachActiveIoc {
  kind: string;
  value: string;
  threatType: string | null;
  confidence: number;
}

export interface CyberCoachVulnRollup {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface CyberCoachActiveExposure {
  vulnTitle: string;
  assetName: string;
  severity: string;
  status: string;
  priority: string;
}

export interface CyberCoachActivePlaybookRun {
  id: string;
  playbookName: string;
  status: string;
  startedAt: string;
}

export interface CyberCoachContext {
  case_summary: CyberCoachCaseSummary | null;
  recent_open_alerts: CyberCoachOpenAlert[];
  active_iocs: CyberCoachActiveIoc[];
  open_vuln_summary: CyberCoachVulnRollup | null;
  active_exposures: CyberCoachActiveExposure[];
  active_playbook_runs: CyberCoachActivePlaybookRun[];
  detection_rules_active_count: number;
  dashboard_stats: {
    openAlerts: number;
    criticalAlerts: number;
    totalAssets: number;
    criticalAssets: number;
    activeLogSources: number;
    alertsLast24h: number;
    alertsLast7d: number;
  };
  mode_hint: CoachMode;
}

export interface BuildCoachContextInput {
  ownerId: string;
  caseId?: string | null;
  mode: CoachMode;
}

export async function buildCoachContext(
  input: BuildCoachContextInput,
): Promise<CyberCoachContext> {
  const { ownerId, caseId, mode } = input;

  const [
    caseDetail,
    alerts,
    iocs,
    vulns,
    exposures,
    runs,
    activeRules,
    stats,
  ] = await Promise.all([
    caseId ? getCaseDetail(caseId, ownerId) : Promise.resolve(null),
    listAlerts(ownerId, 30),
    searchIocs({ ownerId, limit: 20 }),
    listVulnerabilities({ ownerId, limit: 500 }),
    listExposures({ ownerId, limit: 50 }),
    listPlaybookRuns({ ownerId, status: 'in_progress', limit: 5 }),
    listDetectionRules({ ownerId, lifecycle: 'active', limit: 500 }),
    getCyberDashboardStats(ownerId),
  ]);

  const openAlerts = alerts
    .filter((a) => a.status === 'open' || a.status === 'investigating')
    .slice(0, 10)
    .map<CyberCoachOpenAlert>((a) => ({
      id: a.id,
      title: a.title,
      severity: a.severity,
      source: a.source,
      occurredAt: a.occurredAt,
      assetId: a.assetId,
      tactic: a.tactic,
      technique: a.technique,
    }));

  const vulnRollup: CyberCoachVulnRollup = vulns.reduce(
    (acc, v) => {
      if (v.severity === 'critical') acc.critical += 1;
      else if (v.severity === 'high') acc.high += 1;
      else if (v.severity === 'medium') acc.medium += 1;
      else if (v.severity === 'low') acc.low += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );

  const activeExposures = exposures
    .filter((e) => e.status === 'open' || e.status === 'in_progress')
    .slice(0, 10)
    .map<CyberCoachActiveExposure>((e) => ({
      vulnTitle: e.vulnerabilityTitle,
      assetName: e.assetName,
      severity: e.vulnerabilitySeverity,
      status: e.status,
      priority: e.priority,
    }));

  let caseSummary: CyberCoachCaseSummary | null = null;
  if (caseDetail) {
    caseSummary = {
      id: caseDetail.id,
      title: caseDetail.title,
      severity: caseDetail.severity,
      status: caseDetail.status,
      priority: caseDetail.priority,
      openTaskCount: caseDetail.tasks.filter(
        (t) => t.status !== 'done' && t.status !== 'cancelled',
      ).length,
      alertCount: caseDetail.linkedAlerts.length,
      evidenceCount: caseDetail.evidence.length,
    };
  }

  return {
    case_summary: caseSummary,
    recent_open_alerts: openAlerts,
    active_iocs: iocs.map((i) => ({
      kind: i.kind,
      value: i.value,
      threatType: i.threatType,
      confidence: i.confidence,
    })),
    open_vuln_summary:
      vulnRollup.critical + vulnRollup.high + vulnRollup.medium + vulnRollup.low === 0
        ? null
        : vulnRollup,
    active_exposures: activeExposures,
    active_playbook_runs: runs.map((r) => ({
      id: r.id,
      playbookName: r.playbookName,
      status: r.status,
      startedAt: r.startedAt,
    })),
    detection_rules_active_count: activeRules.length,
    dashboard_stats: stats,
    mode_hint: mode,
  };
}
