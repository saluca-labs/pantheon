/**
 * Cyber OS — Coach test suite.
 *
 * - Mode taxonomy sanity (5 modes)
 * - buildSystemPrompt covers all 5 modes + 3 hard rules
 * - Conversation CRUD + cross-user denial
 * - Message append carries redacted + redaction_matches
 * - Action log row written on logCoachAction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  COACH_MODE_LABELS,
  COACH_MODE_VALUES,
} from '@/lib/agentic-os/cyber/coach/modes';
import { buildSystemPrompt } from '@/lib/agentic-os/cyber/coach/system-prompt';
import type { CyberCoachContext } from '@/lib/agentic-os/cyber/coach/context';

// ─── Mode taxonomy sanity ──────────────────────────────────────────────────

describe('CoachMode taxonomy', () => {
  it('has 5 modes with labels', () => {
    expect(COACH_MODE_VALUES).toHaveLength(5);
    for (const m of COACH_MODE_VALUES) {
      expect(COACH_MODE_LABELS[m]).toBeTruthy();
    }
  });
});

// ─── System prompt ─────────────────────────────────────────────────────────

function fixtureContext(): CyberCoachContext {
  return {
    case_summary: {
      id: 'c-1',
      title: 'PowerShell on prod-web-01',
      severity: 'high',
      status: 'investigating',
      priority: 'p2',
      openTaskCount: 3,
      alertCount: 4,
      evidenceCount: 2,
    },
    recent_open_alerts: [
      {
        id: 'a-1',
        title: 'Suspicious encoded PowerShell',
        severity: 'high',
        source: 'edr-vendor',
        occurredAt: '2026-05-10T09:14:00Z',
        assetId: 'asset-1',
        tactic: 'execution',
        technique: 'T1059',
      },
    ],
    active_iocs: [
      { kind: 'ipv4', value: '203.0.113.10', threatType: 'c2', confidence: 80 },
    ],
    open_vuln_summary: { critical: 2, high: 5, medium: 12, low: 8 },
    active_exposures: [
      {
        vulnTitle: 'CVE-2026-1234 — buffer overflow',
        assetName: 'prod-web-01',
        severity: 'critical',
        status: 'open',
        priority: 'p1',
      },
    ],
    active_playbook_runs: [
      {
        id: 'pr-1',
        playbookName: 'PowerShell incident response',
        status: 'in_progress',
        startedAt: '2026-05-10T09:30:00Z',
      },
    ],
    detection_rules_active_count: 12,
    dashboard_stats: {
      openAlerts: 22,
      criticalAlerts: 3,
      totalAssets: 48,
      criticalAssets: 6,
      activeLogSources: 7,
      alertsLast24h: 14,
      alertsLast7d: 88,
    },
    mode_hint: 'general',
  };
}

describe('buildSystemPrompt', () => {
  it('renders every mode and includes the hard rules + context', () => {
    const ctx = fixtureContext();
    for (const mode of COACH_MODE_VALUES) {
      const prompt = buildSystemPrompt(ctx, mode);
      expect(prompt).toContain('CyberSec OS coach');
      // 3 hard rules anchors
      expect(prompt).toContain('Never fabricate');
      expect(prompt).toContain('Never recommend running offensive');
      expect(prompt).toContain('Never store, repeat');
      // Context block
      expect(prompt).toContain('PowerShell on prod-web-01');
      expect(prompt).toContain('203.0.113.10');
      expect(prompt).toContain('CVE-2026-1234');
      // Mode-specific framing token
      const modeMarker: Record<string, string> = {
        triage_analyst: 'SOC triage analyst',
        threat_hunter: 'threat hunter',
        responder: 'incident responder',
        detection_engineer: 'detection engineer',
        general: 'general-purpose SOC copilot',
      };
      expect(prompt).toContain(modeMarker[mode]);
    }
  });

  it('handles null case + null vuln summary cleanly', () => {
    const ctx = fixtureContext();
    ctx.case_summary = null;
    ctx.open_vuln_summary = null;
    ctx.active_exposures = [];
    ctx.active_iocs = [];
    ctx.active_playbook_runs = [];
    ctx.recent_open_alerts = [];
    const prompt = buildSystemPrompt(ctx, 'general');
    expect(prompt).toContain('(none — conversation is unscoped)');
    expect(prompt).toContain('## Open vulnerabilities\n- (none)');
    expect(prompt).toContain('## Active IOCs\n- (none)');
  });
});

// ─── Repo plumbing (mocked pg) ─────────────────────────────────────────────

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

import {
  createConversation,
  getConversation,
  listConversations,
  updateConversation,
  deleteConversation,
  appendMessage,
  listMessages,
  logCoachAction,
} from '@/lib/agentic-os/cyber/coach/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function convRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'cv-1',
    owner_id: 'u-1',
    case_id: null,
    mode: 'general',
    title: null,
    model: 'claude-sonnet-4-6',
    system_prompt_version: 'v1',
    metadata: {},
    created_at: new Date('2026-05-10T00:00:00Z'),
    updated_at: new Date('2026-05-10T00:00:00Z'),
    ...overrides,
  };
}

function messageRow(overrides: Record<string, any> = {}): any {
  return {
    id: 'm-1',
    conversation_id: 'cv-1',
    role: 'user',
    content: 'hello',
    tool_calls: null,
    redacted: false,
    redaction_matches: [],
    metadata: {},
    created_at: new Date('2026-05-10T00:00:01Z'),
    ...overrides,
  };
}

// ─── createConversation ────────────────────────────────────────────────────

describe('createConversation', () => {
  it('rejects when case-scoped and case is not owned by user', async () => {
    pushResult({ rows: [] }); // case ownership pre-check
    await expect(
      createConversation({
        ownerId: 'u-1',
        caseId: 'c-x',
        mode: 'general',
        model: 'claude-sonnet-4-6',
        systemPromptVersion: 'v1',
      }),
    ).rejects.toThrow(/Case not found/);
  });

  it('rejects unknown mode', async () => {
    await expect(
      createConversation({
        ownerId: 'u-1',
        // @ts-expect-error testing runtime guard
        mode: 'not-a-mode',
        model: 'claude-sonnet-4-6',
        systemPromptVersion: 'v1',
      }),
    ).rejects.toThrow(/Invalid coach mode/);
  });

  it('inserts and returns an unscoped conversation when no caseId', async () => {
    pushResult({ rows: [convRow({ mode: 'triage_analyst' })] });
    const conv = await createConversation({
      ownerId: 'u-1',
      mode: 'triage_analyst',
      model: 'claude-sonnet-4-6',
      systemPromptVersion: 'v1',
    });
    expect(conv.mode).toBe('triage_analyst');
    expect(conv.ownerId).toBe('u-1');
    expect(conv.caseId).toBeNull();
    expect(calls[0].sql).toContain('INSERT INTO agos_cyber_coach_conversation');
  });

  it('inserts a case-scoped conversation when ownership check passes', async () => {
    pushResult({ rows: [{ id: 'c-1' }] }); // case ownership
    pushResult({ rows: [convRow({ case_id: 'c-1', mode: 'responder' })] });
    const conv = await createConversation({
      ownerId: 'u-1',
      caseId: 'c-1',
      mode: 'responder',
      model: 'claude-sonnet-4-6',
      systemPromptVersion: 'v1',
    });
    expect(conv.caseId).toBe('c-1');
    expect(calls[0].sql).toContain('agos_cyber_cases');
  });
});

// ─── getConversation / cross-user denial ───────────────────────────────────

describe('getConversation', () => {
  it('filters by owner_id', async () => {
    pushResult({ rows: [convRow()] });
    const c = await getConversation('cv-1', 'u-1');
    expect(c).not.toBeNull();
    expect(calls[0].sql).toContain('owner_id = $2');
  });

  it('returns null when cross-user', async () => {
    pushResult({ rows: [] });
    const c = await getConversation('cv-1', 'u-other');
    expect(c).toBeNull();
  });
});

// ─── listConversations ────────────────────────────────────────────────────

describe('listConversations', () => {
  it('sorts by updated_at desc with limit/offset', async () => {
    pushResult({
      rows: [
        convRow({ id: 'cv-2', updated_at: new Date('2026-05-10T02:00:00Z') }),
        convRow({ id: 'cv-1', updated_at: new Date('2026-05-10T01:00:00Z') }),
      ],
    });
    const list = await listConversations({ ownerId: 'u-1', limit: 25 });
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('cv-2');
    expect(calls[0].sql).toContain('ORDER BY updated_at DESC');
  });

  it('filters by case_id when provided', async () => {
    pushResult({ rows: [convRow({ case_id: 'c-1' })] });
    const list = await listConversations({ ownerId: 'u-1', caseId: 'c-1' });
    expect(list).toHaveLength(1);
    expect(calls[0].sql).toContain('case_id = $2');
  });
});

// ─── updateConversation / deleteConversation ──────────────────────────────

describe('updateConversation', () => {
  it('returns null when not owned', async () => {
    pushResult({ rows: [] });
    const out = await updateConversation('cv-x', 'u-other', { title: 'hi' });
    expect(out).toBeNull();
  });

  it('rejects invalid mode', async () => {
    pushResult({ rows: [convRow()] });
    await expect(
      updateConversation('cv-1', 'u-1', {
        // @ts-expect-error testing runtime guard
        mode: 'not-a-mode',
      }),
    ).rejects.toThrow(/Invalid coach mode/);
  });

  it('writes the update and refetches', async () => {
    pushResult({ rows: [convRow()] });
    pushResult({ rows: [] });
    pushResult({ rows: [convRow({ title: 'New title' })] });
    const out = await updateConversation('cv-1', 'u-1', { title: 'New title' });
    expect(out?.title).toBe('New title');
    const sqls = calls.map((c) => c.sql).join(' || ');
    expect(sqls).toContain('UPDATE agos_cyber_coach_conversation');
  });
});

describe('deleteConversation', () => {
  it('returns false when not owned', async () => {
    pushResult({ rows: [] });
    expect(await deleteConversation('cv-x', 'u-other')).toBe(false);
  });

  it('issues a DELETE — messages + actionlog cascade', async () => {
    pushResult({ rows: [convRow()] });
    pushResult({ rows: [], rowCount: 1 });
    expect(await deleteConversation('cv-1', 'u-1')).toBe(true);
    const sqls = calls.map((c) => c.sql).join(' || ');
    expect(sqls).toContain('DELETE FROM agos_cyber_coach_conversation');
  });
});

// ─── appendMessage + listMessages ──────────────────────────────────────────

describe('appendMessage', () => {
  it('serializes tool_calls + redaction_matches as jsonb', async () => {
    pushResult({
      rows: [
        messageRow({
          role: 'assistant',
          content: 'Here are recommendations…',
          tool_calls: [{ id: 'tc-1', name: 'list_open_alerts', input: {} }],
          redacted: true,
          redaction_matches: [{ type: 'aws_access_key', count: 1 }],
          metadata: { model: 'claude-sonnet-4-6' },
        }),
      ],
    });
    const msg = await appendMessage({
      conversationId: 'cv-1',
      role: 'assistant',
      content: 'Here are recommendations…',
      toolCalls: [{ id: 'tc-1', name: 'list_open_alerts', input: {} }],
      redacted: true,
      redactionMatches: [{ type: 'aws_access_key', count: 1 }],
      metadata: { model: 'claude-sonnet-4-6' },
    });
    expect(msg.role).toBe('assistant');
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.redacted).toBe(true);
    expect(msg.redactionMatches[0].type).toBe('aws_access_key');
    expect(calls[0].sql).toContain('INSERT INTO agos_cyber_coach_message');
    // params:
    //   0=id 1=conv 2=role 3=content 4=tool_calls 5=redacted 6=matches 7=metadata
    expect(calls[0].params[5]).toBe(true);
    expect(typeof calls[0].params[6]).toBe('string');
    expect(JSON.parse(calls[0].params[6])).toHaveLength(1);
  });

  it('defaults redacted=false and matches=[] when not supplied', async () => {
    pushResult({ rows: [messageRow()] });
    await appendMessage({
      conversationId: 'cv-1',
      role: 'user',
      content: 'hello',
    });
    expect(calls[0].params[5]).toBe(false);
    expect(JSON.parse(calls[0].params[6])).toEqual([]);
  });
});

describe('listMessages', () => {
  it('denies cross-user via getConversation gate', async () => {
    pushResult({ rows: [] });
    const out = await listMessages({ conversationId: 'cv-x', ownerId: 'u-other' });
    expect(out).toEqual([]);
  });

  it('paginates with limit + offset', async () => {
    pushResult({ rows: [convRow()] });
    pushResult({
      rows: [
        messageRow({ id: 'm-1' }),
        messageRow({ id: 'm-2', role: 'assistant', content: 'hi' }),
      ],
    });
    const out = await listMessages({
      conversationId: 'cv-1',
      ownerId: 'u-1',
      limit: 10,
      offset: 5,
    });
    expect(out).toHaveLength(2);
    const messageCall = calls[1];
    expect(messageCall.sql).toContain('ORDER BY created_at ASC');
    expect(messageCall.params).toContain(10);
    expect(messageCall.params).toContain(5);
  });
});

// ─── logCoachAction ────────────────────────────────────────────────────────

describe('logCoachAction', () => {
  it('inserts into agos_cyber_coach_action_log with owner + (nullable) case', async () => {
    pushResult({ rows: [] });
    await logCoachAction({
      conversationId: 'cv-1',
      messageId: 'm-1',
      ownerId: 'u-1',
      caseId: 'c-1',
      toolName: 'attach_alert_to_case',
      toolInput: { caseId: 'c-1', alertId: 'a-1' },
      toolOutput: { ok: true },
    });
    expect(calls[0].sql).toContain('INSERT INTO agos_cyber_coach_action_log');
    // params: [id, conv, msg, owner, case, tool, input, output]
    expect(calls[0].params[3]).toBe('u-1');
    expect(calls[0].params[4]).toBe('c-1');
    expect(calls[0].params[5]).toBe('attach_alert_to_case');
  });

  it('writes null case_id when unscoped', async () => {
    pushResult({ rows: [] });
    await logCoachAction({
      conversationId: 'cv-1',
      ownerId: 'u-1',
      toolName: 'list_open_alerts',
      toolInput: {},
      toolOutput: { alerts: [] },
    });
    expect(calls[0].params[4]).toBeNull();
  });
});
