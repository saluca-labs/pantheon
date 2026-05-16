/**
 * Tool definitions for the Cyber OS coach.
 *
 * Each tool wraps an existing cyber repo helper with:
 *   - Zod-validated input
 *   - `recordAudit` to the agos_audit table (action prefix `cyber.coach.`)
 *   - An `agos_cyber_coach_action_log` row capturing input + output
 *
 * Tools call into read paths almost exclusively. The two write paths
 * (attach_alert_to_case, propose_detection_rule, add_ioc) are conservative:
 * they only create new entities or non-destructive associations, never
 * mutate existing rows.
 */

import 'server-only';
import { tool } from 'ai';
import { z } from 'zod';
import {
  attachAlertToCase,
  createDetectionRule,
  createIoc,
  getAlert,
  getCaseDetail,
  getPlaybookRun,
  listAlerts,
  listCases,
  listVulnerabilities,
  recordAudit,
  searchIocs,
} from '../repo';
import {
  CASE_SEVERITY_VALUES,
  CASE_STATUS_VALUES,
  type CaseSeverity,
  type CaseStatus,
} from '../cases';
import {
  DETECTION_LOG_SOURCE_KIND_VALUES,
  DETECTION_SEVERITY_VALUES,
  type DetectionLogSourceKind,
  type DetectionSeverity,
} from '../detections';
import {
  IOC_KIND_VALUES,
  THREAT_TYPE_VALUES,
  type IocKind,
  type ThreatType,
} from '../iocs';
import { logCoachAction } from './repo';

export interface CoachToolBindings {
  ownerId: string;
  conversationId: string;
  caseId?: string | null;
}

function audit(
  bindings: CoachToolBindings,
  toolName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  return recordAudit({
    actorId: bindings.ownerId,
    action: `cyber.coach.${toolName}`,
    payload: { ...payload, conversation_id: bindings.conversationId },
  });
}

function logAction(
  bindings: CoachToolBindings,
  toolName: string,
  toolInput: unknown,
  toolOutput: unknown,
): Promise<void> {
  return logCoachAction({
    conversationId: bindings.conversationId,
    ownerId: bindings.ownerId,
    caseId: bindings.caseId ?? null,
    toolName,
    toolInput,
    toolOutput,
  });
}

const ALERT_SEVERITY_TOOL_VALUES = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
] as const;

