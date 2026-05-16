/**
 * Filmmaker OS — Coach test suite.
 *
 * - Conversation CRUD + cross-user denial through the project-FK join.
 * - Message append + paginated list.
 * - Action log row written on tool execution.
 * - buildSystemPrompt covers all 5 modes + 3 hard rules.
 * - add_breakdown_element tool exercises the full path: addBreakdownElement
 *   to the SQL layer + agos_audit + agos_filmmaker_coach_action_log.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  COACH_MODE_LABELS,
  COACH_MODE_VALUES,
} from '@/lib/agentic-os/filmmaker/coach/modes';
import { buildSystemPrompt } from '@/lib/agentic-os/filmmaker/coach/system-prompt';
import type { FilmmakerCoachContext } from '@/lib/agentic-os/filmmaker/coach/context';

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

function fixtureContext(): FilmmakerCoachContext {
  return {
    project: {
      id: 'p-1',
      name: 'Wave Theory',
      format: 'feature',
      status: 'pre_production',
      logline: 'A surfer chases the perfect wave at the edge of physics.',
      phase_progress: {
        development: 80,
        pre_production: 30,
        production: 0,
        post_production: 0,
        distribution: 0,
      },
      target_completion_date: '2027-01-15',
    },
    story_documents: [
      {
        kind: 'treatment',
        title: 'Wave Theory — Treatment',
        word_count: 4200,
        excerpt_240chars: 'A surfer hears about a rumored swell off Nazaré…',
      },
    ],
    characters: [
      {
        id: 'c-1',
        name: 'Hana',
        role: 'protagonist',
        archetype: 'reluctant hero',
        logline: 'Champion surfer with nothing left to prove.',
      },
    ],
    character_relationships_summary: [
      { from_name: 'Hana', to_name: 'Marco', kind: 'rival', tension: 8 },
    ],
    screenplay: {
      version_number: 3,
      page_count_estimate: 102,
      word_count: 15_240,
      scene_count: 56,
      headings: ['1. EXT. NAZARÉ - DAWN', '2. INT. SURF SHACK - DAY'],
    },
    breakdown_summary: {
      category_counts: { cast: 12, props: 30, vehicles: 4 },
      scenes_with_breakdown: 22,
      total_eighths: 480,
    },
    schedule_summary: {
      total_days: 28,
      scheduled_scenes: 14,
      unscheduled_scenes: 42,
      total_scheduled_eighths: 120,
    },
    active_storyboards: [
      { name: 'Opening swell', panel_count: 12, scene_ref: 'sc-1' },
    ],
  };
}

describe('buildSystemPrompt', () => {
  it('renders every mode and includes the hard rules + context', () => {
    const ctx = fixtureContext();
    for (const mode of COACH_MODE_VALUES) {
      const prompt = buildSystemPrompt(ctx, mode);
      expect(prompt).toContain('Filmmaker OS coach');
      // 3 hard rules anchors
      expect(prompt).toContain('production-business specifics');
      expect(prompt).toContain('Never invent facts');
      expect(prompt).toContain('legal or contractual advice');
      // Context block
      expect(prompt).toContain('Wave Theory');
      expect(prompt).toContain('Hana');
      expect(prompt).toContain('Scene headings:');
      // Mode-specific framing token
      const modeMarker: Record<string, string> = {
        development_exec: 'development executive',
        script_reader: 'coverage analyst',
        dialogue_doctor: 'dialogue specialist',
        scheduler: '1st AD',
        general: 'filmmaker collaborator',
      };
      expect(prompt).toContain(modeMarker[mode]);
    }
  });

  it('handles null screenplay + null schedule cleanly', () => {
    const ctx = fixtureContext();
    ctx.screenplay = null;
    ctx.schedule_summary = null;
    const prompt = buildSystemPrompt(ctx, 'general');
    expect(prompt).toContain('(no head version yet)');
    expect(prompt).toContain('(no shooting days yet)');
  });
});

// ─── Repo plumbing (mocked pg) ─────────────────────────────────────────────

interface PgResult {
  rows: unknown[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: unknown[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

vi.mock('@/lib/agentic-os/filmmaker/session', () => ({
  getFilmmakerPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
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
} from '@/lib/agentic-os/filmmaker/coach/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function convRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cv-1',
    project_id: 'p-1',
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

function messageRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'm-1',
    conversation_id: 'cv-1',
    role: 'user',
    content: 'hello',
    tool_calls: null,
    metadata: {},
    created_at: new Date('2026-05-10T00:00:01Z'),
    ...overrides,
  };
}

// ─── createConversation ────────────────────────────────────────────────────

describe('createConversation', () => {
  it('rejects when project not owned by user', async () => {
    pushResult({ rows: [] }); // ownership pre-check
    await expect(
      createConversation({
        projectId: 'p-x',
        userId: 'u-1',
        mode: 'general',
        model: 'claude-sonnet-4-6',
        systemPromptVersion: 'v1',
      }),
    ).rejects.toThrow(/Project not found/);
  });

  it('rejects unknown mode', async () => {
    await expect(
      createConversation({
        projectId: 'p-1',
        userId: 'u-1',
        // @ts-expect-error testing runtime guard
        mode: 'not-a-mode',
        model: 'claude-sonnet-4-6',
        systemPromptVersion: 'v1',
      }),
    ).rejects.toThrow(/Invalid coach mode/);
  });

  it('inserts and returns the conversation row', async () => {
    pushResult({ rows: [{ id: 'p-1' }] }); // ownership
    pushResult({ rows: [convRow({ mode: 'script_reader' })] }); // INSERT … RETURNING
    const conv = await createConversation({
      projectId: 'p-1',
      userId: 'u-1',
      mode: 'script_reader',
      model: 'claude-sonnet-4-6',
      systemPromptVersion: 'v1',
    });
    expect(conv.mode).toBe('script_reader');
    expect(conv.projectId).toBe('p-1');
    expect(calls[0].sql).toContain('agos_filmmaker_projects');
    expect(calls[1].sql).toContain('INSERT INTO agos_filmmaker_coach_conversation');
  });
});

// ─── getConversation / cross-user denial ───────────────────────────────────

describe('getConversation', () => {
  it('joins through project ownership', async () => {
    pushResult({ rows: [convRow()] });
    const c = await getConversation('cv-1', 'u-1');
    expect(c).not.toBeNull();
    expect(calls[0].sql).toContain('JOIN agos_filmmaker_projects');
    expect(calls[0].sql).toContain('p.user_id = $2');
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
    const list = await listConversations({
      projectId: 'p-1',
      userId: 'u-1',
      limit: 25,
    });
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('cv-2');
    expect(calls[0].sql).toContain('ORDER BY c.updated_at DESC');
  });
});

// ─── updateConversation / deleteConversation ──────────────────────────────

describe('updateConversation', () => {
  it('returns null when not owned', async () => {
    pushResult({ rows: [] }); // getConversation
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
    pushResult({ rows: [convRow()] }); // first getConversation
    pushResult({ rows: [] }); // UPDATE
    pushResult({ rows: [convRow({ title: 'New title' })] }); // refetch
    const out = await updateConversation('cv-1', 'u-1', { title: 'New title' });
    expect(out?.title).toBe('New title');
    const sqls = calls.map((c) => c.sql).join(' || ');
    expect(sqls).toContain('UPDATE agos_filmmaker_coach_conversation');
  });
});

describe('deleteConversation', () => {
  it('returns false when not owned', async () => {
    pushResult({ rows: [] });
    expect(await deleteConversation('cv-x', 'u-other')).toBe(false);
  });

  it('issues a single DELETE — messages + actionlog cascade', async () => {
    pushResult({ rows: [convRow()] });
    pushResult({ rows: [], rowCount: 1 });
    expect(await deleteConversation('cv-1', 'u-1')).toBe(true);
    const sqls = calls.map((c) => c.sql).join(' || ');
    expect(sqls).toContain('DELETE FROM agos_filmmaker_coach_conversation');
  });
});

// ─── appendMessage + listMessages ──────────────────────────────────────────

describe('appendMessage', () => {
  it('serializes tool_calls + metadata as jsonb', async () => {
    pushResult({
      rows: [
        messageRow({
          role: 'assistant',
          content: 'Here are notes…',
          tool_calls: [{ id: 'tc-1', name: 'list_characters', input: {} }],
          metadata: { model: 'claude-sonnet-4-6' },
        }),
      ],
    });
    const msg = await appendMessage({
      conversationId: 'cv-1',
      role: 'assistant',
      content: 'Here are notes…',
      toolCalls: [{ id: 'tc-1', name: 'list_characters', input: {} }],
      metadata: { model: 'claude-sonnet-4-6' },
    });
    expect(msg.role).toBe('assistant');
    expect(msg.toolCalls).toHaveLength(1);
    expect(calls[0].sql).toContain('INSERT INTO agos_filmmaker_coach_message');
    // tool_calls param at index 4 is the JSON-encoded array
    expect(typeof calls[0].params[4]).toBe('string');
    expect(JSON.parse(calls[0].params[4] as string)).toHaveLength(1);
  });
});

describe('listMessages', () => {
  it('denies cross-user via getConversation gate', async () => {
    pushResult({ rows: [] }); // getConversation returns nothing
    const out = await listMessages({ conversationId: 'cv-x', userId: 'u-other' });
    expect(out).toEqual([]);
  });

  it('paginates with limit + offset', async () => {
    pushResult({ rows: [convRow()] }); // getConversation
    pushResult({
      rows: [
        messageRow({ id: 'm-1' }),
        messageRow({ id: 'm-2', role: 'assistant', content: 'hi' }),
      ],
    });
    const out = await listMessages({
      conversationId: 'cv-1',
      userId: 'u-1',
      limit: 10,
      offset: 5,
    });
    expect(out).toHaveLength(2);
    // params: [conversationId, limit, offset]
    const messageCall = calls[1];
    expect(messageCall.sql).toContain('ORDER BY created_at ASC');
    expect(messageCall.params).toContain(10);
    expect(messageCall.params).toContain(5);
  });
});

// ─── logCoachAction ────────────────────────────────────────────────────────

describe('logCoachAction', () => {
  it('inserts into agos_filmmaker_coach_action_log with project + user', async () => {
    pushResult({ rows: [] });
    await logCoachAction({
      conversationId: 'cv-1',
      messageId: 'm-1',
      projectId: 'p-1',
      userId: 'u-1',
      toolName: 'add_breakdown_element',
      toolInput: { sceneId: 'sc-1', category: 'props', name: 'Surfboard' },
      toolOutput: { id: 'be-1', name: 'Surfboard' },
    });
    expect(calls[0].sql).toContain('INSERT INTO agos_filmmaker_coach_action_log');
    expect(calls[0].params[3]).toBe('p-1');
    expect(calls[0].params[4]).toBe('u-1');
    expect(calls[0].params[5]).toBe('add_breakdown_element');
  });
});

// ─── add_breakdown_element tool path ──────────────────────────────────────

vi.mock('@/lib/agentic-os/filmmaker/repo', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/agentic-os/filmmaker/repo');
  return {
    ...actual,
    addBreakdownElement: vi.fn(async (argsIn: unknown) => {
      const args = argsIn as { sceneId: string; data: Record<string, unknown> };
      return {
        id: 'be-99',
        screenplayId: 'sp-1',
        sceneId: args.sceneId,
        category: args.data.category,
        name: args.data.name,
        description: args.data.description ?? null,
        quantity: args.data.quantity ?? 1,
        isPrincipal: args.data.isPrincipal ?? false,
        characterId: null,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }),
    recordAudit: vi.fn(async () => undefined),
    getProject: vi.fn(),
    listCharacters: vi.fn(),
    getCharacter: vi.fn(),
    getScreenplayByProject: vi.fn(),
    listScreenplayScenes: vi.fn(),
    getStoryDocument: vi.fn(),
    updateStoryDocument: vi.fn(),
    getProjectBreakdownSummary: vi.fn(),
    getProjectScheduleSummary: vi.fn(),
  };
});

import { buildCoachTools } from '@/lib/agentic-os/filmmaker/coach/tools';
import * as filmmakerRepo from '@/lib/agentic-os/filmmaker/repo';

describe('add_breakdown_element tool', () => {
  it('calls addBreakdownElement, writes audit, writes action_log', async () => {
    pushResult({ rows: [] }); // logCoachAction insert
    const tools = buildCoachTools({
      projectId: 'p-1',
      userId: 'u-1',
      conversationId: 'cv-1',
    });
    const tool = tools.add_breakdown_element;
    const out = await (tool.execute as unknown as (...args: unknown[]) => Promise<Record<string, unknown>>)(
      {
        sceneId: '00000000-0000-0000-0000-000000000001',
        category: 'props',
        name: 'Surfboard',
        description: 'long board',
        quantity: 2,
        isPrincipal: true,
      },
      { toolCallId: 't-1', messages: [], abortSignal: new AbortController().signal },
    );
    expect(out.id).toBe('be-99');
    expect(out.category).toBe('props');
    expect(filmmakerRepo.addBreakdownElement).toHaveBeenCalledOnce();
    expect(filmmakerRepo.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'filmmaker.coach.add_breakdown_element',
        actorId: 'u-1',
        projectId: 'p-1',
      }),
    );
    expect(calls.some((c) => c.sql.includes('agos_filmmaker_coach_action_log'))).toBe(
      true,
    );
  });
});
