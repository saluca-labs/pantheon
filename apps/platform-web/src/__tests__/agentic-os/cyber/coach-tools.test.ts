/**
 * Cyber coach tool-call paths.
 *
 * Each tool's `execute` is invoked directly with the AI SDK call signature.
 * The tests verify:
 *   - The underlying cyber repo helper is called
 *   - recordAudit fires with the right slug + payload
 *   - An agos_cyber_coach_action_log row is inserted
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: any[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: any[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

vi.mock('@/lib/agentic-os/cyber/session', () => ({
  getCyberPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(),
  }),
}));

vi.mock('@/lib/agentic-os/cyber/repo', async () => {
  const actual = await vi.importActual<any>('@/lib/agentic-os/cyber/repo');
  return {
    ...actual,
    recordAudit: vi.fn(async () => undefined),
    attachAlertToCase: vi.fn(async (args: any) => true),
    createDetectionRule: vi.fn(async (_owner: string, data: any) => ({
      id: 'rule-99',
      ownerId: 'u-1',
      name: data.name,
      description: data.description ?? null,
      author: null,
      lifecycle: 'draft',
      severity: data.severity ?? 'medium',
      tactic: data.tactic ?? null,
      technique: data.technique ?? null,
      logSourceKind: data.logSourceKind ?? null,
      detection: data.detection ?? {},
      falsePositives: data.falsePositives ?? [],
      references: [],
      tags: data.tags ?? [],
      metadata: data.metadata ?? {},
      createdAt: '2026-05-10T00:00:00Z',
      updatedAt: '2026-05-10T00:00:00Z',
    })),
    createIoc: vi.fn(async (_owner: string, data: any) => ({
      id: 'ioc-99',
      ownerId: 'u-1',
      kind: data.kind,
      value: data.value,
      title: null,
      description: null,
      threatType: data.threatType ?? null,
      confidence: data.confidence ?? 50,
      firstSeenAt: '2026-05-10T00:00:00Z',
      lastSeenAt: '2026-05-10T00:00:00Z',
      expiresAt: null,
      source: data.source ?? 'cyber.coach',
      tags: [],
      references: [],
      metadata: {},
      createdAt: '2026-05-10T00:00:00Z',
      updatedAt: '2026-05-10T00:00:00Z',
    })),
    getAlert: vi.fn(async () => ({
      id: 'a-1',
      title: 'PowerShell encoded command',
      description: '',
      severity: 'high',
      category: 'malware',
      status: 'open',
      source: 'edr',
      sourceIp: null,
      assignedTo: null,
      notes: null,
      occurredAt: '2026-05-10T00:00:00Z',
      createdAt: '2026-05-10T00:00:00Z',
      updatedAt: '2026-05-10T00:00:00Z',
      assetId: null,
      logSourceId: null,
      tactic: 'execution',
      technique: 'T1059',
      correlationId: null,
      tags: [],
      raw: {},
    })),
    getCaseDetail: vi.fn(async () => ({
      id: 'c-1',
      ownerId: 'u-1',
      title: 'PowerShell on prod-web-01',
      summary: null,
      severity: 'high',
      status: 'investigating',
      priority: 'p2',
      assignedTo: null,
      tactic: null,
      technique: null,
      tags: [],
      closedAt: null,
      metadata: {},
      createdAt: '2026-05-10T00:00:00Z',
      updatedAt: '2026-05-10T00:00:00Z',
      linkedAlerts: [],
      events: [],
      evidence: [],
      tasks: [],
    })),
    listCases: vi.fn(async () => []),
    listAlerts: vi.fn(async () => [
      {
        id: 'a-1',
        title: 'PowerShell encoded command',
        description: '',
        severity: 'high',
        category: 'malware',
        status: 'open',
        source: 'edr',
        sourceIp: null,
        assignedTo: null,
        notes: null,
        occurredAt: '2026-05-10T00:00:00Z',
        createdAt: '2026-05-10T00:00:00Z',
        updatedAt: '2026-05-10T00:00:00Z',
        assetId: null,
        logSourceId: null,
        tactic: null,
        technique: null,
        correlationId: null,
        tags: [],
        raw: {},
      },
      {
        id: 'a-2',
        title: 'Closed already',
        description: '',
        severity: 'low',
        category: 'other',
        status: 'resolved',
        source: 'edr',
        sourceIp: null,
        assignedTo: null,
        notes: null,
        occurredAt: '2026-05-10T00:00:00Z',
        createdAt: '2026-05-10T00:00:00Z',
        updatedAt: '2026-05-10T00:00:00Z',
        assetId: null,
        logSourceId: null,
        tactic: null,
        technique: null,
        correlationId: null,
        tags: [],
        raw: {},
      },
    ]),
    listVulnerabilities: vi.fn(async () => [
      {
        id: 'v-1',
        ownerId: 'u-1',
        cveId: 'CVE-2026-1234',
        title: 'Buffer overflow',
        description: null,
        severity: 'critical',
        cvssScore: 9.8,
        cvssVector: null,
        cweId: null,
        vendor: 'acme',
        product: 'webd',
        affectedVersions: [],
        fixedVersions: [],
        publishedAt: '2026-04-01',
        references: [],
        tags: [],
        metadata: {},
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-01T00:00:00Z',
      },
    ]),
    searchIocs: vi.fn(async () => [
      {
        id: 'ioc-1',
        ownerId: 'u-1',
        kind: 'ipv4',
        value: '203.0.113.10',
        title: null,
        description: null,
        threatType: 'c2',
        confidence: 80,
        firstSeenAt: '2026-05-10T00:00:00Z',
        lastSeenAt: '2026-05-10T00:00:00Z',
        expiresAt: null,
        source: 'feed',
        tags: [],
        references: [],
        metadata: {},
        createdAt: '2026-05-10T00:00:00Z',
        updatedAt: '2026-05-10T00:00:00Z',
      },
    ]),
    getPlaybookRun: vi.fn(async () => ({
      id: 'pr-1',
      playbookId: 'pb-1',
      ownerId: 'u-1',
      caseId: 'c-1',
      status: 'in_progress',
      startedAt: '2026-05-10T00:00:00Z',
      completedAt: null,
      notes: null,
      metadata: {},
      createdAt: '2026-05-10T00:00:00Z',
      updatedAt: '2026-05-10T00:00:00Z',
      playbookName: 'PowerShell IR',
      stepRuns: [
        {
          id: 'sr-1',
          runId: 'pr-1',
          stepIndex: 0,
          stepSnapshot: { title: 'Identify infected host' },
          status: 'completed',
          input: {},
          notes: 'host=prod-web-01',
          startedAt: '2026-05-10T00:00:00Z',
          completedAt: '2026-05-10T00:05:00Z',
          createdAt: '2026-05-10T00:00:00Z',
          updatedAt: '2026-05-10T00:05:00Z',
        },
      ],
    })),
  };
});

import { buildCoachTools } from '@/lib/agentic-os/cyber/coach/tools';
import * as cyberRepo from '@/lib/agentic-os/cyber/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  vi.clearAllMocks();
});

const aiCallArgs = {
  toolCallId: 't-1',
  messages: [],
  abortSignal: new AbortController().signal,
};

describe('list_open_alerts', () => {
  it('returns only open/investigating alerts, audits + logs', async () => {
    pushResult({ rows: [] }); // logCoachAction insert
    const tools = buildCoachTools({
      ownerId: 'u-1',
      conversationId: 'cv-1',
    });
    const out = await (tools.list_open_alerts.execute as any)(
      { limit: 5 },
      aiCallArgs,
    );
    expect(out.alerts).toHaveLength(1);
    expect(out.alerts[0].status).toBe('open');
    expect(cyberRepo.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'cyber.coach.list_open_alerts' }),
    );
    expect(
      calls.some((c) => c.sql.includes('agos_cyber_coach_action_log')),
    ).toBe(true);
  });
});

describe('attach_alert_to_case tool', () => {
  it('calls attachAlertToCase, writes audit, writes action_log', async () => {
    pushResult({ rows: [] }); // logCoachAction insert
    const tools = buildCoachTools({
      ownerId: 'u-1',
      conversationId: 'cv-1',
      caseId: 'c-1',
    });
    const out = await (tools.attach_alert_to_case.execute as any)(
      {
        caseId: '00000000-0000-0000-0000-000000000001',
        alertId: '00000000-0000-0000-0000-000000000002',
      },
      aiCallArgs,
    );
    expect(out.ok).toBe(true);
    expect(cyberRepo.attachAlertToCase).toHaveBeenCalledOnce();
    expect(cyberRepo.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cyber.coach.attach_alert_to_case',
        actorId: 'u-1',
      }),
    );
    expect(
      calls.some((c) => c.sql.includes('agos_cyber_coach_action_log')),
    ).toBe(true);
    // action_log carries case_id from bindings
    const logCall = calls.find((c) =>
      c.sql.includes('agos_cyber_coach_action_log'),
    )!;
    expect(logCall.params[4]).toBe('c-1');
  });
});

describe('propose_detection_rule tool', () => {
  it('creates a DRAFT rule (never auto-active) and logs the action', async () => {
    pushResult({ rows: [] });
    const tools = buildCoachTools({
      ownerId: 'u-1',
      conversationId: 'cv-1',
    });
    const out = await (tools.propose_detection_rule.execute as any)(
      {
        name: 'Auth-failure spike on prod',
        description: 'Burst of failed auths',
        severity: 'high',
        tactic: 'credential-access',
        technique: 'T1110',
        log_source_kind: 'siem',
        detection_yaml: 'condition: selection AND failed_logins > 50',
      },
      aiCallArgs,
    );
    expect(out.lifecycle).toBe('draft');
    expect(cyberRepo.createDetectionRule).toHaveBeenCalledOnce();
    // The lifecycle the tool sent must be 'draft', not 'active'
    const firstCallArgs = (cyberRepo.createDetectionRule as any).mock.calls[0];
    expect(firstCallArgs[1].lifecycle).toBe('draft');
    expect(cyberRepo.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'cyber.coach.propose_detection_rule' }),
    );
    expect(
      calls.some((c) => c.sql.includes('agos_cyber_coach_action_log')),
    ).toBe(true);
  });
});

describe('lookup_cve tool', () => {
  it('returns the registered vuln when CVE id matches', async () => {
    pushResult({ rows: [] });
    const tools = buildCoachTools({ ownerId: 'u-1', conversationId: 'cv-1' });
    const out = await (tools.lookup_cve.execute as any)(
      { cveId: 'CVE-2026-1234' },
      aiCallArgs,
    );
    expect(out.found).toBe(true);
    expect(out.cveId).toBe('CVE-2026-1234');
    expect(cyberRepo.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'cyber.coach.lookup_cve' }),
    );
  });
});

describe('add_ioc tool', () => {
  it('creates an IOC, audits, logs', async () => {
    pushResult({ rows: [] });
    const tools = buildCoachTools({ ownerId: 'u-1', conversationId: 'cv-1' });
    const out = await (tools.add_ioc.execute as any)(
      {
        kind: 'ipv4',
        value: '203.0.113.99',
        threatType: 'c2',
        confidence: 70,
      },
      aiCallArgs,
    );
    expect(out.id).toBe('ioc-99');
    expect(cyberRepo.createIoc).toHaveBeenCalledOnce();
    expect(cyberRepo.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'cyber.coach.add_ioc' }),
    );
    expect(
      calls.some((c) => c.sql.includes('agos_cyber_coach_action_log')),
    ).toBe(true);
  });
});

describe('get_breakdown_or_run_summary tool', () => {
  it('returns playbook run summary with step titles from snapshot', async () => {
    pushResult({ rows: [] });
    const tools = buildCoachTools({ ownerId: 'u-1', conversationId: 'cv-1' });
    const out = await (tools.get_breakdown_or_run_summary.execute as any)(
      { playbookRunId: '00000000-0000-0000-0000-000000000003' },
      aiCallArgs,
    );
    expect(out.id).toBe('pr-1');
    expect(out.stepRuns[0].title).toBe('Identify infected host');
    expect(out.stepRuns[0].notes).toBe('host=prod-web-01');
  });
});