export function buildCoachTools(bindings: CoachToolBindings) {
  const { ownerId } = bindings;

  return {
    list_open_alerts: tool({
      description:
        'List the most recent open or investigating alerts. Optional severity filter.',
      inputSchema: z.object({
        severity: z.enum(ALERT_SEVERITY_TOOL_VALUES).optional(),
        limit: z.number().int().positive().max(50).optional(),
      }),
      execute: async (input) => {
        const all = await listAlerts(ownerId, 100);
        const open = all.filter(
          (a) => a.status === 'open' || a.status === 'investigating',
        );
        const filtered = input.severity
          ? open.filter((a) => a.severity === input.severity)
          : open;
        const limited = filtered.slice(0, input.limit ?? 10);
        const result = {
          alerts: limited.map((a) => ({
            id: a.id,
            title: a.title,
            severity: a.severity,
            status: a.status,
            source: a.source,
            occurredAt: a.occurredAt,
            assetId: a.assetId,
            tactic: a.tactic,
            technique: a.technique,
          })),
          total_matching: filtered.length,
        };
        await audit(bindings, 'list_open_alerts', {
          severity: input.severity ?? null,
          count: limited.length,
        });
        await logAction(bindings, 'list_open_alerts', input, result);
        return result;
      },
    }),

    get_alert: tool({
      description: 'Fetch full alert detail by id.',
      inputSchema: z.object({ alertId: z.string().uuid() }),
      execute: async (input) => {
        const alert = await getAlert(input.alertId, ownerId);
        const result = alert
          ? {
              id: alert.id,
              title: alert.title,
              description: alert.description,
              severity: alert.severity,
              category: alert.category,
              status: alert.status,
              source: alert.source,
              sourceIp: alert.sourceIp,
              assignedTo: alert.assignedTo,
              notes: alert.notes,
              occurredAt: alert.occurredAt,
              assetId: alert.assetId,
              logSourceId: alert.logSourceId,
              tactic: alert.tactic,
              technique: alert.technique,
              tags: alert.tags,
            }
          : { error: 'Alert not found' };
        await audit(bindings, 'get_alert', { alertId: input.alertId });
        await logAction(bindings, 'get_alert', input, result);
        return result;
      },
    }),

    get_case: tool({
      description:
        'Return one case with linked alerts, evidence, tasks, and the recent event timeline.',
      inputSchema: z.object({ caseId: z.string().uuid() }),
      execute: async (input) => {
        const detail = await getCaseDetail(input.caseId, ownerId);
        const result = detail
          ? {
              id: detail.id,
              title: detail.title,
              summary: detail.summary,
              severity: detail.severity,
              status: detail.status,
              priority: detail.priority,
              assignedTo: detail.assignedTo,
              tactic: detail.tactic,
              technique: detail.technique,
              tags: detail.tags,
              linkedAlerts: detail.linkedAlerts,
              evidenceCount: detail.evidence.length,
              taskCount: detail.tasks.length,
              openTaskCount: detail.tasks.filter(
                (t) => t.status !== 'done' && t.status !== 'cancelled',
              ).length,
              recentEvents: detail.events.slice(0, 20).map((e) => ({
                kind: e.kind,
                body: e.body,
                createdAt: e.createdAt,
              })),
            }
          : { error: 'Case not found' };
        await audit(bindings, 'get_case', { caseId: input.caseId });
        await logAction(bindings, 'get_case', input, result);
        return result;
      },
    }),

    list_cases: tool({
      description:
        'List cases with optional status and severity filters. Returns lightweight cards (no full timeline).',
      inputSchema: z.object({
        status: z
          .enum(CASE_STATUS_VALUES as unknown as [string, ...string[]])
          .optional(),
        severity: z
          .enum(CASE_SEVERITY_VALUES as unknown as [string, ...string[]])
          .optional(),
      }),
      execute: async (input) => {
        const cases = await listCases({
          ownerId,
          status: input.status as CaseStatus | undefined,
          severity: input.severity as CaseSeverity | undefined,
          limit: 30,
        });
        const result = {
          cases: cases.map((c) => ({
            id: c.id,
            title: c.title,
            severity: c.severity,
            status: c.status,
            priority: c.priority,
            alertCount: c.alertCount,
            evidenceCount: c.evidenceCount,
            openTaskCount: c.openTaskCount,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          })),
        };
        await audit(bindings, 'list_cases', { count: result.cases.length });
        await logAction(bindings, 'list_cases', input, result);
        return result;
      },
    }),

    attach_alert_to_case: tool({
      description:
        'Attach an alert to a case. Idempotent (re-attaching is a no-op). Appends an alert_attached event to the case timeline.',
      inputSchema: z.object({
        caseId: z.string().uuid(),
        alertId: z.string().uuid(),
      }),
      execute: async (input) => {
        const ok = await attachAlertToCase({
          caseId: input.caseId,
          alertId: input.alertId,
          ownerId,
        });
        const result = ok
          ? { ok: true, caseId: input.caseId, alertId: input.alertId }
          : { error: 'Attach failed — case or alert not found.' };
        await audit(bindings, 'attach_alert_to_case', {
          caseId: input.caseId,
          alertId: input.alertId,
          ok,
        });
        await logAction(bindings, 'attach_alert_to_case', input, result);
        return result;
      },
    }),

    propose_detection_rule: tool({
      description:
        'Create a NEW detection rule in DRAFT lifecycle (never auto-activates). The operator reviews and promotes via the UI.',
      inputSchema: z.object({
        name: z.string().min(3).max(160),
        description: z.string().max(2000).optional(),
        severity: z
          .enum(DETECTION_SEVERITY_VALUES as unknown as [string, ...string[]])
          .optional(),
        tactic: z.string().max(80).optional(),
        technique: z.string().max(40).optional(),
        log_source_kind: z
          .enum(DETECTION_LOG_SOURCE_KIND_VALUES as unknown as [string, ...string[]])
          .optional(),
        detection_yaml: z.string().max(8000).optional(),
        false_positives: z.array(z.string().max(400)).max(10).optional(),
      }),
      execute: async (input) => {
        const rule = await createDetectionRule(ownerId, {
          name: input.name,
          description: input.description ?? null,
          lifecycle: 'draft',
          severity: (input.severity ?? 'medium') as DetectionSeverity,
          tactic: input.tactic ?? null,
          technique: input.technique ?? null,
          logSourceKind: (input.log_source_kind ?? null) as DetectionLogSourceKind | null,
          detection: input.detection_yaml ? { raw_yaml: input.detection_yaml } : {},
          falsePositives: input.false_positives ?? [],
          references: [],
          tags: ['coach-proposed'],
          metadata: { proposed_by: 'cyber.coach' },
        });
        const result = {
          id: rule.id,
          name: rule.name,
          lifecycle: rule.lifecycle,
          severity: rule.severity,
        };
        await audit(bindings, 'propose_detection_rule', {
          rule_id: rule.id,
          lifecycle: rule.lifecycle,
        });
        await logAction(bindings, 'propose_detection_rule', input, result);
        return result;
      },
    }),

    lookup_cve: tool({
      description:
        'Look up a CVE id against the local vulnerability registry. Returns the registered vuln record or null. No external network calls.',
      inputSchema: z.object({
        cveId: z.string().regex(/^CVE-\d{4}-\d{4,}$/i),
      }),
      execute: async (input) => {
        const matches = await listVulnerabilities({
          ownerId,
          q: input.cveId,
          limit: 5,
        });
        const exact = matches.find(
          (v) => (v.cveId ?? '').toUpperCase() === input.cveId.toUpperCase(),
        );
        const result = exact
          ? {
              found: true,
              id: exact.id,
              cveId: exact.cveId,
              title: exact.title,
              severity: exact.severity,
              cvssScore: exact.cvssScore,
              vendor: exact.vendor,
              product: exact.product,
              publishedAt: exact.publishedAt,
            }
          : { found: false, cveId: input.cveId };
        await audit(bindings, 'lookup_cve', { cveId: input.cveId, found: !!exact });
        await logAction(bindings, 'lookup_cve', input, result);
        return result;
      },
    }),

    list_iocs: tool({
      description:
        'List up to 20 active IOCs with optional kind / threatType / value filters. Returns indicators sorted by last-seen.',
      inputSchema: z.object({
        kind: z
          .enum(IOC_KIND_VALUES as unknown as [string, ...string[]])
          .optional(),
        threatType: z
          .enum(THREAT_TYPE_VALUES as unknown as [string, ...string[]])
          .optional(),
        q: z.string().max(200).optional(),
      }),
      execute: async (input) => {
        const iocs = await searchIocs({
          ownerId,
          kind: input.kind as IocKind | undefined,
          threatType: input.threatType as ThreatType | undefined,
          q: input.q,
          limit: 20,
        });
        const result = {
          iocs: iocs.map((i) => ({
            id: i.id,
            kind: i.kind,
            value: i.value,
            threatType: i.threatType,
            confidence: i.confidence,
            firstSeenAt: i.firstSeenAt,
            lastSeenAt: i.lastSeenAt,
            source: i.source,
          })),
        };
        await audit(bindings, 'list_iocs', { count: result.iocs.length });
        await logAction(bindings, 'list_iocs', input, result);
        return result;
      },
    }),

    add_ioc: tool({
      description:
        'Register a new indicator of compromise. Kind + value are required; per-kind validation runs in the repo layer.',
      inputSchema: z.object({
        kind: z.enum(IOC_KIND_VALUES as unknown as [string, ...string[]]),
        value: z.string().min(1).max(400),
        threatType: z
          .enum(THREAT_TYPE_VALUES as unknown as [string, ...string[]])
          .optional(),
        confidence: z.number().int().min(0).max(100).optional(),
        source: z.string().max(120).optional(),
      }),
      execute: async (input) => {
        const ioc = await createIoc(ownerId, {
          kind: input.kind as IocKind,
          value: input.value,
          threatType: (input.threatType ?? null) as ThreatType | null,
          confidence: input.confidence ?? 50,
          source: input.source ?? 'cyber.coach',
        });
        const result = ioc
          ? {
              id: ioc.id,
              kind: ioc.kind,
              value: ioc.value,
              threatType: ioc.threatType,
              confidence: ioc.confidence,
            }
          : { error: 'IOC creation failed — likely invalid value for kind.' };
        await audit(bindings, 'add_ioc', {
          kind: input.kind,
          ok: !!ioc,
        });
        await logAction(bindings, 'add_ioc', input, result);
        return result;
      },
    }),

    get_breakdown_or_run_summary: tool({
      description:
        'Return a playbook run + its step runs. Use when reviewing an active or recent response playbook.',
      inputSchema: z.object({ playbookRunId: z.string().uuid() }),
      execute: async (input) => {
        const run = await getPlaybookRun(input.playbookRunId, ownerId);
        const result = run
          ? {
              id: run.id,
              playbookName: run.playbookName,
              status: run.status,
              startedAt: run.startedAt,
              completedAt: run.completedAt,
              stepRuns: run.stepRuns.map((s) => ({
                stepIndex: s.stepIndex,
                title: (s.stepSnapshot as { title?: string } | null)?.title ?? null,
                status: s.status,
                startedAt: s.startedAt,
                completedAt: s.completedAt,
                notes: s.notes,
              })),
            }
          : { error: 'Playbook run not found' };
        await audit(bindings, 'get_breakdown_or_run_summary', {
          runId: input.playbookRunId,
        });
        await logAction(bindings, 'get_breakdown_or_run_summary', input, result);
        return result;
      },
    }),
  };
}

export type CoachTools = ReturnType<typeof buildCoachTools>;
