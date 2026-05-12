/**
 * Research OS Phase 4 — repo regression tests.
 *
 * Exercises every new Phase 4 repo against a mocked pg Pool. Locks:
 *   - SQL shape (table name + ownership scoping + EXISTS guards)
 *   - Parameter shape + JSONB serialization
 *   - DOI / arXiv duplicate translation (SQLSTATE 23505)
 *   - Soft-archive + restore lifecycle
 *   - Reorder transactional shift logic (BEGIN/COMMIT/ROLLBACK)
 *   - Force-unlink-first contract on author DELETE (in_use)
 *   - Cross-ownership returns null
 *   - Invalid input throws BEFORE issuing SQL
 *
 * @license MIT — Tiresias Research OS Phase 4 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: any[];
  rowCount: number;
}

type QueueItem = PgResult | { __throw: any };

const queue: QueueItem[] = [];
const calls: { sql: string; params: any[] }[] = [];
const clientCalls: { sql: string; params: any[] }[] = [];
const clientQueue: QueueItem[] = [];
const clientReleased = { count: 0 };

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

function pushClientResult(r: Partial<PgResult>): void {
  clientQueue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

function pushThrow(err: any): void {
  queue.push({ __throw: err });
}

vi.mock('@/lib/agentic-os/research/session', () => ({
  getResearchPool: () => ({
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      const next = queue.shift();
      if (next && '__throw' in next) throw next.__throw;
      return next ?? { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => ({
      query: vi.fn(async (sql: string, params: any[] = []) => {
        clientCalls.push({ sql, params });
        const next = clientQueue.shift();
        if (next && '__throw' in next) throw next.__throw;
        return next ?? { rows: [], rowCount: 0 };
      }),
      release: vi.fn(() => {
        clientReleased.count += 1;
      }),
    })),
  }),
  getCurrentResearchUser: vi.fn(),
}));

import {
  listPapers,
  getPaper,
  createPaper,
  updatePaper,
  archivePaper,
  restorePaper,
  countLinkedExperimentsForPaper,
} from '@/lib/agentic-os/research/papers-repo';
import {
  listAuthors,
  getAuthor,
  createAuthor,
  updateAuthor,
  deleteAuthor,
  countLinkedPapersForAuthor,
  authorPaperCounts,
} from '@/lib/agentic-os/research/authors-repo';
import {
  isPaperOwnedByUser,
  isAuthorOwnedByUser,
  listOrderedAuthorsForPaper,
  linkExistingAuthor,
  unlinkAuthor,
  reorderPaperAuthor,
} from '@/lib/agentic-os/research/paper-authors-repo';
import {
  isExperimentOwnedByUser,
  isPaperOwnedByUser as refIsPaperOwned,
  listReferencesForExperiment,
  getReferenceByPair,
  listExperimentsLinkingPaper,
  createReference,
  updateReference,
  deleteReference,
  listRelatedNotebookEntriesForPaper,
} from '@/lib/agentic-os/research/experiment-references-repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  clientCalls.length = 0;
  clientQueue.length = 0;
  clientReleased.count = 0;
});

function paperRow(o: Record<string, any> = {}) {
  return {
    id: 'p-1',
    user_id: 'u-1',
    title: 'A study',
    kind: 'paper',
    doi: null,
    arxiv_id: null,
    url: null,
    authors_text: null,
    venue: null,
    year: 2024,
    abstract_md: null,
    tags: [],
    metadata: {},
    archived_at: null,
    created_at: new Date('2026-05-12T10:00:00Z'),
    updated_at: new Date('2026-05-12T10:00:00Z'),
    ...o,
  };
}

function authorRow(o: Record<string, any> = {}) {
  return {
    id: 'a-1',
    user_id: 'u-1',
    display_name: 'Smith, J.',
    given_name: 'Jane',
    family_name: 'Smith',
    orcid: null,
    affiliation: null,
    metadata: {},
    created_at: new Date('2026-05-12T10:00:00Z'),
    updated_at: new Date('2026-05-12T10:00:00Z'),
    ...o,
  };
}

// ─── papers-repo ──────────────────────────────────────────────────────────

describe('papers-repo — listPapers()', () => {
  it('default scope filters by user_id + archived_at IS NULL', async () => {
    pushResult({ rows: [paperRow()] });
    await listPapers('u-1');
    expect(calls[0].sql).toMatch(/FROM agos_research_papers p/);
    expect(calls[0].sql).toMatch(/p\.user_id = \$1/);
    expect(calls[0].sql).toMatch(/p\.archived_at IS NULL/);
  });

  it('archived=true filters archived only', async () => {
    pushResult({ rows: [] });
    await listPapers('u-1', { archived: true });
    expect(calls[0].sql).toMatch(/p\.archived_at IS NOT NULL/);
  });

  it('kind filter applied as $N parameter', async () => {
    pushResult({ rows: [] });
    await listPapers('u-1', { kind: 'preprint' });
    expect(calls[0].sql).toMatch(/p\.kind = \$\d+/);
    expect(calls[0].params).toContain('preprint');
  });

  it('tag filter uses ANY() against the array', async () => {
    pushResult({ rows: [] });
    await listPapers('u-1', { tag: 'Robotics' });
    expect(calls[0].sql).toMatch(/\$\d+ = ANY\(p\.tags\)/);
    expect(calls[0].params).toContain('robotics');
  });

  it('year filter applied as $N parameter', async () => {
    pushResult({ rows: [] });
    await listPapers('u-1', { year: 2024 });
    expect(calls[0].sql).toMatch(/p\.year = \$\d+/);
    expect(calls[0].params).toContain(2024);
  });

  it('free-text q searches title + authors_text via LIKE', async () => {
    pushResult({ rows: [] });
    await listPapers('u-1', { q: 'Topology' });
    expect(calls[0].sql).toMatch(/LOWER\(p\.title\) LIKE/);
    expect(calls[0].sql).toMatch(/LOWER\(COALESCE\(p\.authors_text, ''\)\) LIKE/);
    expect(calls[0].params.some((p) => typeof p === 'string' && p.includes('topology'))).toBe(true);
  });

  it('orders by updated_at DESC', async () => {
    pushResult({ rows: [] });
    await listPapers('u-1');
    expect(calls[0].sql).toMatch(/ORDER BY p\.updated_at DESC/);
  });

  it('clamps limit + offset', async () => {
    pushResult({ rows: [] });
    await listPapers('u-1', { limit: 9999, offset: -10 });
    const params = calls[0].params;
    const limit = params[params.length - 2];
    const offset = params[params.length - 1];
    expect(limit).toBe(500);
    expect(offset).toBe(0);
  });

  it('throws on invalid kind filter BEFORE issuing SQL', async () => {
    await expect(listPapers('u-1', { kind: 'bogus' as any })).rejects.toThrow();
    expect(calls.length).toBe(0);
  });

  it('hydrates kind back to typed value', async () => {
    pushResult({ rows: [paperRow({ kind: 'preprint' })] });
    const out = await listPapers('u-1');
    expect(out[0].kind).toBe('preprint');
  });

  it('hydrates archived_at to ISO string when set', async () => {
    pushResult({ rows: [paperRow({ archived_at: new Date('2026-01-01T00:00:00Z') })] });
    const out = await listPapers('u-1', { archived: true });
    expect(out[0].archivedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('papers-repo — getPaper()', () => {
  it('returns null on cross-tenant id', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getPaper('p-1', 'u-2')).toBeNull();
  });
  it('returns hydrated paper on owned id', async () => {
    pushResult({ rows: [paperRow()] });
    const out = await getPaper('p-1', 'u-1');
    expect(out?.id).toBe('p-1');
    expect(calls[0].sql).toMatch(/WHERE p\.id = \$1 AND p\.user_id = \$2/);
  });
});

describe('papers-repo — createPaper()', () => {
  it('inserts with default kind = paper when omitted', async () => {
    pushResult({ rows: [] }); // INSERT
    pushResult({ rows: [paperRow()] }); // getPaper
    const out = await createPaper('u-1', { title: 'T' });
    expect(out.kind).toBe('ok');
    expect(calls[0].sql).toMatch(/INSERT INTO agos_research_papers/);
    expect(calls[0].params[3]).toBe('paper');
  });

  it('translates SQLSTATE 23505 with doi constraint to duplicate doi', async () => {
    const err: any = new Error('duplicate key');
    err.code = '23505';
    err.constraint = 'agos_research_papers_user_doi_uniq';
    pushThrow(err);
    const out = await createPaper('u-1', { title: 'T', doi: '10.1/x' });
    expect(out.kind).toBe('duplicate');
    if (out.kind === 'duplicate') expect(out.field).toBe('doi');
  });

  it('translates SQLSTATE 23505 with arxiv constraint to duplicate arxiv', async () => {
    const err: any = new Error('duplicate key');
    err.code = '23505';
    err.constraint = 'agos_research_papers_user_arxiv_uniq';
    pushThrow(err);
    const out = await createPaper('u-1', { title: 'T', arxivId: '2401.12345' });
    expect(out.kind).toBe('duplicate');
    if (out.kind === 'duplicate') expect(out.field).toBe('arxiv_id');
  });

  it('throws on invalid kind BEFORE issuing SQL', async () => {
    await expect(createPaper('u-1', { title: 'T', kind: 'bogus' as any })).rejects.toThrow();
    expect(calls.length).toBe(0);
  });

  it('serializes metadata as JSON string', async () => {
    pushResult({ rows: [] });
    pushResult({ rows: [paperRow()] });
    await createPaper('u-1', { title: 'T', metadata: { source: 'manual' } });
    expect(calls[0].params[12]).toBe(JSON.stringify({ source: 'manual' }));
  });
});

describe('papers-repo — updatePaper()', () => {
  it('returns not_found when UPDATE affects 0 rows', async () => {
    pushResult({ rows: [], rowCount: 0 }); // UPDATE
    const out = await updatePaper('p-1', 'u-2', { title: 'New' });
    expect(out.kind).toBe('not_found');
  });

  it('builds dynamic SET clause only for supplied fields', async () => {
    pushResult({ rows: [{ id: 'p-1' }], rowCount: 1 }); // UPDATE
    pushResult({ rows: [paperRow({ title: 'New' })] }); // getPaper
    await updatePaper('p-1', 'u-1', { title: 'New' });
    expect(calls[0].sql).toMatch(/UPDATE agos_research_papers/);
    expect(calls[0].sql).toMatch(/title = \$/);
    // tags / metadata / venue / year not included
    expect(calls[0].sql).not.toMatch(/venue = /);
  });

  it('translates 23505 on UPDATE to duplicate outcome', async () => {
    const err: any = new Error('duplicate key');
    err.code = '23505';
    err.constraint = 'agos_research_papers_user_doi_uniq';
    pushThrow(err);
    const out = await updatePaper('p-1', 'u-1', { doi: '10.1/x' });
    expect(out.kind).toBe('duplicate');
  });
});

describe('papers-repo — archivePaper / restorePaper', () => {
  it('archivePaper sets archived_at = now() with WHERE archived_at IS NULL', async () => {
    pushResult({ rows: [] }); // UPDATE
    pushResult({ rows: [paperRow({ archived_at: new Date() })] }); // getPaper
    await archivePaper('p-1', 'u-1');
    expect(calls[0].sql).toMatch(/SET archived_at = now\(\)/);
    expect(calls[0].sql).toMatch(/archived_at IS NULL/);
  });

  it('restorePaper returns null on missing paper', async () => {
    pushResult({ rows: [], rowCount: 0 }); // getPaper before
    const out = await restorePaper('p-1', 'u-2');
    expect(out).toBeNull();
  });

  it('restorePaper returns alreadyActive: true when not archived', async () => {
    pushResult({ rows: [paperRow({ archived_at: null })] });
    const out = await restorePaper('p-1', 'u-1');
    expect(out).not.toBeNull();
    if (out) expect(out.alreadyActive).toBe(true);
  });

  it('restorePaper clears archived_at on success', async () => {
    pushResult({ rows: [paperRow({ archived_at: new Date() })] }); // getPaper before
    pushResult({ rows: [] }); // UPDATE
    pushResult({ rows: [paperRow({ archived_at: null })] }); // getPaper after
    const out = await restorePaper('p-1', 'u-1');
    expect(out).not.toBeNull();
    if (out) expect(out.alreadyActive).toBe(false);
    // UPDATE statement is calls[1]
    expect(calls[1].sql).toMatch(/SET archived_at = NULL/);
  });
});

describe('papers-repo — countLinkedExperimentsForPaper', () => {
  it('runs COUNT DISTINCT against the references table', async () => {
    pushResult({ rows: [{ n: 3 }] });
    const out = await countLinkedExperimentsForPaper('p-1', 'u-1');
    expect(out).toBe(3);
    expect(calls[0].sql).toMatch(/COUNT\(DISTINCT er\.experiment_id\)/);
  });
});

// ─── authors-repo ─────────────────────────────────────────────────────────

describe('authors-repo — listAuthors / getAuthor', () => {
  it('listAuthors scopes by user_id + orders by family_name', async () => {
    pushResult({ rows: [authorRow()] });
    await listAuthors('u-1');
    expect(calls[0].sql).toMatch(/FROM agos_research_authors/);
    expect(calls[0].sql).toMatch(/WHERE user_id = \$1/);
    expect(calls[0].sql).toMatch(/ORDER BY family_name ASC NULLS LAST/);
  });

  it('listAuthors family_name_prefix uses LIKE', async () => {
    pushResult({ rows: [] });
    await listAuthors('u-1', { familyNamePrefix: 'Sm' });
    expect(calls[0].sql).toMatch(/LOWER\(COALESCE\(family_name, ''\)\) LIKE/);
    expect(calls[0].params).toContain('sm%');
  });

  it('listAuthors q searches display_name', async () => {
    pushResult({ rows: [] });
    await listAuthors('u-1', { q: 'Smith' });
    expect(calls[0].sql).toMatch(/LOWER\(display_name\) LIKE/);
  });

  it('getAuthor returns null on cross-tenant id', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getAuthor('a-1', 'u-2')).toBeNull();
  });
});

describe('authors-repo — createAuthor', () => {
  it('inserts and returns ok', async () => {
    pushResult({ rows: [] });
    pushResult({ rows: [authorRow()] });
    const out = await createAuthor('u-1', { displayName: 'Smith, J.' });
    expect(out.kind).toBe('ok');
  });

  it('translates 23505 to duplicate orcid', async () => {
    const err: any = new Error('dup');
    err.code = '23505';
    err.constraint = 'agos_research_authors_user_orcid_uniq';
    pushThrow(err);
    const out = await createAuthor('u-1', {
      displayName: 'Smith, J.',
      orcid: '0000-0001-2345-6789',
    });
    expect(out.kind).toBe('duplicate');
  });
});

describe('authors-repo — deleteAuthor (force-unlink-first)', () => {
  it('returns not_found when author missing', async () => {
    pushResult({ rows: [], rowCount: 0 }); // getAuthor
    const out = await deleteAuthor('a-1', 'u-2');
    expect(out.kind).toBe('not_found');
  });

  it('returns in_use when papers still link the author', async () => {
    pushResult({ rows: [authorRow()] }); // getAuthor
    pushResult({ rows: [{ n: 2 }] }); // countLinkedPapersForAuthor
    const out = await deleteAuthor('a-1', 'u-1');
    expect(out.kind).toBe('in_use');
    if (out.kind === 'in_use') expect(out.count).toBe(2);
  });

  it('hard-deletes when no papers link', async () => {
    pushResult({ rows: [authorRow()] }); // getAuthor
    pushResult({ rows: [{ n: 0 }] }); // count
    pushResult({ rows: [], rowCount: 1 }); // DELETE
    const out = await deleteAuthor('a-1', 'u-1');
    expect(out.kind).toBe('ok');
    expect(calls[2].sql).toMatch(/DELETE FROM agos_research_authors/);
  });
});

describe('authors-repo — countLinkedPapersForAuthor', () => {
  it('joins paper_authors to papers + scopes by user_id', async () => {
    pushResult({ rows: [{ n: 5 }] });
    const out = await countLinkedPapersForAuthor('a-1', 'u-1');
    expect(out).toBe(5);
    expect(calls[0].sql).toMatch(/FROM agos_research_paper_authors pa/);
    expect(calls[0].sql).toMatch(/JOIN agos_research_papers p/);
    expect(calls[0].sql).toMatch(/p\.user_id = \$2/);
  });
});

describe('authors-repo — authorPaperCounts batch', () => {
  it('returns empty map when no ids given', async () => {
    const out = await authorPaperCounts('u-1', []);
    expect(out).toEqual({});
    expect(calls.length).toBe(0);
  });
  it('zero-fills ids with no rows', async () => {
    pushResult({ rows: [{ id: 'a-2', n: 3 }] });
    const out = await authorPaperCounts('u-1', ['a-1', 'a-2', 'a-3']);
    expect(out).toEqual({ 'a-1': 0, 'a-2': 3, 'a-3': 0 });
  });
});

// ─── paper-authors-repo ───────────────────────────────────────────────────

describe('paper-authors-repo — ownership probes', () => {
  it('isPaperOwnedByUser returns true on hit', async () => {
    pushResult({ rows: [{}] });
    expect(await isPaperOwnedByUser('p-1', 'u-1')).toBe(true);
  });
  it('isAuthorOwnedByUser returns false on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await isAuthorOwnedByUser('a-1', 'u-2')).toBe(false);
  });
});

describe('paper-authors-repo — listOrderedAuthorsForPaper', () => {
  it('JOINs to authors + double-EXISTS for cross-ownership', async () => {
    pushResult({ rows: [] });
    await listOrderedAuthorsForPaper('p-1', 'u-1');
    expect(calls[0].sql).toMatch(/FROM agos_research_paper_authors pa/);
    expect(calls[0].sql).toMatch(/JOIN agos_research_authors a/);
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_papers p[\s\S]*?p\.user_id = \$2/);
    expect(calls[0].sql).toMatch(/a\.user_id = \$2/);
    expect(calls[0].sql).toMatch(/ORDER BY pa\.position ASC/);
  });
});

describe('paper-authors-repo — linkExistingAuthor', () => {
  it('auto-assigns next position when omitted', async () => {
    pushResult({ rows: [{ next: 4 }] }); // nextPosition probe
    pushResult({ rows: [] }); // INSERT
    pushResult({ rows: [{ id: 'pa-1', paper_id: 'p-1', author_id: 'a-1', position: 4, created_at: new Date() }] }); // SELECT after insert
    const out = await linkExistingAuthor('p-1', 'a-1', undefined);
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') expect(out.link.position).toBe(4);
  });

  it('returns invalid_position for < 1', async () => {
    pushResult({ rows: [{ next: 1 }] });
    const out = await linkExistingAuthor('p-1', 'a-1', 0);
    expect(out.kind).toBe('invalid_position');
  });

  it('translates 23505 author constraint to duplicate_author', async () => {
    const err: any = new Error('dup');
    err.code = '23505';
    err.constraint = 'agos_research_paper_authors_paper_author_uniq';
    pushResult({ rows: [{ next: 1 }] }); // nextPosition probe
    pushThrow(err); // INSERT throws
    const out = await linkExistingAuthor('p-1', 'a-1', undefined);
    expect(out.kind).toBe('duplicate_author');
  });

  it('translates 23505 position constraint to duplicate_position', async () => {
    const err: any = new Error('dup');
    err.code = '23505';
    err.constraint = 'agos_research_paper_authors_paper_position_uniq';
    // position=2 supplied, so nextPosition probe NOT called
    pushThrow(err); // INSERT throws
    const out = await linkExistingAuthor('p-1', 'a-1', 2);
    expect(out.kind).toBe('duplicate_position');
  });
});

describe('paper-authors-repo — unlinkAuthor', () => {
  it('DELETEs with double-EXISTS guard', async () => {
    pushResult({ rows: [], rowCount: 1 });
    await unlinkAuthor('p-1', 'a-1', 'u-1');
    expect(calls[0].sql).toMatch(/DELETE FROM agos_research_paper_authors pa/);
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_papers p/);
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_authors a/);
  });
});

describe('paper-authors-repo — reorderPaperAuthor (transactional)', () => {
  it('rolls back invalid_position when not integer', async () => {
    const out = await reorderPaperAuthor('p-1', 'a-1', 0.5 as any, 'u-1');
    expect(out.kind).toBe('invalid_position');
  });

  it('begins + commits a transaction on success', async () => {
    // 1. BEGIN
    // 2. ownership probe -> rowCount > 0
    // 3. linkRow lookup -> existing row at oldPos=2
    // 4. maxRow lookup -> max=4
    // 5. sentinel UPDATE
    // 6. shift UPDATE
    // 7. final UPDATE
    // 8. COMMIT
    pushClientResult({ rows: [], rowCount: 0 }); // BEGIN
    pushClientResult({ rows: [{}], rowCount: 1 }); // ownership probe
    pushClientResult({ rows: [{ id: 'pa-1', position: 2 }], rowCount: 1 }); // linkRow
    pushClientResult({ rows: [{ m: 4 }], rowCount: 1 }); // maxRow
    pushClientResult({ rows: [], rowCount: 1 }); // sentinel
    pushClientResult({ rows: [], rowCount: 1 }); // shift
    pushClientResult({ rows: [], rowCount: 1 }); // final
    pushClientResult({ rows: [], rowCount: 0 }); // COMMIT
    const out = await reorderPaperAuthor('p-1', 'a-1', 4, 'u-1');
    expect(out.kind).toBe('ok');
    const sqls = clientCalls.map((c) => c.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    expect(clientReleased.count).toBe(1);
  });

  it('rolls back + returns not_found when ownership probe fails', async () => {
    pushClientResult({ rows: [], rowCount: 0 }); // BEGIN
    pushClientResult({ rows: [], rowCount: 0 }); // ownership probe (no row)
    pushClientResult({ rows: [], rowCount: 0 }); // ROLLBACK
    const out = await reorderPaperAuthor('p-1', 'a-1', 2, 'u-2');
    expect(out.kind).toBe('not_found');
    expect(clientCalls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
  });

  it('returns ok no-op when newPos === oldPos', async () => {
    pushClientResult({ rows: [], rowCount: 0 }); // BEGIN
    pushClientResult({ rows: [{}], rowCount: 1 }); // ownership probe
    pushClientResult({ rows: [{ id: 'pa-1', position: 2 }], rowCount: 1 }); // linkRow
    pushClientResult({ rows: [{ m: 3 }], rowCount: 1 }); // maxRow
    pushClientResult({ rows: [], rowCount: 0 }); // COMMIT
    const out = await reorderPaperAuthor('p-1', 'a-1', 2, 'u-1');
    expect(out.kind).toBe('ok');
  });
});

// ─── experiment-references-repo ───────────────────────────────────────────

describe('experiment-references-repo — ownership probes', () => {
  it('isExperimentOwnedByUser hits agos_research_experiments', async () => {
    pushResult({ rows: [{}] });
    expect(await isExperimentOwnedByUser('e-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/FROM agos_research_experiments/);
  });
  it('isPaperOwnedByUser hits agos_research_papers', async () => {
    pushResult({ rows: [{}] });
    expect(await refIsPaperOwned('p-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/FROM agos_research_papers/);
  });
});

describe('experiment-references-repo — listReferencesForExperiment', () => {
  it('joins to papers with double-EXISTS ownership', async () => {
    pushResult({ rows: [] });
    await listReferencesForExperiment('e-1', 'u-1');
    expect(calls[0].sql).toMatch(/FROM agos_research_experiment_references er/);
    expect(calls[0].sql).toMatch(/JOIN agos_research_papers p/);
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_experiments e/);
    expect(calls[0].sql).toMatch(/p\.user_id = \$2/);
  });

  it('hydrates link + paper objects', async () => {
    pushResult({
      rows: [
        {
          id: 'er-1',
          experiment_id: 'e-1',
          paper_id: 'p-1',
          relevance: 'cites',
          notes: 'foo',
          created_at: new Date('2026-05-12T10:00:00Z'),
          p_id: 'p-1',
          p_user_id: 'u-1',
          p_title: 'Title',
          p_kind: 'paper',
          p_doi: null,
          p_arxiv_id: null,
          p_url: null,
          p_authors_text: null,
          p_venue: null,
          p_year: 2024,
          p_abstract_md: null,
          p_tags: [],
          p_metadata: {},
          p_archived_at: null,
          p_created_at: new Date('2026-05-12T10:00:00Z'),
          p_updated_at: new Date('2026-05-12T10:00:00Z'),
        },
      ],
    });
    const out = await listReferencesForExperiment('e-1', 'u-1');
    expect(out.length).toBe(1);
    expect(out[0].link.relevance).toBe('cites');
    expect(out[0].paper.title).toBe('Title');
  });
});

describe('experiment-references-repo — createReference', () => {
  it('inserts with default relevance = cites', async () => {
    pushResult({ rows: [] }); // INSERT
    pushResult({
      rows: [
        {
          id: 'er-1',
          experiment_id: 'e-1',
          paper_id: 'p-1',
          relevance: 'cites',
          notes: null,
          created_at: new Date(),
        },
      ],
    }); // getReferenceByPair
    const out = await createReference('e-1', 'u-1', { paperId: 'p-1' });
    expect(out.kind).toBe('ok');
    expect(calls[0].sql).toMatch(/INSERT INTO agos_research_experiment_references/);
    expect(calls[0].params[3]).toBe('cites');
  });

  it('translates 23505 to duplicate', async () => {
    const err: any = new Error('dup');
    err.code = '23505';
    pushThrow(err);
    const out = await createReference('e-1', 'u-1', { paperId: 'p-1', relevance: 'cites' });
    expect(out.kind).toBe('duplicate');
  });

  it('throws BEFORE issuing SQL on invalid relevance', async () => {
    await expect(
      createReference('e-1', 'u-1', { paperId: 'p-1', relevance: 'bogus' as any }),
    ).rejects.toThrow();
    expect(calls.length).toBe(0);
  });
});

describe('experiment-references-repo — updateReference', () => {
  it('no-op patch falls through to getReferenceByPair', async () => {
    pushResult({ rows: [] }); // getReferenceByPair (no rows)
    const out = await updateReference('e-1', 'p-1', 'u-1', {});
    expect(out).toBeNull();
    expect(calls[0].sql).toMatch(/FROM agos_research_experiment_references er/);
  });

  it('builds dynamic SET clause for supplied fields', async () => {
    pushResult({ rows: [{ id: 'er-1' }], rowCount: 1 }); // UPDATE
    pushResult({
      rows: [
        {
          id: 'er-1',
          experiment_id: 'e-1',
          paper_id: 'p-1',
          relevance: 'methods',
          notes: null,
          created_at: new Date(),
        },
      ],
    });
    await updateReference('e-1', 'p-1', 'u-1', { relevance: 'methods' });
    expect(calls[0].sql).toMatch(/UPDATE agos_research_experiment_references/);
    expect(calls[0].sql).toMatch(/relevance = \$/);
  });

  it('throws on invalid relevance BEFORE issuing SQL', async () => {
    await expect(
      updateReference('e-1', 'p-1', 'u-1', { relevance: 'bogus' as any }),
    ).rejects.toThrow();
    expect(calls.length).toBe(0);
  });
});

describe('experiment-references-repo — deleteReference', () => {
  it('default deletes all rows for the pair', async () => {
    pushResult({ rows: [], rowCount: 2 });
    const out = await deleteReference('e-1', 'p-1', 'u-1');
    expect(out).toBe(2);
    expect(calls[0].sql).toMatch(/DELETE FROM agos_research_experiment_references/);
    expect(calls[0].sql).not.toMatch(/AND er\.relevance/);
  });
  it('narrows to single relevance when supplied', async () => {
    pushResult({ rows: [], rowCount: 1 });
    const out = await deleteReference('e-1', 'p-1', 'u-1', 'methods');
    expect(out).toBe(1);
    expect(calls[0].sql).toMatch(/AND er\.relevance = \$/);
    expect(calls[0].params).toContain('methods');
  });
});

describe('experiment-references-repo — listRelatedNotebookEntriesForPaper', () => {
  it('queries Phase 3 evidence rows where source_kind = paper', async () => {
    pushResult({ rows: [] });
    await listRelatedNotebookEntriesForPaper('p-1', 'u-1');
    expect(calls[0].sql).toMatch(/agos_research_hypothesis_evidence/);
    expect(calls[0].sql).toMatch(/source_kind = 'paper'/);
    expect(calls[0].sql).toMatch(/source_id = \$1/);
    expect(calls[0].sql).toMatch(/he\.user_id\s+= \$2/);
  });
});

describe('experiment-references-repo — listExperimentsLinkingPaper', () => {
  it('joins references to experiments and scopes by user_id', async () => {
    pushResult({ rows: [] });
    await listExperimentsLinkingPaper('p-1', 'u-1');
    expect(calls[0].sql).toMatch(/JOIN agos_research_experiments e/);
    expect(calls[0].sql).toMatch(/e\.user_id = \$2/);
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_papers p/);
  });
});
