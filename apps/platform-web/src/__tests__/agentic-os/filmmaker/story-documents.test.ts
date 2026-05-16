/**
 * Filmmaker OS — Story documents test suite.
 *
 * Two suites in one file:
 *
 * 1. Pure helpers (`extractPlainText`, `countWords`, kind taxonomy).
 *
 * 2. Repo plumbing against a mocked pg Pool (same harness as the
 *    Project Hub regression tests). Verifies:
 *      - create/update/delete roundtrips compute content_text + word_count
 *      - snapshot writes a version row + returns it
 *      - restore copies content back AND snapshots pre-restore state
 *      - tenant + user scoping prevents cross-tenant reads
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  STORY_DOCUMENT_KINDS,
  STORY_DOCUMENT_KIND_VALUES,
  extractPlainText,
  countWords,
  validateStoryDocumentKind,
  getStoryDocumentKindInfo,
} from '@/lib/agentic-os/filmmaker/story-documents';

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('STORY_DOCUMENT_KINDS', () => {
  it('has exactly five kinds in spec order', () => {
    expect(STORY_DOCUMENT_KINDS.map((k) => k.kind)).toEqual([
      'bible',
      'treatment',
      'logline',
      'outline',
      'pitch_deck',
    ]);
  });

  it('every kind has a label, description, and defaultTitle producer', () => {
    for (const k of STORY_DOCUMENT_KINDS) {
      expect(k.label).toBeTruthy();
      expect(k.description).toBeTruthy();
      expect(typeof k.defaultTitle).toBe('function');
      expect(k.defaultTitle('Foo')).toContain('Foo');
    }
  });

  it('STORY_DOCUMENT_KIND_VALUES matches STORY_DOCUMENT_KINDS', () => {
    expect([...STORY_DOCUMENT_KIND_VALUES]).toEqual(STORY_DOCUMENT_KINDS.map((k) => k.kind));
  });
});

describe('validateStoryDocumentKind', () => {
  it('returns null for valid kinds', () => {
    for (const k of STORY_DOCUMENT_KIND_VALUES) {
      expect(validateStoryDocumentKind(k)).toBeNull();
    }
  });

  it('returns an error string for invalid input', () => {
    expect(validateStoryDocumentKind('synopsis')).not.toBeNull();
    expect(validateStoryDocumentKind(42)).not.toBeNull();
    expect(validateStoryDocumentKind(null)).not.toBeNull();
  });
});

describe('getStoryDocumentKindInfo', () => {
  it('returns the info entry for a known kind', () => {
    expect(getStoryDocumentKindInfo('bible').label).toBe('Series Bible');
  });

  it('throws on unknown kind', () => {
    expect(() => getStoryDocumentKindInfo('synopsis' as never)).toThrow();
  });
});

describe('extractPlainText', () => {
  it('returns empty string for null / non-object', () => {
    expect(extractPlainText(null)).toBe('');
    expect(extractPlainText(undefined)).toBe('');
    expect(extractPlainText('not a doc')).toBe('');
    expect(extractPlainText(42)).toBe('');
  });

  it('returns empty string for an empty doc', () => {
    expect(extractPlainText({ type: 'doc', content: [] })).toBe('');
  });

  it('concatenates text from a flat paragraph', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ],
    };
    expect(extractPlainText(doc)).toBe('Hello world');
  });

  it('walks nested marks and multiple paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'First ' },
            { type: 'text', text: 'sentence.', marks: [{ type: 'bold' }] },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Second.' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'A bullet' }],
                },
              ],
            },
          ],
        },
      ],
    };
    const text = extractPlainText(doc);
    expect(text).toContain('First');
    expect(text).toContain('sentence.');
    expect(text).toContain('Second.');
    expect(text).toContain('A bullet');
  });

  it('collapses whitespace', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'a\n\nb   c' }],
        },
      ],
    };
    expect(extractPlainText(doc)).toBe('a b c');
  });
});

describe('countWords', () => {
  it('returns 0 for empty / whitespace', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('\n\t')).toBe(0);
  });

  it('returns 0 for non-string input', () => {
    expect(countWords(null as never)).toBe(0);
    expect(countWords(undefined as never)).toBe(0);
  });

  it('counts a single word', () => {
    expect(countWords('hello')).toBe(1);
  });

  it('splits on any whitespace', () => {
    expect(countWords('the quick brown fox')).toBe(4);
    expect(countWords('a\tb\nc')).toBe(3);
    expect(countWords('  spaced   out   words  ')).toBe(3);
  });

  it('treats punctuation glued to a word as part of the word', () => {
    // We don't strip punctuation — TipTap text already separates by whitespace.
    expect(countWords('Hello, world!')).toBe(2);
  });
});

// ─── Repo plumbing (mocked pg) ───────────────────────────────────────────────

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
  }),
}));

import {
  listStoryDocuments,
  getStoryDocument,
  createStoryDocument,
  updateStoryDocument,
  deleteStoryDocument,
  snapshotStoryDocument,
  listStoryDocumentVersions,
  restoreStoryDocumentVersion,
} from '@/lib/agentic-os/filmmaker/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

function docRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'd-1',
    project_id: 'p-1',
    kind: 'bible',
    title: 'Test Bible',
    content_json: { type: 'doc', content: [] },
    content_text: '',
    version: 1,
    word_count: 0,
    metadata: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

function versionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'v-1',
    document_id: 'd-1',
    version: 1,
    content_json: { type: 'doc', content: [] },
    content_text: '',
    word_count: 0,
    created_at: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

function projectRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p-1',
    user_id: 'u-1',
    name: 'My Film',
    description: null,
    status: 'pre_production',
    tags: [],
    format: 'feature',
    logline: null,
    cover_image_url: null,
    phase_progress: {
      development: 0,
      pre_production: 0,
      production: 0,
      post_production: 0,
      distribution: 0,
    },
    target_completion_date: null,
    team_size: null,
    metadata: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

// ─── listStoryDocuments ──────────────────────────────────────────────────────

describe('listStoryDocuments', () => {
  it('returns rows joined through the projects table', async () => {
    pushResult({ rows: [docRow({ kind: 'bible' }), docRow({ id: 'd-2', kind: 'treatment' })] });
    const docs = await listStoryDocuments('p-1', 't-1', 'u-1');
    expect(docs).toHaveLength(2);
    expect(docs[0].kind).toBe('bible');
    expect(docs[1].kind).toBe('treatment');
    // SQL must include the ownership join.
    expect(calls[0].sql).toContain('agos_filmmaker_projects');
    expect(calls[0].sql).toContain('p.user_id = $2');
    expect(calls[0].params).toEqual(['p-1', 'u-1']);
  });

  it('returns [] when the project is not owned by the user (cross-tenant)', async () => {
    pushResult({ rows: [] });
    const docs = await listStoryDocuments('p-1', 't-1', 'other-user');
    expect(docs).toEqual([]);
  });
});

// ─── getStoryDocument ────────────────────────────────────────────────────────

describe('getStoryDocument', () => {
  it('returns null when no row matches', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getStoryDocument('d-1', 't-1', 'u-1')).toBeNull();
  });

  it('returns the row when present', async () => {
    pushResult({ rows: [docRow({ title: 'My Bible' })] });
    const d = await getStoryDocument('d-1', 't-1', 'u-1');
    expect(d?.title).toBe('My Bible');
    expect(calls[0].sql).toContain('p.user_id = $2');
  });
});

// ─── createStoryDocument ─────────────────────────────────────────────────────

describe('createStoryDocument', () => {
  it('refuses unknown kinds', async () => {
    await expect(
      createStoryDocument({
        projectId: 'p-1',
        tenantId: 't-1',
        userId: 'u-1',
        kind: 'synopsis' as never,
      }),
    ).rejects.toThrow(/Invalid story document kind/);
  });

  it('returns null project => throws', async () => {
    // getProject lookup
    pushResult({ rows: [], rowCount: 0 });
    await expect(
      createStoryDocument({
        projectId: 'p-missing',
        tenantId: 't-1',
        userId: 'u-1',
        kind: 'bible',
      }),
    ).rejects.toThrow(/Project not found/);
  });

  it('uses the default kind title when none supplied', async () => {
    // 1. getProject lookup
    pushResult({ rows: [projectRow({ name: 'Cargo Cult' })] });
    // 2. INSERT (no rows returned)
    pushResult({ rows: [] });
    // 3. getStoryDocument refetch
    pushResult({ rows: [docRow({ title: 'Cargo Cult — Bible' })] });

    const created = await createStoryDocument({
      projectId: 'p-1',
      tenantId: 't-1',
      userId: 'u-1',
      kind: 'bible',
    });
    expect(created.title).toBe('Cargo Cult — Bible');
    // The INSERT params should carry the computed title.
    const insertCall = calls[1];
    expect(insertCall.params[3]).toBe('Cargo Cult — Bible');
    expect(insertCall.params[2]).toBe('bible');
  });

  it('seeds content_text + word_count from contentJson', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [] });
    pushResult({ rows: [docRow({ content_text: 'Hello world', word_count: 2 })] });

    const doc = await createStoryDocument({
      projectId: 'p-1',
      tenantId: 't-1',
      userId: 'u-1',
      kind: 'logline',
      contentJson: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello world' }],
          },
        ],
      },
    });
    expect(doc.wordCount).toBe(2);

    // INSERT params: content_text at index 5, word_count at index 6.
    const insertCall = calls[1];
    expect(insertCall.params[5]).toBe('Hello world');
    expect(insertCall.params[6]).toBe(2);
  });
});

// ─── updateStoryDocument ─────────────────────────────────────────────────────

describe('updateStoryDocument', () => {
  it('returns null when document is not owned by user', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const r = await updateStoryDocument({
      id: 'd-1',
      tenantId: 't-1',
      userId: 'other-user',
      title: 'Hacked',
    });
    expect(r).toBeNull();
  });

  it('recomputes content_text + word_count when contentJson changes', async () => {
    pushResult({ rows: [docRow()] }); // initial getStoryDocument
    pushResult({ rows: [] }); // UPDATE
    pushResult({ rows: [docRow({ content_text: 'a b c', word_count: 3, version: 2 })] }); // refetch

    const r = await updateStoryDocument({
      id: 'd-1',
      tenantId: 't-1',
      userId: 'u-1',
      contentJson: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'a b c' }],
          },
        ],
      },
    });
    expect(r?.wordCount).toBe(3);

    const updateCall = calls[1];
    // SET title=$2, content_json=$3, content_text=$4, word_count=$5
    expect(updateCall.params[3]).toBe('a b c');
    expect(updateCall.params[4]).toBe(3);
  });

  it('keeps existing content_text when only title changes', async () => {
    pushResult({ rows: [docRow({ content_text: 'keep me', word_count: 2 })] });
    pushResult({ rows: [] });
    pushResult({ rows: [docRow({ title: 'New Title', content_text: 'keep me', word_count: 2 })] });

    await updateStoryDocument({
      id: 'd-1',
      tenantId: 't-1',
      userId: 'u-1',
      title: 'New Title',
    });

    const updateCall = calls[1];
    expect(updateCall.params[3]).toBe('keep me'); // unchanged
    expect(updateCall.params[4]).toBe(2);
  });
});

// ─── snapshotStoryDocument ───────────────────────────────────────────────────

describe('snapshotStoryDocument', () => {
  it('writes a version row + returns it', async () => {
    pushResult({ rows: [docRow({ version: 3, content_text: 'snap me', word_count: 2 })] });
    pushResult({ rows: [] }); // INSERT
    pushResult({ rows: [versionRow({ version: 3, content_text: 'snap me', word_count: 2 })] });

    const v = await snapshotStoryDocument({
      id: 'd-1',
      tenantId: 't-1',
      userId: 'u-1',
    });
    expect(v?.version).toBe(3);
    expect(v?.contentText).toBe('snap me');
    expect(calls[1].sql).toContain('INSERT INTO agos_filmmaker_story_document_versions');
  });

  it('returns null when document is not owned', async () => {
    pushResult({ rows: [], rowCount: 0 });
    const v = await snapshotStoryDocument({ id: 'd-x', tenantId: 't-1', userId: 'u-1' });
    expect(v).toBeNull();
  });
});

// ─── listStoryDocumentVersions ───────────────────────────────────────────────

describe('listStoryDocumentVersions', () => {
  it('returns [] when document is not owned', async () => {
    pushResult({ rows: [] }); // getStoryDocument
    expect(await listStoryDocumentVersions('d-1', 't-1', 'other-user')).toEqual([]);
  });

  it('returns ordered version rows', async () => {
    pushResult({ rows: [docRow()] });
    pushResult({
      rows: [versionRow({ id: 'v-3', version: 3 }), versionRow({ id: 'v-1', version: 1 })],
    });
    const vs = await listStoryDocumentVersions('d-1', 't-1', 'u-1');
    expect(vs.map((v) => v.version)).toEqual([3, 1]);
  });
});

// ─── restoreStoryDocumentVersion ─────────────────────────────────────────────

describe('restoreStoryDocumentVersion', () => {
  it('snapshots current state, copies target back, bumps version', async () => {
    // 1. getStoryDocument (live)
    pushResult({ rows: [docRow({ version: 5 })] });
    // 2. SELECT version-row
    pushResult({
      rows: [versionRow({ id: 'v-2', version: 2, content_text: 'old', word_count: 1 })],
    });
    // 3. snapshotStoryDocument internals:
    //    a. getStoryDocument
    pushResult({ rows: [docRow({ version: 5 })] });
    //    b. INSERT version row
    pushResult({ rows: [] });
    //    c. SELECT inserted row
    pushResult({ rows: [versionRow({ id: 'v-pre', version: 5 })] });
    // 4. UPDATE story_documents
    pushResult({ rows: [] });
    // 5. getStoryDocument refetch
    pushResult({ rows: [docRow({ version: 6, content_text: 'old', word_count: 1 })] });

    const r = await restoreStoryDocumentVersion({
      documentId: 'd-1',
      versionId: 'v-2',
      tenantId: 't-1',
      userId: 'u-1',
    });
    expect(r?.version).toBe(6);
    expect(r?.contentText).toBe('old');
  });

  it('returns null when version row not found', async () => {
    pushResult({ rows: [docRow()] }); // live doc OK
    pushResult({ rows: [], rowCount: 0 }); // version SELECT empty
    const r = await restoreStoryDocumentVersion({
      documentId: 'd-1',
      versionId: 'v-missing',
      tenantId: 't-1',
      userId: 'u-1',
    });
    expect(r).toBeNull();
  });
});

// ─── deleteStoryDocument ─────────────────────────────────────────────────────

describe('deleteStoryDocument', () => {
  it('refuses to delete a document not owned by the user', async () => {
    pushResult({ rows: [] }); // getStoryDocument
    const ok = await deleteStoryDocument('d-1', 't-1', 'other-user');
    expect(ok).toBe(false);
    // No DELETE issued.
    expect(calls.length).toBe(1);
  });

  it('deletes when owned', async () => {
    pushResult({ rows: [docRow()] });
    pushResult({ rowCount: 1, rows: [] });
    const ok = await deleteStoryDocument('d-1', 't-1', 'u-1');
    expect(ok).toBe(true);
    expect(calls[1].sql).toContain('DELETE FROM agos_filmmaker_story_documents');
  });
});
