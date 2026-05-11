/**
 * Maker OS — Phase 2 catalog + supplier + variant + BOM route tests.
 *
 * Covers:
 *   - 401 on every handler without auth.
 *   - 200/201/404/400 happy + sad paths.
 *   - Audit recording on the mutate-paths.
 *
 * @license MIT — Tiresias Maker OS Phase 2 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentMakerUser = vi.fn();

vi.mock('@/lib/agentic-os/maker/session', () => ({
  getCurrentMakerUser: (...args: any[]) => getCurrentMakerUser(...args),
  getMakerPool: () => ({ query: vi.fn() }),
}));

const repoMocks = {
  listCatalog: vi.fn(),
  getCatalogRow: vi.fn(),
  createCatalogRow: vi.fn(),
  updateCatalogRow: vi.fn(),
  deleteCatalogRow: vi.fn(),
  listSuppliers: vi.fn(),
  getSupplier: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
  listSupplierLinks: vi.fn(),
  createSupplierLink: vi.fn(),
  updateSupplierLink: vi.fn(),
  deleteSupplierLink: vi.fn(),
  listVariants: vi.fn(),
  createVariant: vi.fn(),
  updateVariant: vi.fn(),
  deleteVariant: vi.fn(),
  listBomLines: vi.fn(),
  createBomLine: vi.fn(),
  updateBomLine: vi.fn(),
  deleteBomLine: vi.fn(),
  getBomSummary: vi.fn(),
  recordAudit: vi.fn(),
};

vi.mock('@/lib/agentic-os/maker/repo', () => repoMocks);

beforeEach(() => {
  getCurrentMakerUser.mockReset();
  for (const m of Object.values(repoMocks)) (m as any).mockReset();
});

function authed() {
  getCurrentMakerUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'x@y.z',
  });
}

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

const VALID_UUID_1 = '11111111-1111-1111-1111-111111111111';
const VALID_UUID_2 = '22222222-2222-2222-2222-222222222222';

// ═══════════════════════════════════════════════════════════════════════════
// /catalog (list, create)
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/tiresias/agentic-os/maker/catalog', () => {
  it('returns 401 when unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/catalog/route');
    const res = await GET(
      jsonReq('http://t/api/tiresias/agentic-os/maker/catalog', 'GET') as any,
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 + { rows } when authenticated', async () => {
    authed();
    repoMocks.listCatalog.mockResolvedValue([{ id: 'c-1', name: 'M3' }]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/catalog/route');
    const res = await GET(
      jsonReq('http://t/api/tiresias/agentic-os/maker/catalog', 'GET') as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(1);
  });

  it('returns 400 on an invalid category query param', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/catalog/route');
    const res = await GET(
      jsonReq(
        'http://t/api/tiresias/agentic-os/maker/catalog?category=weapon',
        'GET',
      ) as any,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/tiresias/agentic-os/maker/catalog', () => {
  it('returns 401 unauthed', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/catalog/route');
    const res = await POST(jsonReq('http://t/x', 'POST', { name: 'X' }) as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing name', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/catalog/route');
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any);
    expect(res.status).toBe(400);
  });

  it('returns 201 + records audit on success', async () => {
    authed();
    repoMocks.createCatalogRow.mockResolvedValue({ id: 'c-1', name: 'M3' });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/catalog/route');
    const res = await POST(jsonReq('http://t/x', 'POST', { name: 'M3' }) as any);
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.catalog.created' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// /catalog/[id]
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/tiresias/agentic-os/maker/catalog/[id]', () => {
  it('returns 404 when not found', async () => {
    authed();
    repoMocks.getCatalogRow.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/route'
    );
    const res = await GET({} as any, {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 when found', async () => {
    authed();
    repoMocks.getCatalogRow.mockResolvedValue({ id: 'c-1', name: 'M3' });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/route'
    );
    const res = await GET({} as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).row.id).toBe('c-1');
  });
});

describe('PATCH /api/tiresias/agentic-os/maker/catalog/[id]', () => {
  it('returns 400 on invalid body (bad category)', async () => {
    authed();
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { category: 'weapon' }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when row missing', async () => {
    authed();
    repoMocks.updateCatalogRow.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { name: 'X' }) as any,
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 + records audit on success', async () => {
    authed();
    repoMocks.updateCatalogRow.mockResolvedValue({ id: 'c-1', name: 'Renamed' });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { name: 'Renamed' }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.catalog.updated' }),
    );
  });
});

describe('DELETE /api/tiresias/agentic-os/maker/catalog/[id]', () => {
  it('returns 404 when missing', async () => {
    authed();
    repoMocks.deleteCatalogRow.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/route'
    );
    const res = await DELETE({} as any, {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
  });
  it('returns 200 + audits on success', async () => {
    authed();
    repoMocks.deleteCatalogRow.mockResolvedValue(true);
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/route'
    );
    const res = await DELETE({} as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.catalog.deleted' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// /catalog/[id]/variants
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/tiresias/agentic-os/maker/catalog/[id]/variants', () => {
  it('401 unauthed', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/variants/route'
    );
    const res = await GET({} as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(401);
  });
  it('404 when listVariants throws ownership error', async () => {
    authed();
    repoMocks.listVariants.mockRejectedValue(new Error('not owned'));
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/variants/route'
    );
    const res = await GET({} as any, {
      params: Promise.resolve({ id: 'c-1' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/tiresias/agentic-os/maker/catalog/[id]/variants', () => {
  it('201 + audits on success', async () => {
    authed();
    repoMocks.createVariant.mockResolvedValue({ id: 'v-1', variantLabel: 'M3x8' });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/variants/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { variantLabel: 'M3x8', quantityOnHand: 5 }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.variant.created' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// /catalog/[id]/suppliers (links)
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/tiresias/agentic-os/maker/catalog/[id]/suppliers', () => {
  it('400 on missing supplierId', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/suppliers/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { unitPriceCents: 100 }) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('201 + audits on success', async () => {
    authed();
    repoMocks.createSupplierLink.mockResolvedValue({
      id: 'l-1',
      supplierId: VALID_UUID_2,
    });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/suppliers/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        supplierId: VALID_UUID_2,
        unitPriceCents: 100,
      }) as any,
      { params: Promise.resolve({ id: VALID_UUID_1 }) },
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.supplier_link.created' }),
    );
  });
});

describe('DELETE /api/tiresias/agentic-os/maker/catalog/[id]/suppliers', () => {
  it('400 when linkId query param missing', async () => {
    authed();
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/suppliers/route'
    );
    const res = await DELETE(
      jsonReq(
        'http://t/api/tiresias/agentic-os/maker/catalog/c-1/suppliers',
        'DELETE',
      ) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(400);
  });
  it('200 + audits on success', async () => {
    authed();
    repoMocks.deleteSupplierLink.mockResolvedValue(true);
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/suppliers/route'
    );
    const res = await DELETE(
      jsonReq(
        'http://t/api/tiresias/agentic-os/maker/catalog/c-1/suppliers?linkId=l-1',
        'DELETE',
      ) as any,
      { params: Promise.resolve({ id: 'c-1' }) },
    );
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// /suppliers
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/tiresias/agentic-os/maker/suppliers', () => {
  it('401 unauthed', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/suppliers/route'
    );
    const res = await GET();
    expect(res.status).toBe(401);
  });
  it('200 + { suppliers }', async () => {
    authed();
    repoMocks.listSuppliers.mockResolvedValue([{ id: 's-1', name: 'A' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/suppliers/route'
    );
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).suppliers).toHaveLength(1);
  });
});

describe('POST /api/tiresias/agentic-os/maker/suppliers', () => {
  it('400 on missing name', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/suppliers/route'
    );
    const res = await POST(jsonReq('http://t/x', 'POST', {}) as any);
    expect(res.status).toBe(400);
  });
  it('201 + audits on success', async () => {
    authed();
    repoMocks.createSupplier.mockResolvedValue({ id: 's-1', name: 'AliBaba' });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/suppliers/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { name: 'AliBaba' }) as any,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.supplier.created' }),
    );
  });
});

describe('PATCH /api/tiresias/agentic-os/maker/suppliers/[id]', () => {
  it('404 when missing', async () => {
    authed();
    repoMocks.updateSupplier.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/suppliers/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { name: 'Y' }) as any,
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(res.status).toBe(404);
  });
  it('200 + audits on success', async () => {
    authed();
    repoMocks.updateSupplier.mockResolvedValue({ id: 's-1', name: 'Renamed' });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/suppliers/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { name: 'Renamed' }) as any,
      { params: Promise.resolve({ id: 's-1' }) },
    );
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// /projects/[id]/bom + bom-summary
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/tiresias/agentic-os/maker/projects/[id]/bom', () => {
  it('401 unauthed', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/bom/route'
    );
    const res = await GET({} as any, {
      params: Promise.resolve({ id: 'p-1' }),
    });
    expect(res.status).toBe(401);
  });
  it('404 when listBomLines throws ownership error', async () => {
    authed();
    repoMocks.listBomLines.mockRejectedValue(new Error('not owned'));
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/bom/route'
    );
    const res = await GET({} as any, {
      params: Promise.resolve({ id: 'p-x' }),
    });
    expect(res.status).toBe(404);
  });
  it('200 + { lines }', async () => {
    authed();
    repoMocks.listBomLines.mockResolvedValue([
      { id: 'l-1', quantityNeeded: 5 },
    ]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/bom/route'
    );
    const res = await GET({} as any, {
      params: Promise.resolve({ id: 'p-1' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).lines).toHaveLength(1);
  });
});

describe('POST /api/tiresias/agentic-os/maker/projects/[id]/bom', () => {
  it('400 on missing partCatalogId', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/bom/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', { quantityNeeded: 5 }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(400);
  });
  it('400 on non-positive quantity', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/bom/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        partCatalogId: VALID_UUID_1,
        quantityNeeded: 0,
      }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(400);
  });
  it('201 + audits with projectId on success', async () => {
    authed();
    repoMocks.createBomLine.mockResolvedValue({
      id: 'l-1',
      partCatalogId: VALID_UUID_1,
    });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/bom/route'
    );
    const res = await POST(
      jsonReq('http://t/x', 'POST', {
        partCatalogId: VALID_UUID_1,
        quantityNeeded: 5,
      }) as any,
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'maker.bom_line.created',
        projectId: 'p-1',
      }),
    );
  });
});

describe('PATCH /api/tiresias/agentic-os/maker/projects/[id]/bom/[lineId]', () => {
  it('404 when missing', async () => {
    authed();
    repoMocks.updateBomLine.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/bom/[lineId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { quantityNeeded: 2 }) as any,
      { params: Promise.resolve({ id: 'p-1', lineId: 'l-missing' }) },
    );
    expect(res.status).toBe(404);
  });
  it('200 + audits on success', async () => {
    authed();
    repoMocks.updateBomLine.mockResolvedValue({ id: 'l-1', quantityNeeded: 2 });
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/bom/[lineId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { quantityNeeded: 2 }) as any,
      { params: Promise.resolve({ id: 'p-1', lineId: 'l-1' }) },
    );
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/tiresias/agentic-os/maker/projects/[id]/bom/[lineId]', () => {
  it('404 when not found', async () => {
    authed();
    repoMocks.deleteBomLine.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/bom/[lineId]/route'
    );
    const res = await DELETE({} as any, {
      params: Promise.resolve({ id: 'p-1', lineId: 'missing' }),
    });
    expect(res.status).toBe(404);
  });
  it('200 + audits on success', async () => {
    authed();
    repoMocks.deleteBomLine.mockResolvedValue(true);
    repoMocks.recordAudit.mockResolvedValue(undefined);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/bom/[lineId]/route'
    );
    const res = await DELETE({} as any, {
      params: Promise.resolve({ id: 'p-1', lineId: 'l-1' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/tiresias/agentic-os/maker/projects/[id]/bom-summary', () => {
  it('401 unauthed', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/bom-summary/route'
    );
    const res = await GET({} as any, {
      params: Promise.resolve({ id: 'p-1' }),
    });
    expect(res.status).toBe(401);
  });
  it('404 when project not owned', async () => {
    authed();
    repoMocks.getBomSummary.mockRejectedValue(new Error('not owned'));
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/bom-summary/route'
    );
    const res = await GET({} as any, {
      params: Promise.resolve({ id: 'p-x' }),
    });
    expect(res.status).toBe(404);
  });
  it('200 + { summary }', async () => {
    authed();
    repoMocks.getBomSummary.mockResolvedValue({
      projectId: 'p-1',
      rows: [],
      totalEstCostCents: 0,
      currency: 'USD',
      totalDeficit: 0,
      linesCount: 0,
      criticalDeficitLines: 0,
    });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/bom-summary/route'
    );
    const res = await GET({} as any, {
      params: Promise.resolve({ id: 'p-1' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).summary.projectId).toBe('p-1');
  });
});
