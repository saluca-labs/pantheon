/**
 * Maker OS — Phase 5 repo CRUD tests.
 *
 * Mocks the pg Pool and asserts the SQL shape + ownership wiring for the
 * new spec-sheet / reference / project-reference repo functions.
 *
 * Covers:
 *   - listSpecSheets filter wiring (attachment/part_id/tool_id/project_id/
 *     kind/tag).
 *   - createSpecSheet kind validation + attachment-exclusivity gate +
 *     cross-ownership check on part/tool.
 *   - updateSpecSheet COALESCE wiring.
 *   - listSpecSheetsForProject union query.
 *   - listReferences filter wiring (kind, tag).
 *   - createReference kind validation.
 *   - listReferencesForProject join wiring + cross-ownership.
 *   - attachReferenceToProject requires BOTH project + reference ownership.
 *   - detachReferenceFromProject + updateProjectReferenceLink.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Pool mock ────────────────────────────────────────────────────────────

interface PgResult {
  rows: unknown[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: unknown[] }[] = [];
let lastInsertedId: string | null = null;

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

vi.mock('@/lib/agentic-os/maker/session', () => ({
  getMakerPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/^INSERT INTO /m.test(sql) && typeof params[0] === 'string') {
        lastInsertedId = params[0];
      }
      const next = queue.shift() ?? { rows: [], rowCount: 0 };
      if (lastInsertedId && next.rows[0] && /^SELECT /m.test(sql)) {
        next.rows[0] = { ...next.rows[0], id: lastInsertedId };
      }
      return next;
    }),
  }),
}));

import {
  listSpecSheets,
  getSpecSheet,
  createSpecSheet,
  updateSpecSheet,
  deleteSpecSheet,
  listSpecSheetsForProject,
  listReferences,
  getReference,
  createReference,
  updateReference,
  deleteReference,
  listReferencesForProject,
  attachReferenceToProject,
  updateProjectReferenceLink,
  detachReferenceFromProject,
} from '@/lib/agentic-os/maker/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  lastInsertedId = null;
});

function projectRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p-1',
    user_id: 'u-1',
    name: 'CNC v2',
    description: null,
    status: 'concept',
    tags: [],
    cover_image_url: null,
    target_completion_date: null,
    team_size: null,
    phase_progress: {},
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function specSheetRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 's-1',
    user_id: 'u-1',
    title: 'NEMA17 datasheet',
    kind: 'datasheet',
    url: 'https://example.com/datasheet.pdf',
    notes: null,
    revision: null,
    issued_at: null,
    part_id: 'pa-1',
    tool_id: null,
    project_id: null,
    tags: ['stepper'],
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function partRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pa-1',
    user_id: 'u-1',
    name: 'NEMA 17 stepper',
    category: 'mechanical',
    manufacturer: null,
    mfg_part_number: null,
    unit: 'pcs',
    parent_part_catalog_id: null,
    quantity_on_hand: 4,
    default_supplier_id: null,
    datasheet_url: null,
    image_url: null,
    tags: [],
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function toolRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 't-1',
    user_id: 'u-1',
    name: 'Shapeoko',
    kind: 'cnc',
    manufacturer: null,
    model: null,
    serial: null,
    location: null,
    status: 'active',
    purchased_at: null,
    image_url: null,
    datasheet_url: null,
    manual_url: null,
    notes: null,
    tags: [],
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function referenceRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'r-1',
    user_id: 'u-1',
    title: 'Attention is all you need',
    kind: 'paper',
    url: 'https://arxiv.org/abs/1706.03762',
    authors: 'Vaswani et al.',
    publisher: 'NeurIPS',
    published_at: new Date('2017-12-06T00:00:00Z'),
    notes: null,
    tags: ['transformers'],
    metadata: {},
    created_at: new Date('2026-05-11T00:00:00Z'),
    updated_at: new Date('2026-05-11T00:00:00Z'),
    ...over,
  };
}

function projectReferenceJoinedRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pr-1',
    project_id: 'p-1',
    reference_id: 'r-1',
    notes: null,
    created_at: new Date('2026-05-11T00:00:00Z'),
    reference_title: 'Attention is all you need',
    reference_kind: 'paper',
    reference_url: 'https://arxiv.org/abs/1706.03762',
    reference_authors: 'Vaswani et al.',
    reference_publisher: 'NeurIPS',
    reference_published_at: new Date('2017-12-06T00:00:00Z'),
    reference_tags: ['transformers'],
    ...over,
  };
}

// ─── Spec sheets ───────────────────────────────────────────────────────────

describe('listSpecSheets', () => {
  it('returns all rows for a user when no filters', async () => {
    pushResult({ rows: [specSheetRow(), specSheetRow({ id: 's-2' })] });
    const sheets = await listSpecSheets({ userId: 'u-1' });
    expect(sheets).toHaveLength(2);
    expect(calls[0]!.sql).toMatch(/FROM agos_maker_spec_sheets/);
    expect(calls[0]!.sql).toMatch(/WHERE user_id = \$1/);
    expect(calls[0]!.params).toEqual(['u-1']);
  });

  it('forwards attachment=part filter', async () => {
    pushResult({ rows: [] });
    await listSpecSheets({ userId: 'u-1', attachment: 'part' });
    expect(calls[0]!.sql).toMatch(/part_id IS NOT NULL/);
  });

  it('forwards attachment=tool filter', async () => {
    pushResult({ rows: [] });
    await listSpecSheets({ userId: 'u-1', attachment: 'tool' });
    expect(calls[0]!.sql).toMatch(/tool_id IS NOT NULL/);
  });

  it('forwards attachment=project filter', async () => {
    pushResult({ rows: [] });
    await listSpecSheets({ userId: 'u-1', attachment: 'project' });
    expect(calls[0]!.sql).toMatch(/project_id IS NOT NULL/);
  });

  it('forwards partId / toolId / projectId / kind / tag filters', async () => {
    pushResult({ rows: [] });
    await listSpecSheets({
      userId: 'u-1',
      partId: 'pa-1',
      kind: 'datasheet',
      tag: 'stepper',
    });
    const sql = calls[0]!.sql;
    expect(sql).toMatch(/part_id = \$2/);
    expect(sql).toMatch(/kind = \$3/);
    expect(sql).toMatch(/= ANY\(tags\)/);
    expect(calls[0]!.params).toEqual(['u-1', 'pa-1', 'datasheet', 'stepper']);
  });

  it('rejects an invalid kind at the application layer', async () => {
    await expect(
      listSpecSheets({ userId: 'u-1', kind: 'schematic' as never }),
    ).rejects.toThrow(/Invalid kind/);
  });
});

describe('getSpecSheet', () => {
  it('returns null when not owned', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getSpecSheet('s-1', 'u-1')).toBeNull();
  });

  it('returns mapped sheet when owned', async () => {
    pushResult({ rows: [specSheetRow({ tags: ['stepper'] })] });
    const sheet = await getSpecSheet('s-1', 'u-1');
    expect(sheet?.id).toBe('s-1');
    expect(sheet?.partId).toBe('pa-1');
    expect(sheet?.tags).toEqual(['stepper']);
  });
});

describe('createSpecSheet', () => {
  it('rejects invalid kind before any SQL', async () => {
    await expect(
      createSpecSheet('u-1', {
        title: 'X',
        url: 'http://x',
        kind: 'schematic' as never,
        partId: 'pa-1',
      }),
    ).rejects.toThrow(/Invalid kind/);
    expect(calls).toHaveLength(0);
  });

  it('rejects zero attachments', async () => {
    await expect(
      createSpecSheet('u-1', { title: 'X', url: 'http://x' }),
    ).rejects.toThrow(/required/);
  });

  it('rejects two attachments', async () => {
    await expect(
      createSpecSheet('u-1', {
        title: 'X',
        url: 'http://x',
        partId: 'pa-1',
        toolId: 't-1',
      }),
    ).rejects.toThrow(/not more/);
  });

  it('rejects when attaching to a part not owned by the user', async () => {
    pushResult({ rows: [], rowCount: 0 }); // catalog ownership fails
    await expect(
      createSpecSheet('u-1', {
        title: 'X',
        url: 'http://x',
        partId: 'pa-1',
      }),
    ).rejects.toThrow(/Part not found/);
  });

  it('rejects when attaching to a tool not owned by the user', async () => {
    pushResult({ rows: [], rowCount: 0 }); // tool ownership fails
    await expect(
      createSpecSheet('u-1', {
        title: 'X',
        url: 'http://x',
        toolId: 't-1',
      }),
    ).rejects.toThrow(/Tool not found/);
  });

  it('inserts then re-reads on part-attached create', async () => {
    pushResult({ rows: [partRow()] }); // catalog ownership
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({ rows: [specSheetRow()] }); // SELECT
    const sheet = await createSpecSheet('u-1', {
      title: 'NEMA17 datasheet',
      url: 'https://example.com/datasheet.pdf',
      partId: 'pa-1',
    });
    expect(sheet.id).toBeTruthy();
    const insert = calls.find((c) => /INSERT INTO agos_maker_spec_sheets/.test(c.sql));
    expect(insert).toBeTruthy();
  });

  it('inserts then re-reads on project-attached create (no ownership check)', async () => {
    // project_id has no FK and no ownership pre-check.
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({
      rows: [specSheetRow({ part_id: null, project_id: 'p-1' })],
    }); // SELECT
    const sheet = await createSpecSheet('u-1', {
      title: 'Build BOM v1',
      url: 'https://example.com/bom.xlsx',
      projectId: 'p-1',
    });
    expect(sheet.projectId).toBe('p-1');
    // No catalog/tool ownership pre-query happened.
    expect(calls).toHaveLength(2);
  });
});

describe('updateSpecSheet', () => {
  it('issues a COALESCE UPDATE and re-reads', async () => {
    pushResult({ rowCount: 1, rows: [] }); // UPDATE
    pushResult({ rows: [specSheetRow({ title: 'New title' })] }); // SELECT
    const sheet = await updateSpecSheet('s-1', 'u-1', { title: 'New title' });
    expect(sheet?.title).toBe('New title');
    expect(calls[0]!.sql).toMatch(/UPDATE agos_maker_spec_sheets/);
    expect(calls[0]!.sql).toMatch(/title\s+= COALESCE/);
  });

  it('rejects invalid kind patch', async () => {
    await expect(
      updateSpecSheet('s-1', 'u-1', { kind: 'schematic' as never }),
    ).rejects.toThrow(/Invalid kind/);
  });
});

describe('deleteSpecSheet', () => {
  it('returns true on successful delete', async () => {
    pushResult({ rowCount: 1, rows: [] });
    expect(await deleteSpecSheet('s-1', 'u-1')).toBe(true);
    expect(calls[0]!.sql).toMatch(/DELETE FROM agos_maker_spec_sheets/);
  });

  it('returns false when no row matched', async () => {
    pushResult({ rowCount: 0, rows: [] });
    expect(await deleteSpecSheet('s-x', 'u-1')).toBe(false);
  });
});

describe('listSpecSheetsForProject', () => {
  it('asserts project ownership then runs the union query', async () => {
    pushResult({ rows: [projectRow()] }); // ownership
    pushResult({ rows: [specSheetRow()] }); // SELECT union
    const sheets = await listSpecSheetsForProject('p-1', 'u-1');
    expect(sheets).toHaveLength(1);
    expect(calls[1]!.sql).toMatch(/WITH bom_parts AS/);
    expect(calls[1]!.sql).toMatch(/project_tool_ids AS/);
    expect(calls[1]!.sql).toMatch(/FROM agos_maker_spec_sheets/);
  });

  it('refuses on non-owned project', async () => {
    pushResult({ rows: [], rowCount: 0 });
    await expect(listSpecSheetsForProject('p-1', 'u-2')).rejects.toThrow(
      /not owned/,
    );
  });
});

// ─── References ────────────────────────────────────────────────────────────

describe('listReferences', () => {
  it('returns all rows for a user when no filters', async () => {
    pushResult({ rows: [referenceRow()] });
    const refs = await listReferences({ userId: 'u-1' });
    expect(refs).toHaveLength(1);
    expect(calls[0]!.sql).toMatch(/FROM agos_maker_references/);
    expect(calls[0]!.sql).toMatch(/WHERE user_id = \$1/);
  });

  it('forwards kind + tag filters', async () => {
    pushResult({ rows: [] });
    await listReferences({ userId: 'u-1', kind: 'paper', tag: 'transformers' });
    const sql = calls[0]!.sql;
    expect(sql).toMatch(/kind = \$2/);
    expect(sql).toMatch(/= ANY\(tags\)/);
    expect(calls[0]!.params).toEqual(['u-1', 'paper', 'transformers']);
  });

  it('rejects an invalid kind at the application layer', async () => {
    await expect(
      listReferences({ userId: 'u-1', kind: 'zine' as never }),
    ).rejects.toThrow(/Invalid kind/);
  });
});

describe('getReference', () => {
  it('returns null when not owned', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getReference('r-1', 'u-1')).toBeNull();
  });

  it('returns mapped reference when owned', async () => {
    pushResult({ rows: [referenceRow()] });
    const ref = await getReference('r-1', 'u-1');
    expect(ref?.id).toBe('r-1');
    expect(ref?.kind).toBe('paper');
    expect(ref?.publishedAt).toBe('2017-12-06');
  });
});

describe('createReference', () => {
  it('rejects invalid kind before any SQL', async () => {
    await expect(
      createReference('u-1', {
        title: 'X',
        url: 'http://x',
        kind: 'zine' as never,
      }),
    ).rejects.toThrow(/Invalid kind/);
    expect(calls).toHaveLength(0);
  });

  it('inserts then re-reads', async () => {
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    pushResult({ rows: [referenceRow()] }); // SELECT
    const r = await createReference('u-1', {
      title: 'Attention is all you need',
      url: 'https://arxiv.org/abs/1706.03762',
    });
    expect(r.id).toBeTruthy();
    expect(calls[0]!.sql).toMatch(/INSERT INTO agos_maker_references/);
  });
});

describe('updateReference', () => {
  it('issues a COALESCE UPDATE and re-reads', async () => {
    pushResult({ rowCount: 1, rows: [] });
    pushResult({ rows: [referenceRow({ title: 'New title' })] });
    const r = await updateReference('r-1', 'u-1', { title: 'New title' });
    expect(r?.title).toBe('New title');
    expect(calls[0]!.sql).toMatch(/UPDATE agos_maker_references/);
    expect(calls[0]!.sql).toMatch(/title\s+= COALESCE/);
  });

  it('rejects invalid kind patch', async () => {
    await expect(
      updateReference('r-1', 'u-1', { kind: 'zine' as never }),
    ).rejects.toThrow(/Invalid kind/);
  });
});

describe('deleteReference', () => {
  it('returns true on successful delete', async () => {
    pushResult({ rowCount: 1, rows: [] });
    expect(await deleteReference('r-1', 'u-1')).toBe(true);
    expect(calls[0]!.sql).toMatch(/DELETE FROM agos_maker_references/);
  });

  it('returns false when no row matched', async () => {
    pushResult({ rowCount: 0, rows: [] });
    expect(await deleteReference('r-x', 'u-1')).toBe(false);
  });
});

// ─── Project↔reference join ───────────────────────────────────────────────

describe('listReferencesForProject', () => {
  it('asserts project ownership then joins references', async () => {
    pushResult({ rows: [projectRow()] }); // ownership
    pushResult({ rows: [projectReferenceJoinedRow()] });
    const links = await listReferencesForProject('p-1', 'u-1');
    expect(links).toHaveLength(1);
    expect(links[0].referenceTitle).toBe('Attention is all you need');
    expect(links[0].referencePublishedAt).toBe('2017-12-06');
    expect(calls[1]!.sql).toMatch(/FROM agos_maker_project_references/);
    expect(calls[1]!.sql).toMatch(/JOIN agos_maker_references/);
    expect(calls[1]!.sql).toMatch(/r\.user_id = \$2/);
  });

  it('refuses on non-owned project', async () => {
    pushResult({ rows: [], rowCount: 0 });
    await expect(listReferencesForProject('p-1', 'u-2')).rejects.toThrow(
      /not owned/,
    );
  });
});

describe('attachReferenceToProject', () => {
  it('requires project ownership', async () => {
    pushResult({ rows: [], rowCount: 0 }); // project ownership fails
    await expect(
      attachReferenceToProject('p-1', 'r-1', 'u-1'),
    ).rejects.toThrow(/Project not found/);
  });

  it('requires reference ownership', async () => {
    pushResult({ rows: [projectRow()] }); // project ownership
    pushResult({ rows: [], rowCount: 0 }); // reference ownership fails
    await expect(
      attachReferenceToProject('p-1', 'r-1', 'u-1'),
    ).rejects.toThrow(/Reference not found/);
  });

  it('inserts then returns a link record', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [referenceRow()] });
    pushResult({ rowCount: 1, rows: [] }); // INSERT
    const link = await attachReferenceToProject('p-1', 'r-1', 'u-1', {
      notes: 'core',
    });
    expect(link.projectId).toBe('p-1');
    expect(link.referenceId).toBe('r-1');
    expect(link.notes).toBe('core');
    const insert = calls.find((c) =>
      /INSERT INTO agos_maker_project_references/.test(c.sql),
    );
    expect(insert).toBeTruthy();
  });
});

describe('updateProjectReferenceLink', () => {
  it('issues a COALESCE UPDATE bound by (project_id, reference_id)', async () => {
    pushResult({ rows: [projectRow()] }); // project ownership
    pushResult({ rows: [referenceRow()] }); // reference ownership
    pushResult({ rowCount: 1, rows: [] }); // UPDATE
    pushResult({
      rows: [
        {
          id: 'pr-1',
          project_id: 'p-1',
          reference_id: 'r-1',
          notes: 'critical reference',
          created_at: new Date('2026-05-11T00:00:00Z'),
        },
      ],
    }); // SELECT
    const link = await updateProjectReferenceLink('p-1', 'r-1', 'u-1', {
      notes: 'critical reference',
    });
    expect(link?.notes).toBe('critical reference');
    const update = calls.find((c) =>
      /UPDATE agos_maker_project_references/.test(c.sql),
    );
    expect(update!.sql).toMatch(
      /WHERE project_id = \$1 AND reference_id = \$2/,
    );
  });
});

describe('detachReferenceFromProject', () => {
  it('requires both ownerships and returns true on success', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [referenceRow()] });
    pushResult({ rowCount: 1, rows: [] }); // DELETE
    expect(await detachReferenceFromProject('p-1', 'r-1', 'u-1')).toBe(true);
  });

  it('refuses on non-owned reference', async () => {
    pushResult({ rows: [projectRow()] });
    pushResult({ rows: [], rowCount: 0 });
    await expect(
      detachReferenceFromProject('p-1', 'r-1', 'u-1'),
    ).rejects.toThrow(/Reference not found/);
  });
});
