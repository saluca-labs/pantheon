/**
 * Research OS Phase 6 — route handler tests.
 *
 * Covers the full Phase 6 surface:
 *   - experiments/[id]/milestones (GET / POST)
 *   - milestones/[mid] (GET / PATCH / DELETE)
 *   - experiments/[id]/dependencies (GET / POST) + cross-ownership 404 +
 *     self-loop 400 + duplicate 409
 *   - dependencies/[depId] (PATCH / DELETE)
 *   - blockers (GET) + limit clamp + 400 on bad limit
 *   - experiments/[id]/reproducibility (GET — lazy seed + score derivation,
 *     POST — regex validation + 409 dup)
 *   - experiments/[id]/reproducibility/items/[itemKey] (PATCH / DELETE)
 *
 * Routes are imported dynamically inside each test so vitest's vi.mock
 * hoisting correctly stubs the repo modules BEFORE the route loads. (The
 * static-import variant trips a `Cannot access before initialization`
 * ReferenceError because the mock factories close over top-level consts.)
 *
 * @license MIT — Tiresias Research OS Phase 6 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentResearchUser = vi.fn();
const recordAudit = vi.fn();

const milestonesRepo = {
  isExperimentOwnedByUser: vi.fn(),
  listMilestonesForExperiment: vi.fn(),
  getMilestone: vi.fn(),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
};
const dependenciesRepo = {
  isExperimentOwnedByUser: vi.fn(),
  listDependenciesForExperiment: vi.fn(),
  getDependency: vi.fn(),
  createDependency: vi.fn(),
  updateDependency: vi.fn(),
  deleteDependency: vi.fn(),
  DependencyDuplicateError: class extends Error {
    constructor() {
      super('dup');
      this.name = 'DependencyDuplicateError';
    }
  },
  DependencyCrossOwnershipError: class extends Error {
    constructor(side: 'from' | 'to' = 'to') {
      super(`${side} not found`);
      this.name = 'DependencyCrossOwnershipError';
    }
  },
  DependencySelfLoopError: class extends Error {
    constructor() {
      super('self-loop');
      this.name = 'DependencySelfLoopError';
    }
  },
};
const reproRepo = {
  isExperimentOwnedByUser: vi.fn(),
  seedCanonicalReproItems: vi.fn(),
  listReproChecksForExperiment: vi.fn(),
  getReproCheck: vi.fn(),
  getReproCheckByItemKey: vi.fn(),
  createReproCheck: vi.fn(),
  updateReproCheckByItemKey: vi.fn(),
  deleteReproCheckByItemKey: vi.fn(),
  ReproDuplicateError: class extends Error {
    constructor() {
      super('dup');
      this.name = 'ReproDuplicateError';
    }
  },
};
const blockersRepo = {
  listTopBlockers: vi.fn(),
};
const repoMocks = {
  recordAudit: (...a: any[]) => recordAudit(...a),
};

vi.mock('@/lib/agentic-os/research/session', () => ({
  getCurrentResearchUser: (...a: any[]) => getCurrentResearchUser(...a),
  getResearchPool: () => ({ query: vi.fn() }),
}));
vi.mock('@/lib/agentic-os/research/repo', () => repoMocks);
vi.mock('@/lib/agentic-os/research/milestones-repo', () => milestonesRepo);
vi.mock('@/lib/agentic-os/research/dependencies-repo', () => dependenciesRepo);
vi.mock('@/lib/agentic-os/research/reproducibility-repo', () => reproRepo);
vi.mock('@/lib/agentic-os/research/blockers-repo', () => blockersRepo);

function req(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), init as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentResearchUser.mockResolvedValue({ userId: 'u-1' });
});

// ─── Milestones routes ────────────────────────────────────────────────────

describe('GET /experiments/[id]/milestones', () => {
  it('401 when not logged in', async () => {
    getCurrentResearchUser.mockResolvedValueOnce(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/milestones/route'
    );
    const res = await GET(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/milestones'),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('404 cross-ownership', async () => {
    milestonesRepo.isExperimentOwnedByUser.mockResolvedValueOnce(false);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/milestones/route'
    );
    const res = await GET(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/milestones'),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('happy path returns milestones array', async () => {
    milestonesRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    milestonesRepo.listMilestonesForExperiment.mockResolvedValueOnce([{ id: 'm-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/milestones/route'
    );
    const res = await GET(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/milestones'),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.milestones).toEqual([{ id: 'm-1' }]);
  });

  it('400 on invalid status filter', async () => {
    milestonesRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/milestones/route'
    );
    const res = await GET(
      req(
        '/api/tiresias/agentic-os/research/experiments/exp-1/milestones?status=lol',
      ),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /experiments/[id]/milestones', () => {
  it('201 + audit on happy path', async () => {
    milestonesRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    milestonesRepo.createMilestone.mockResolvedValueOnce({
      id: 'm-1',
      title: 'Test',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/milestones/route'
    );
    const res = await POST(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/milestones', {
        method: 'POST',
        body: JSON.stringify({ title: 'Test' }),
      }),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.milestone.created' }),
    );
  });

  it('400 on invalid body', async () => {
    milestonesRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/milestones/route'
    );
    const res = await POST(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/milestones', {
        method: 'POST',
        body: JSON.stringify({ title: '' }),
      }),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('404 cross-ownership', async () => {
    milestonesRepo.isExperimentOwnedByUser.mockResolvedValueOnce(false);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/milestones/route'
    );
    const res = await POST(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/milestones', {
        method: 'POST',
        body: JSON.stringify({ title: 'Test' }),
      }),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /milestones/[mid]', () => {
  it('emits research.milestone.completed when status transitions to done', async () => {
    milestonesRepo.getMilestone.mockResolvedValueOnce({
      id: 'm-1',
      experimentId: 'exp-1',
      status: 'pending',
    });
    milestonesRepo.updateMilestone.mockResolvedValueOnce({
      id: 'm-1',
      experimentId: 'exp-1',
      status: 'done',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/milestones/[mid]/route'
    );
    const res = await PATCH(
      req('/api/tiresias/agentic-os/research/milestones/m-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' }),
      }),
      { params: Promise.resolve({ mid: 'm-1' }) },
    );
    expect(res.status).toBe(200);
    const actions = recordAudit.mock.calls.map((c: any) => c[0].action);
    expect(actions).toContain('research.milestone.updated');
    expect(actions).toContain('research.milestone.completed');
  });

  it('does NOT emit completed event when status was already done', async () => {
    milestonesRepo.getMilestone.mockResolvedValueOnce({
      id: 'm-1',
      experimentId: 'exp-1',
      status: 'done',
    });
    milestonesRepo.updateMilestone.mockResolvedValueOnce({
      id: 'm-1',
      experimentId: 'exp-1',
      status: 'done',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/milestones/[mid]/route'
    );
    await PATCH(
      req('/api/tiresias/agentic-os/research/milestones/m-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' }),
      }),
      { params: Promise.resolve({ mid: 'm-1' }) },
    );
    const actions = recordAudit.mock.calls.map((c: any) => c[0].action);
    expect(actions).not.toContain('research.milestone.completed');
  });

  it('404 when milestone not owned', async () => {
    milestonesRepo.getMilestone.mockResolvedValueOnce(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/milestones/[mid]/route'
    );
    const res = await PATCH(
      req('/api/tiresias/agentic-os/research/milestones/m-1', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'x' }),
      }),
      { params: Promise.resolve({ mid: 'm-1' }) },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /milestones/[mid]', () => {
  it('records research.milestone.deleted audit on success', async () => {
    milestonesRepo.getMilestone.mockResolvedValueOnce({
      id: 'm-1',
      experimentId: 'exp-1',
    });
    milestonesRepo.deleteMilestone.mockResolvedValueOnce(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/milestones/[mid]/route'
    );
    const res = await DELETE(
      req('/api/tiresias/agentic-os/research/milestones/m-1', { method: 'DELETE' }),
      { params: Promise.resolve({ mid: 'm-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.milestone.deleted' }),
    );
  });
});

describe('GET /milestones/[mid]', () => {
  it('404 on miss', async () => {
    milestonesRepo.getMilestone.mockResolvedValueOnce(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/milestones/[mid]/route'
    );
    const res = await GET(
      req('/api/tiresias/agentic-os/research/milestones/m-1'),
      { params: Promise.resolve({ mid: 'm-1' }) },
    );
    expect(res.status).toBe(404);
  });
});

// ─── Dependencies routes ──────────────────────────────────────────────────

describe('GET /experiments/[id]/dependencies', () => {
  it('returns upstream + downstream view', async () => {
    dependenciesRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    dependenciesRepo.listDependenciesForExperiment.mockResolvedValueOnce({
      upstream: [{ id: 'u-1' }],
      downstream: [{ id: 'd-1' }],
    });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/dependencies/route'
    );
    const res = await GET(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/dependencies'),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    const body = await res.json();
    expect(body.upstream.length).toBe(1);
    expect(body.downstream.length).toBe(1);
  });

  it('404 cross-ownership on from side', async () => {
    dependenciesRepo.isExperimentOwnedByUser.mockResolvedValueOnce(false);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/dependencies/route'
    );
    const res = await GET(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/dependencies'),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /experiments/[id]/dependencies', () => {
  it('400 self-loop maps to 400', async () => {
    dependenciesRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    dependenciesRepo.createDependency.mockRejectedValueOnce(
      new dependenciesRepo.DependencySelfLoopError(),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/dependencies/route'
    );
    const res = await POST(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/dependencies', {
        method: 'POST',
        body: JSON.stringify({ toExperimentId: '11111111-2222-3333-4444-555555555555' }),
      }),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('404 cross-ownership on to side maps to 404', async () => {
    dependenciesRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    dependenciesRepo.createDependency.mockRejectedValueOnce(
      new dependenciesRepo.DependencyCrossOwnershipError('to'),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/dependencies/route'
    );
    const res = await POST(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/dependencies', {
        method: 'POST',
        body: JSON.stringify({ toExperimentId: '11111111-2222-3333-4444-555555555555' }),
      }),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('409 duplicate edge maps to 409', async () => {
    dependenciesRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    dependenciesRepo.createDependency.mockRejectedValueOnce(
      new dependenciesRepo.DependencyDuplicateError(),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/dependencies/route'
    );
    const res = await POST(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/dependencies', {
        method: 'POST',
        body: JSON.stringify({ toExperimentId: '11111111-2222-3333-4444-555555555555' }),
      }),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(409);
  });

  it('201 happy path + audit', async () => {
    dependenciesRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    dependenciesRepo.createDependency.mockResolvedValueOnce({
      id: 'd-1',
      fromExperimentId: 'exp-1',
      toExperimentId: '11111111-2222-3333-4444-555555555555',
      kind: 'feeds',
      status: 'open',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/dependencies/route'
    );
    const res = await POST(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/dependencies', {
        method: 'POST',
        body: JSON.stringify({ toExperimentId: '11111111-2222-3333-4444-555555555555' }),
      }),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.dependency.created' }),
    );
  });
});

describe('PATCH /dependencies/[depId]', () => {
  it('emits research.dependency.cleared on open → cleared', async () => {
    dependenciesRepo.getDependency.mockResolvedValueOnce({
      id: 'd-1',
      fromExperimentId: 'exp-1',
      toExperimentId: 'exp-2',
      status: 'open',
    });
    dependenciesRepo.updateDependency.mockResolvedValueOnce({
      id: 'd-1',
      fromExperimentId: 'exp-1',
      toExperimentId: 'exp-2',
      status: 'cleared',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/dependencies/[depId]/route'
    );
    await PATCH(
      req('/api/tiresias/agentic-os/research/dependencies/d-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cleared' }),
      }),
      { params: Promise.resolve({ depId: 'd-1' }) },
    );
    const actions = recordAudit.mock.calls.map((c: any) => c[0].action);
    expect(actions).toContain('research.dependency.cleared');
  });

  it('emits research.dependency.reopened on cleared → open', async () => {
    dependenciesRepo.getDependency.mockResolvedValueOnce({
      id: 'd-1',
      fromExperimentId: 'exp-1',
      toExperimentId: 'exp-2',
      status: 'cleared',
    });
    dependenciesRepo.updateDependency.mockResolvedValueOnce({
      id: 'd-1',
      fromExperimentId: 'exp-1',
      toExperimentId: 'exp-2',
      status: 'open',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/dependencies/[depId]/route'
    );
    await PATCH(
      req('/api/tiresias/agentic-os/research/dependencies/d-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'open' }),
      }),
      { params: Promise.resolve({ depId: 'd-1' }) },
    );
    const actions = recordAudit.mock.calls.map((c: any) => c[0].action);
    expect(actions).toContain('research.dependency.reopened');
  });
});

describe('DELETE /dependencies/[depId]', () => {
  it('records research.dependency.deleted audit on success', async () => {
    dependenciesRepo.getDependency.mockResolvedValueOnce({
      id: 'd-1',
      fromExperimentId: 'exp-1',
      toExperimentId: 'exp-2',
      status: 'open',
    });
    dependenciesRepo.deleteDependency.mockResolvedValueOnce(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/dependencies/[depId]/route'
    );
    const res = await DELETE(
      req('/api/tiresias/agentic-os/research/dependencies/d-1', { method: 'DELETE' }),
      { params: Promise.resolve({ depId: 'd-1' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.dependency.deleted' }),
    );
  });
});

// ─── Blockers route ───────────────────────────────────────────────────────

describe('GET /blockers', () => {
  it('default limit 25', async () => {
    blockersRepo.listTopBlockers.mockResolvedValueOnce([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/blockers/route');
    await GET(req('/api/tiresias/agentic-os/research/blockers'));
    expect(blockersRepo.listTopBlockers).toHaveBeenCalledWith('u-1', { limit: 25 });
  });

  it('limit clamps to 100 when over (spec lock)', async () => {
    blockersRepo.listTopBlockers.mockResolvedValueOnce([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/blockers/route');
    await GET(req('/api/tiresias/agentic-os/research/blockers?limit=200'));
    expect(blockersRepo.listTopBlockers).toHaveBeenCalledWith('u-1', { limit: 100 });
  });

  it('400 on non-positive limit', async () => {
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/blockers/route');
    const res = await GET(req('/api/tiresias/agentic-os/research/blockers?limit=0'));
    expect(res.status).toBe(400);
  });

  it('returns { items, generated_at }', async () => {
    blockersRepo.listTopBlockers.mockResolvedValueOnce([
      { kind: 'milestone', id: 'm-1' },
    ]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/research/blockers/route');
    const res = await GET(req('/api/tiresias/agentic-os/research/blockers'));
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.generated_at).toBe('string');
  });
});

// ─── Reproducibility routes ───────────────────────────────────────────────

describe('GET /experiments/[id]/reproducibility', () => {
  it('lazily seeds canonical items on every GET (idempotent server-side)', async () => {
    reproRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    reproRepo.seedCanonicalReproItems.mockResolvedValueOnce(undefined);
    reproRepo.listReproChecksForExperiment.mockResolvedValueOnce([
      { id: 'r-1', itemKey: 'methods_pinned', state: 'pending' },
      { id: 'r-2', itemKey: 'code_published', state: 'done' },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/reproducibility/route'
    );
    const res = await GET(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/reproducibility'),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(reproRepo.seedCanonicalReproItems).toHaveBeenCalledWith('exp-1', 'u-1');
    const body = await res.json();
    expect(body.score).toBe(0.5);
    expect(body.items.length).toBe(2);
    expect(body.blocking_items.length).toBe(1);
  });

  it('404 cross-ownership', async () => {
    reproRepo.isExperimentOwnedByUser.mockResolvedValueOnce(false);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/reproducibility/route'
    );
    const res = await GET(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/reproducibility'),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns score=null when denominator is zero (all not_applicable + waived)', async () => {
    reproRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    reproRepo.seedCanonicalReproItems.mockResolvedValueOnce(undefined);
    reproRepo.listReproChecksForExperiment.mockResolvedValueOnce([
      { itemKey: 'a', state: 'not_applicable' },
      { itemKey: 'b', state: 'waived' },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/reproducibility/route'
    );
    const res = await GET(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/reproducibility'),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    const body = await res.json();
    expect(body.score).toBeNull();
  });
});

describe('POST /experiments/[id]/reproducibility', () => {
  it('400 rejects item_key with uppercase (regex enforcement)', async () => {
    reproRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/reproducibility/route'
    );
    const res = await POST(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/reproducibility', {
        method: 'POST',
        body: JSON.stringify({ itemKey: 'bad-Key' }),
      }),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('201 accepts custom_item_42', async () => {
    reproRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    reproRepo.createReproCheck.mockResolvedValueOnce({
      id: 'r-1',
      itemKey: 'custom_item_42',
      state: 'pending',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/reproducibility/route'
    );
    const res = await POST(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/reproducibility', {
        method: 'POST',
        body: JSON.stringify({ itemKey: 'custom_item_42' }),
      }),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.reproducibility.item_added' }),
    );
  });

  it('409 on duplicate item_key', async () => {
    reproRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    reproRepo.createReproCheck.mockRejectedValueOnce(new reproRepo.ReproDuplicateError());
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/reproducibility/route'
    );
    const res = await POST(
      req('/api/tiresias/agentic-os/research/experiments/exp-1/reproducibility', {
        method: 'POST',
        body: JSON.stringify({ itemKey: 'methods_pinned' }),
      }),
      { params: Promise.resolve({ id: 'exp-1' }) },
    );
    expect(res.status).toBe(409);
  });
});

describe('PATCH /experiments/[id]/reproducibility/items/[itemKey]', () => {
  it('audits research.reproducibility.item_updated on success', async () => {
    reproRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    reproRepo.getReproCheckByItemKey.mockResolvedValueOnce({
      id: 'r-1',
      itemKey: 'methods_pinned',
      state: 'pending',
    });
    reproRepo.updateReproCheckByItemKey.mockResolvedValueOnce({
      id: 'r-1',
      itemKey: 'methods_pinned',
      state: 'done',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/reproducibility/items/[itemKey]/route'
    );
    const res = await PATCH(
      req(
        '/api/tiresias/agentic-os/research/experiments/exp-1/reproducibility/items/methods_pinned',
        {
          method: 'PATCH',
          body: JSON.stringify({ state: 'done' }),
        },
      ),
      { params: Promise.resolve({ id: 'exp-1', itemKey: 'methods_pinned' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.reproducibility.item_updated' }),
    );
  });

  it('400 rejects malformed itemKey from URL', async () => {
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/reproducibility/items/[itemKey]/route'
    );
    const res = await PATCH(
      req(
        '/api/tiresias/agentic-os/research/experiments/exp-1/reproducibility/items/Bad-Key',
        { method: 'PATCH', body: JSON.stringify({ state: 'done' }) },
      ),
      { params: Promise.resolve({ id: 'exp-1', itemKey: 'Bad-Key' }) },
    );
    expect(res.status).toBe(400);
  });

  it('404 cross-ownership', async () => {
    reproRepo.isExperimentOwnedByUser.mockResolvedValueOnce(false);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/reproducibility/items/[itemKey]/route'
    );
    const res = await PATCH(
      req(
        '/api/tiresias/agentic-os/research/experiments/exp-1/reproducibility/items/methods_pinned',
        { method: 'PATCH', body: JSON.stringify({ state: 'done' }) },
      ),
      { params: Promise.resolve({ id: 'exp-1', itemKey: 'methods_pinned' }) },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /experiments/[id]/reproducibility/items/[itemKey]', () => {
  it('records research.reproducibility.item_deleted audit on success', async () => {
    reproRepo.isExperimentOwnedByUser.mockResolvedValueOnce(true);
    reproRepo.getReproCheckByItemKey.mockResolvedValueOnce({
      id: 'r-1',
      itemKey: 'methods_pinned',
    });
    reproRepo.deleteReproCheckByItemKey.mockResolvedValueOnce(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/research/experiments/[id]/reproducibility/items/[itemKey]/route'
    );
    const res = await DELETE(
      req(
        '/api/tiresias/agentic-os/research/experiments/exp-1/reproducibility/items/methods_pinned',
        { method: 'DELETE' },
      ),
      { params: Promise.resolve({ id: 'exp-1', itemKey: 'methods_pinned' }) },
    );
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'research.reproducibility.item_deleted' }),
    );
  });
});
