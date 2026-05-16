/**
 * Research OS Phase 3 — repo regression tests (predictions, falsifiers,
 * evidence, experiment-hypotheses, hypothesis archive/restore extensions).
 *
 * Exercises every new repo against a mocked pg Pool to lock:
 *   - SQL shape (table name, COALESCE patches, JOIN-guards)
 *   - Parameter shape + JSONB serialization
 *   - Cross-ownership EXISTS guards
 *   - Null-on-miss / typed row on hit
 *   - Strict input validation throws BEFORE issuing SQL
 *
 * Pattern mirrors `repo-notebook-entries.test.ts` + `repo-experiments.test.ts`.
 *
 * @license MIT — Tiresias Research OS Phase 3 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface PgResult {
  rows: unknown[];
  rowCount: number;
}

const queue: PgResult[] = [];
const calls: { sql: string; params: unknown[] }[] = [];

function pushResult(r: Partial<PgResult>): void {
  queue.push({ rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) });
}

vi.mock('@/lib/agentic-os/research/session', () => ({
  getResearchPool: () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return queue.shift() ?? { rows: [], rowCount: 0 };
    }),
  }),
  getCurrentResearchUser: vi.fn(),
}));

import {
  isHypothesisOwnedByUser as predictionsHypothesisOwned,
  listPredictionsForHypothesis,
  getPrediction,
  createPrediction,
  updatePrediction,
  deletePrediction,
} from '@/lib/agentic-os/research/predictions-repo';
import {
  listFalsifiersForHypothesis,
  getFalsifier,
  createFalsifier,
  updateFalsifier,
  deleteFalsifier,
} from '@/lib/agentic-os/research/falsifiers-repo';
import {
  listEvidenceForHypothesis,
  getEvidence,
  createEvidence,
  deleteEvidence,
} from '@/lib/agentic-os/research/evidence-repo';
import {
  isExperimentOwnedByUser,
  isHypothesisOwnedByUser as joinHypothesisOwned,
  listLinkedHypothesesForExperiment,
  getLinkByPair,
  createLink,
  updateLink,
  deleteLink,
} from '@/lib/agentic-os/research/experiment-hypotheses-repo';
import {
  archiveHypothesis,
  restoreHypothesis,
  listHypotheses,
} from '@/lib/agentic-os/research/repo';

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

// ─── Predictions repo ───────────────────────────────────────────────────────

function predictionRow(o: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    hypothesis_id: 'h-1',
    user_id: 'u-1',
    text: 'effect will be +20%',
    kind: 'positive',
    confidence: 'medium',
    metadata: {},
    created_at: new Date('2026-05-12T10:00:00Z'),
    updated_at: new Date('2026-05-12T10:00:00Z'),
    ...o,
  };
}

describe('predictions-repo — isHypothesisOwnedByUser()', () => {
  it('returns true when SELECT 1 finds a row', async () => {
    pushResult({ rows: [{}] });
    expect(await predictionsHypothesisOwned('h-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/FROM agos_research_hypotheses/);
    expect(calls[0].sql).toMatch(/WHERE id = \$1 AND user_id = \$2/);
  });

  it('returns false when no row found', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await predictionsHypothesisOwned('h-1', 'u-1')).toBe(false);
  });
});

describe('predictions-repo — listPredictionsForHypothesis()', () => {
  it('selects with EXISTS cross-ownership guard against hypotheses', async () => {
    pushResult({ rows: [predictionRow()] });
    await listPredictionsForHypothesis('h-1', 'u-1');
    expect(calls[0].sql).toMatch(/FROM agos_research_hypothesis_predictions p/);
    expect(calls[0].sql).toMatch(
      /EXISTS \(\s*SELECT 1 FROM agos_research_hypotheses h[\s\S]*?h\.id = p\.hypothesis_id AND h\.user_id = \$2/,
    );
  });

  it('orders by created_at ASC (chronological)', async () => {
    pushResult({ rows: [] });
    await listPredictionsForHypothesis('h-1', 'u-1');
    expect(calls[0].sql).toMatch(/ORDER BY p\.created_at ASC/);
  });

  it('hydrates kind + confidence back to typed values', async () => {
    pushResult({ rows: [predictionRow({ kind: 'magnitude', confidence: 'high' })] });
    const out = await listPredictionsForHypothesis('h-1', 'u-1');
    expect(out[0].kind).toBe('magnitude');
    expect(out[0].confidence).toBe('high');
  });

  it('falls back to "positive" on unknown kind', async () => {
    pushResult({ rows: [predictionRow({ kind: 'WEIRD' })] });
    const out = await listPredictionsForHypothesis('h-1', 'u-1');
    expect(out[0].kind).toBe('positive');
  });
});

describe('predictions-repo — getPrediction()', () => {
  it('returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getPrediction('p-1', 'u-1')).toBeNull();
  });
  it('JOIN-guards via hypotheses EXISTS', async () => {
    pushResult({ rows: [] });
    await getPrediction('p-1', 'u-1');
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_hypotheses h/);
  });
  it('returns the hydrated row on hit', async () => {
    pushResult({ rows: [predictionRow({ text: 'X' })] });
    const out = await getPrediction('p-1', 'u-1');
    expect(out?.text).toBe('X');
  });
});

describe('predictions-repo — createPrediction()', () => {
  it('INSERTs with the full param list, defaults applied', async () => {
    pushResult({}); // INSERT
    pushResult({ rows: [predictionRow()] }); // re-fetch
    await createPrediction('h-1', 'u-1', { text: 'effect' });
    expect(calls[0].sql).toMatch(/INSERT INTO agos_research_hypothesis_predictions/);
    expect(calls[0].params[1]).toBe('h-1'); // hypothesis_id
    expect(calls[0].params[2]).toBe('u-1'); // user_id
    expect(calls[0].params[3]).toBe('effect'); // text
    expect(calls[0].params[4]).toBe('positive'); // kind default
    expect(calls[0].params[5]).toBe('medium'); // confidence default
  });

  it('serializes metadata to JSONB string', async () => {
    pushResult({});
    pushResult({ rows: [predictionRow()] });
    await createPrediction('h-1', 'u-1', { text: 'x', metadata: { z: 1 } });
    expect(JSON.parse(calls[0].params[6] as string)).toEqual({ z: 1 });
  });

  it('honors supplied kind + confidence', async () => {
    pushResult({});
    pushResult({ rows: [predictionRow({ kind: 'negative', confidence: 'high' })] });
    await createPrediction('h-1', 'u-1', {
      text: 'x',
      kind: 'negative',
      confidence: 'high',
    });
    expect(calls[0].params[4]).toBe('negative');
    expect(calls[0].params[5]).toBe('high');
  });

  it('throws on invalid kind BEFORE issuing SQL', async () => {
    await expect(
      createPrediction('h-1', 'u-1', { text: 'x', kind: 'bogus' as never }),
    ).rejects.toThrow(/Invalid prediction kind/);
    expect(calls.length).toBe(0);
  });

  it('throws on invalid confidence BEFORE issuing SQL', async () => {
    await expect(
      createPrediction('h-1', 'u-1', { text: 'x', confidence: 'huge' as never }),
    ).rejects.toThrow(/Invalid prediction confidence/);
    expect(calls.length).toBe(0);
  });
});

describe('predictions-repo — updatePrediction()', () => {
  it('COALESCEs every patchable field', async () => {
    pushResult({ rowCount: 1, rows: [{ id: 'p-1' }] });
    pushResult({ rows: [predictionRow({ text: 'new' })] });
    await updatePrediction('p-1', 'u-1', { text: 'new' });
    expect(calls[0].sql).toMatch(/text\s+= COALESCE\(\$3, text\)/);
    expect(calls[0].sql).toMatch(/kind\s+= COALESCE\(\$4, kind\)/);
    expect(calls[0].sql).toMatch(/confidence = COALESCE\(\$5, confidence\)/);
    expect(calls[0].sql).toMatch(/metadata\s+= COALESCE\(\$6::jsonb, metadata\)/);
    expect(calls[0].sql).toMatch(/updated_at = now\(\)/);
  });

  it('returns null when UPDATE rowCount = 0', async () => {
    pushResult({ rowCount: 0, rows: [] });
    expect(await updatePrediction('p-1', 'u-1', { text: 'new' })).toBeNull();
  });

  it('throws on invalid kind in patch', async () => {
    await expect(
      updatePrediction('p-1', 'u-1', { kind: 'bad' as never }),
    ).rejects.toThrow(/Invalid prediction kind/);
    expect(calls.length).toBe(0);
  });
});

describe('predictions-repo — deletePrediction()', () => {
  it('DELETEs with JOIN-guard', async () => {
    pushResult({ rowCount: 1 });
    expect(await deletePrediction('p-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/DELETE FROM agos_research_hypothesis_predictions/);
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_hypotheses h/);
  });

  it('returns false on miss', async () => {
    pushResult({ rowCount: 0 });
    expect(await deletePrediction('p-1', 'u-1')).toBe(false);
  });
});

// ─── Falsifiers repo ────────────────────────────────────────────────────────

function falsifierRow(o: Record<string, unknown> = {}) {
  return {
    id: 'f-1',
    hypothesis_id: 'h-1',
    user_id: 'u-1',
    text: 'if effect <5%',
    criterion_md: null,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...o,
  };
}

describe('falsifiers-repo — list/get/create/update/delete', () => {
  it('list JOIN-guards', async () => {
    pushResult({ rows: [falsifierRow()] });
    await listFalsifiersForHypothesis('h-1', 'u-1');
    expect(calls[0].sql).toMatch(/FROM agos_research_hypothesis_falsifiers f/);
    expect(calls[0].sql).toMatch(
      /EXISTS \(\s*SELECT 1 FROM agos_research_hypotheses h[\s\S]*?h\.id = f\.hypothesis_id AND h\.user_id = \$2/,
    );
    expect(calls[0].sql).toMatch(/ORDER BY f\.created_at ASC/);
  });

  it('get returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getFalsifier('f-1', 'u-1')).toBeNull();
  });

  it('get returns hydrated row on hit', async () => {
    pushResult({ rows: [falsifierRow({ text: 'X', criterion_md: 'p<0.05' })] });
    const out = await getFalsifier('f-1', 'u-1');
    expect(out?.text).toBe('X');
    expect(out?.criterionMd).toBe('p<0.05');
  });

  it('create INSERTs into agos_research_hypothesis_falsifiers', async () => {
    pushResult({}); // INSERT
    pushResult({ rows: [falsifierRow({ text: 'X', criterion_md: 'p>0.05' })] });
    await createFalsifier('h-1', 'u-1', { text: 'X', criterionMd: 'p>0.05' });
    expect(calls[0].sql).toMatch(/INSERT INTO agos_research_hypothesis_falsifiers/);
    expect(calls[0].params[3]).toBe('X');
    expect(calls[0].params[4]).toBe('p>0.05');
  });

  it('create defaults criterion_md to null when omitted', async () => {
    pushResult({});
    pushResult({ rows: [falsifierRow()] });
    await createFalsifier('h-1', 'u-1', { text: 'X' });
    expect(calls[0].params[4]).toBeNull();
  });

  it('update COALESCEs fields and JOIN-guards', async () => {
    pushResult({ rowCount: 1, rows: [{ id: 'f-1' }] });
    pushResult({ rows: [falsifierRow()] });
    await updateFalsifier('f-1', 'u-1', { text: 'new' });
    expect(calls[0].sql).toMatch(/text\s+= COALESCE\(\$3, text\)/);
    expect(calls[0].sql).toMatch(/criterion_md = COALESCE\(\$4, criterion_md\)/);
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_hypotheses h/);
  });

  it('update returns null when cross-tenant probe finds nothing', async () => {
    pushResult({ rowCount: 0 });
    expect(await updateFalsifier('f-1', 'u-1', { text: 'X' })).toBeNull();
  });

  it('delete DELETEs with JOIN-guard', async () => {
    pushResult({ rowCount: 1 });
    expect(await deleteFalsifier('f-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/DELETE FROM agos_research_hypothesis_falsifiers/);
  });

  it('delete returns false on miss', async () => {
    pushResult({ rowCount: 0 });
    expect(await deleteFalsifier('f-1', 'u-1')).toBe(false);
  });
});

// ─── Evidence repo ──────────────────────────────────────────────────────────

function evidenceRow(o: Record<string, unknown> = {}) {
  return {
    id: 'e-1',
    hypothesis_id: 'h-1',
    user_id: 'u-1',
    polarity: 'supports',
    source_kind: 'free_text',
    source_id: null,
    source_url: null,
    notes: 'evidence',
    metadata: {},
    created_at: new Date(),
    ...o,
  };
}

describe('evidence-repo — list/get', () => {
  it('list JOIN-guards', async () => {
    pushResult({ rows: [evidenceRow()] });
    await listEvidenceForHypothesis('h-1', 'u-1');
    expect(calls[0].sql).toMatch(/FROM agos_research_hypothesis_evidence e/);
    expect(calls[0].sql).toMatch(
      /EXISTS \(\s*SELECT 1 FROM agos_research_hypotheses h[\s\S]*?h\.id = e\.hypothesis_id AND h\.user_id = \$2/,
    );
  });

  it('list hydrates polarity + source_kind', async () => {
    pushResult({
      rows: [evidenceRow({ polarity: 'refutes', source_kind: 'external_url', source_url: 'https://x' })],
    });
    const out = await listEvidenceForHypothesis('h-1', 'u-1');
    expect(out[0].polarity).toBe('refutes');
    expect(out[0].sourceKind).toBe('external_url');
    expect(out[0].sourceUrl).toBe('https://x');
  });

  it('get returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getEvidence('e-1', 'u-1')).toBeNull();
  });

  it('get returns hydrated row on hit', async () => {
    pushResult({ rows: [evidenceRow({ notes: 'fizz' })] });
    const out = await getEvidence('e-1', 'u-1');
    expect(out?.notes).toBe('fizz');
  });
});

describe('evidence-repo — createEvidence()', () => {
  it('INSERTs the full param list', async () => {
    pushResult({});
    pushResult({ rows: [evidenceRow()] });
    await createEvidence('h-1', 'u-1', {
      polarity: 'supports',
      sourceKind: 'free_text',
      notes: 'evidence',
    });
    expect(calls[0].sql).toMatch(/INSERT INTO agos_research_hypothesis_evidence/);
    expect(calls[0].params[3]).toBe('supports');
    expect(calls[0].params[4]).toBe('free_text');
    expect(calls[0].params[7]).toBe('evidence');
  });

  it('throws on invalid polarity', async () => {
    await expect(
      createEvidence('h-1', 'u-1', {
        polarity: 'strong' as never,
        sourceKind: 'free_text',
      }),
    ).rejects.toThrow(/Invalid evidence polarity/);
    expect(calls.length).toBe(0);
  });

  it('throws on invalid source_kind', async () => {
    await expect(
      createEvidence('h-1', 'u-1', {
        polarity: 'supports',
        sourceKind: 'image' as never,
      }),
    ).rejects.toThrow(/Invalid evidence source_kind/);
    expect(calls.length).toBe(0);
  });

  it('serializes metadata to JSONB', async () => {
    pushResult({});
    pushResult({ rows: [evidenceRow()] });
    await createEvidence('h-1', 'u-1', {
      polarity: 'supports',
      sourceKind: 'free_text',
      notes: 'x',
      metadata: { k: 1 },
    });
    expect(JSON.parse(calls[0].params[8] as string)).toEqual({ k: 1 });
  });
});

describe('evidence-repo — deleteEvidence()', () => {
  it('DELETEs with JOIN-guard, returns boolean', async () => {
    pushResult({ rowCount: 1 });
    expect(await deleteEvidence('e-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/DELETE FROM agos_research_hypothesis_evidence/);
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_hypotheses h/);
  });

  it('returns false on miss', async () => {
    pushResult({ rowCount: 0 });
    expect(await deleteEvidence('e-1', 'u-1')).toBe(false);
  });
});

// ─── Experiment-hypotheses repo ─────────────────────────────────────────────

function linkRow(o: Record<string, unknown> = {}) {
  return {
    id: 'lk-1',
    experiment_id: 'exp-1',
    hypothesis_id: 'h-1',
    role: 'tests',
    notes: null,
    created_at: new Date(),
    ...o,
  };
}

function joinedRow(o: Record<string, unknown> = {}) {
  return {
    id: 'lk-1',
    experiment_id: 'exp-1',
    hypothesis_id: 'h-1',
    role: 'tests',
    notes: null,
    created_at: new Date(),
    h_id: 'h-1',
    h_user_id: 'u-1',
    h_title: 'My hypothesis',
    h_if_clause: 'if x',
    h_then_clause: 'then y',
    h_because_clause: 'because z',
    h_status: 'draft',
    h_confidence: 'medium',
    h_tags: ['a'],
    h_created_at: new Date(),
    h_updated_at: new Date(),
    ...o,
  };
}

describe('experiment-hypotheses-repo — ownership probes', () => {
  it('isExperimentOwnedByUser returns true when found', async () => {
    pushResult({ rows: [{}] });
    expect(await isExperimentOwnedByUser('exp-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/FROM agos_research_experiments/);
  });

  it('isExperimentOwnedByUser returns false when not found', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await isExperimentOwnedByUser('exp-1', 'u-1')).toBe(false);
  });

  it('isHypothesisOwnedByUser returns true when found', async () => {
    pushResult({ rows: [{}] });
    expect(await joinHypothesisOwned('h-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/FROM agos_research_hypotheses/);
  });
});

describe('experiment-hypotheses-repo — listLinkedHypothesesForExperiment()', () => {
  it('joins link + hypothesis rows with BOTH ownership guards', async () => {
    pushResult({ rows: [joinedRow()] });
    await listLinkedHypothesesForExperiment('exp-1', 'u-1');
    expect(calls[0].sql).toMatch(/FROM agos_research_experiment_hypotheses lk/);
    expect(calls[0].sql).toMatch(/JOIN agos_research_hypotheses h ON h\.id = lk\.hypothesis_id/);
    expect(calls[0].sql).toMatch(
      /EXISTS \(\s*SELECT 1 FROM agos_research_experiments e[\s\S]*?e\.id = lk\.experiment_id AND e\.user_id = \$2/,
    );
    expect(calls[0].sql).toMatch(/AND h\.user_id = \$2/);
    expect(calls[0].sql).toMatch(/ORDER BY lk\.created_at ASC/);
  });

  it('hydrates link + hypothesis sub-objects', async () => {
    pushResult({ rows: [joinedRow({ role: 'motivates' })] });
    const out = await listLinkedHypothesesForExperiment('exp-1', 'u-1');
    expect(out[0].link.role).toBe('motivates');
    expect(out[0].hypothesis.title).toBe('My hypothesis');
  });

  it('returns empty array on no rows', async () => {
    pushResult({ rows: [] });
    expect(await listLinkedHypothesesForExperiment('exp-1', 'u-1')).toEqual([]);
  });
});

describe('experiment-hypotheses-repo — getLinkByPair()', () => {
  it('returns null on miss', async () => {
    pushResult({ rows: [], rowCount: 0 });
    expect(await getLinkByPair('exp-1', 'h-1', 'u-1')).toBeNull();
  });

  it('selects with BOTH cross-ownership guards', async () => {
    pushResult({ rows: [] });
    await getLinkByPair('exp-1', 'h-1', 'u-1');
    expect(calls[0].sql).toMatch(/lk\.experiment_id = \$1/);
    expect(calls[0].sql).toMatch(/lk\.hypothesis_id = \$2/);
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_experiments/);
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_hypotheses/);
  });

  it('returns hydrated row on hit', async () => {
    pushResult({ rows: [linkRow({ role: 'related' })] });
    const out = await getLinkByPair('exp-1', 'h-1', 'u-1');
    expect(out?.role).toBe('related');
  });
});

describe('experiment-hypotheses-repo — createLink()', () => {
  it('INSERTs into agos_research_experiment_hypotheses with role default = tests', async () => {
    pushResult({}); // INSERT
    pushResult({ rows: [linkRow()] }); // getLinkByPair
    const out = await createLink('exp-1', 'u-1', { hypothesisId: 'h-1' });
    expect(calls[0].sql).toMatch(/INSERT INTO agos_research_experiment_hypotheses/);
    expect(calls[0].params[1]).toBe('exp-1');
    expect(calls[0].params[2]).toBe('h-1');
    expect(calls[0].params[3]).toBe('tests');
    expect(out.kind).toBe('ok');
  });

  it('returns {kind: "duplicate"} when Postgres raises 23505', async () => {
    queue.push({ rows: [], rowCount: 0 });
    // Replace the mocked query with one that throws on first call.
    const originalShift = Array.prototype.shift;
    // Simpler approach — push a real result and mock the throw via call inspection.
    // Use a direct throw by re-mocking the pool here.
    const { getResearchPool } = await import('@/lib/agentic-os/research/session');
    const pool = getResearchPool();
    const spy = vi.spyOn(pool, 'query').mockImplementationOnce(() => {
      const err = new Error('duplicate key value violates unique constraint') as Error & { code?: string; constraint?: string };
      err.code = '23505';
      return Promise.reject(err);
    });
    try {
      const outcome = await createLink('exp-1', 'u-1', { hypothesisId: 'h-1' });
      expect(outcome.kind).toBe('duplicate');
    } finally {
      spy.mockRestore();
      // Restore prototype if mucked.
      Array.prototype.shift = originalShift;
    }
  });

  it('throws on invalid role', async () => {
    await expect(
      createLink('exp-1', 'u-1', { hypothesisId: 'h-1', role: 'owns' as never }),
    ).rejects.toThrow(/Invalid role/);
  });

  it('passes role + notes through', async () => {
    pushResult({});
    pushResult({ rows: [linkRow({ role: 'motivates', notes: 'cuz' })] });
    const out = await createLink('exp-1', 'u-1', {
      hypothesisId: 'h-1',
      role: 'motivates',
      notes: 'cuz',
    });
    expect(out.kind).toBe('ok');
    expect(calls[0].params[3]).toBe('motivates');
    expect(calls[0].params[4]).toBe('cuz');
  });
});

describe('experiment-hypotheses-repo — updateLink()', () => {
  it('COALESCEs role + notes', async () => {
    pushResult({ rowCount: 1, rows: [{ id: 'lk-1' }] });
    pushResult({ rows: [linkRow({ role: 'related' })] });
    const out = await updateLink('exp-1', 'h-1', 'u-1', { role: 'related' });
    expect(calls[0].sql).toMatch(/role\s+= COALESCE\(\$4, role\)/);
    expect(calls[0].sql).toMatch(/notes = COALESCE\(\$5, notes\)/);
    expect(out?.role).toBe('related');
  });

  it('returns null when both-side cross-ownership probe fails', async () => {
    pushResult({ rowCount: 0 });
    expect(await updateLink('exp-1', 'h-1', 'u-1', { role: 'tests' })).toBeNull();
  });

  it('throws on invalid role in patch', async () => {
    await expect(
      updateLink('exp-1', 'h-1', 'u-1', { role: 'bogus' as never }),
    ).rejects.toThrow(/Invalid role/);
    expect(calls.length).toBe(0);
  });
});

describe('experiment-hypotheses-repo — deleteLink()', () => {
  it('DELETEs with BOTH cross-ownership guards', async () => {
    pushResult({ rowCount: 1 });
    expect(await deleteLink('exp-1', 'h-1', 'u-1')).toBe(true);
    expect(calls[0].sql).toMatch(/DELETE FROM agos_research_experiment_hypotheses/);
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_experiments/);
    expect(calls[0].sql).toMatch(/EXISTS \(\s*SELECT 1 FROM agos_research_hypotheses/);
  });

  it('returns false on miss', async () => {
    pushResult({ rowCount: 0 });
    expect(await deleteLink('exp-1', 'h-1', 'u-1')).toBe(false);
  });
});

// ─── Hypothesis archive/restore extension (repo.ts) ─────────────────────────

function hypoRow(o: Record<string, unknown> = {}) {
  return {
    id: 'h-1',
    user_id: 'u-1',
    title: 'Title',
    if_clause: 'if',
    then_clause: 'then',
    because_clause: 'because',
    status: 'draft',
    confidence: 'medium',
    tags: ['a'],
    description_md: 'desc',
    archived_at: null,
    experiment_ids: [],
    created_at: new Date('2026-05-12T10:00:00Z'),
    updated_at: new Date('2026-05-12T10:00:00Z'),
    ...o,
  };
}

describe('repo.listHypotheses() — Phase 3 archived filter', () => {
  it('default scope hides archived (WHERE archived_at IS NULL)', async () => {
    pushResult({ rows: [] });
    await listHypotheses('u-1');
    expect(calls[0].sql).toMatch(/h\.archived_at IS NULL/);
    expect(calls[0].sql).not.toMatch(/h\.archived_at IS NOT NULL/);
  });

  it('archived=true surfaces archived rows ONLY', async () => {
    pushResult({ rows: [] });
    await listHypotheses('u-1', { archived: true });
    expect(calls[0].sql).toMatch(/h\.archived_at IS NOT NULL/);
  });

  it('archived="all" drops the archived filter from the WHERE clause', async () => {
    pushResult({ rows: [] });
    await listHypotheses('u-1', { archived: 'all' });
    // The SELECT column list still mentions h.archived_at (we hydrate
    // it for the caller). The WHERE clause should NOT carry an
    // archived_at predicate.
    const whereMatch = calls[0].sql.match(/WHERE([\s\S]*?)(?:ORDER BY|$)/);
    expect(whereMatch?.[1] ?? '').not.toMatch(/archived_at/);
  });

  it('hydrates description_md + archivedAt from the row', async () => {
    pushResult({ rows: [hypoRow({ description_md: 'long', archived_at: new Date('2026-05-12T11:00:00Z') })] });
    const out = await listHypotheses('u-1', { archived: 'all' });
    expect(out[0].descriptionMd).toBe('long');
    expect(out[0].archivedAt).toMatch(/^2026-05-12T11:00:00/);
  });
});

describe('repo.archiveHypothesis()', () => {
  it('issues UPDATE with archived_at = now() guarded by archived_at IS NULL', async () => {
    pushResult({}); // UPDATE
    pushResult({ rows: [hypoRow({ archived_at: new Date('2026-05-12T11:00:00Z') })] }); // refetch
    await archiveHypothesis('h-1', 'u-1');
    expect(calls[0].sql).toMatch(/UPDATE agos_research_hypotheses/);
    expect(calls[0].sql).toMatch(/archived_at = now\(\)/);
    expect(calls[0].sql).toMatch(/archived_at IS NULL/);
  });
});

describe('repo.restoreHypothesis()', () => {
  it('returns null when the row does not exist for this user', async () => {
    // First call: getHypothesis prefetch returns nothing.
    pushResult({ rows: [], rowCount: 0 });
    const out = await restoreHypothesis('h-1', 'u-1');
    expect(out).toBeNull();
  });

  it('returns alreadyActive:true when archived_at is null', async () => {
    pushResult({ rows: [hypoRow({ archived_at: null })] });
    const out = await restoreHypothesis('h-1', 'u-1');
    expect(out).not.toBeNull();
    if (out) {
      expect(out.alreadyActive).toBe(true);
    }
  });

  it('clears archived_at and returns alreadyActive:false on success', async () => {
    pushResult({ rows: [hypoRow({ archived_at: new Date('2026-05-12T10:00:00Z') })] });
    pushResult({}); // UPDATE
    pushResult({ rows: [hypoRow({ archived_at: null })] });
    const out = await restoreHypothesis('h-1', 'u-1');
    expect(out).not.toBeNull();
    if (out) {
      expect(out.alreadyActive).toBe(false);
      expect(out.hypothesis.archivedAt).toBeNull();
    }
    // The UPDATE happens after the prefetch.
    expect(calls.some((c) => /SET archived_at = NULL/.test(c.sql))).toBe(true);
  });
});
