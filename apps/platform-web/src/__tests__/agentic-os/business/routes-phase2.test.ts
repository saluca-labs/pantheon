/**
 * Business OS Phase 2 — deals route handler tests.
 *
 * Covers the 4 new deals route families. Repo / session / audit mocked
 * at module level.
 *
 * @license MIT — Tiresias Business OS Phase 2 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentBusinessUser = vi.fn();
const recordAudit = vi.fn();

const dealsRepo = {
  listDeals: vi.fn(),
  getDeal: vi.fn(),
  createDeal: vi.fn(),
  updateDeal: vi.fn(),
  archiveDeal: vi.fn(),
  restoreDeal: vi.fn(),
  transitionDealStage: vi.fn(),
  validateDealOwnership: vi.fn(),
  validateContactOwnership: vi.fn(),
  validateOrganizationOwnership: vi.fn(),
};

vi.mock('@/lib/agentic-os/business/session', () => ({
  getCurrentBusinessUser: (...a: any[]) => getCurrentBusinessUser(...a),
  getBusinessPool: () => ({ query: vi.fn() }),
}));

vi.mock('@/lib/agentic-os/business/repo', () => ({
  recordAudit: (...a: any[]) => recordAudit(...a),
}));

vi.mock('@/lib/agentic-os/business/deals-repo', () => dealsRepo);

function authed() {
  getCurrentBusinessUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'cristian@example.com',
  });
}

function jsonReq(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

function params<T extends Record<string, string>>(p: T) {
  return { params: Promise.resolve(p) };
}

beforeEach(() => {
  getCurrentBusinessUser.mockReset();
  recordAudit.mockReset();
  recordAudit.mockResolvedValue(undefined);
  for (const m of Object.values(dealsRepo)) {
    (m as any).mockReset();
  }
});

const NOW = '2026-05-12T10:00:00.000Z';

function makeDeal(o: Record<string, any> = {}) {
  return {
    id: 'd-1', userId: 'u-1',
    contactId: null, organizationId: null,
    title: 'Big Deal', descriptionMd: '',
    stage: 'lead', valueCents: null, currency: 'USD',
    probabilityPct: 50, expectedCloseDate: null,
    closedAt: null, lostReason: null, source: null,
    tags: [], metadata: {},
    archivedAt: null, createdAt: NOW, updatedAt: NOW,
    ...o,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// /deals (collection)
// ═══════════════════════════════════════════════════════════════════════

describe('GET /deals', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/deals';

  it('401 when unauthenticated', async () => {
    getCurrentBusinessUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/deals/route');
    const r = await GET(new Request(URL) as any);
    expect(r.status).toBe(401);
  });

  it('200 with empty list and default opts', async () => {
    authed();
    dealsRepo.listDeals.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/deals/route');
    const r = await GET(new Request(URL) as any);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.deals).toEqual([]);
  });

  it('passes stage/contact_id/organization_id/source/tag/q/open to repo', async () => {
    authed();
    dealsRepo.listDeals.mockResolvedValue([]);
    const oid = '11111111-1111-1111-1111-111111111111';
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/deals/route');
    await GET(new Request(
      `${URL}?stage=lead,qualified&contact_id=${oid}&organization_id=${oid}&source=referral&tag=hot&open=true&q=acme`,
    ) as any);
    expect(dealsRepo.listDeals).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        stage: ['lead', 'qualified'],
        contactId: oid,
        organizationId: oid,
        source: 'referral',
        tag: 'hot',
        open: true,
        q: 'acme',
      }),
    );
  });

  it('?include=forecast wraps deals in DealWithForecast + adds forecast summary', async () => {
    authed();
    dealsRepo.listDeals.mockResolvedValue([
      makeDeal({ id: 'd-1', valueCents: 10000, probabilityPct: 50 }),
    ]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/deals/route');
    const r = await GET(new Request(`${URL}?include=forecast`) as any);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.deals[0]).toHaveProperty('weightedValueCents');
    expect(body.forecast).toBeDefined();
    expect(body.forecast.dealCount).toBe(1);
  });

  it('400 on invalid contact_id (not a UUID)', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/deals/route');
    const r = await GET(new Request(`${URL}?contact_id=not-a-uuid`) as any);
    expect(r.status).toBe(400);
  });

  it('400 on invalid organization_id (not a UUID)', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/deals/route');
    const r = await GET(new Request(`${URL}?organization_id=not-a-uuid`) as any);
    expect(r.status).toBe(400);
  });

  it('400 on invalid stage value', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/deals/route');
    const r = await GET(new Request(`${URL}?stage=startup`) as any);
    expect(r.status).toBe(400);
  });

  it('400 on out-of-range limit', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/deals/route');
    const r = await GET(new Request(`${URL}?limit=9999`) as any);
    expect(r.status).toBe(400);
  });
});

describe('POST /deals', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/deals';

  it('401 when unauthenticated', async () => {
    getCurrentBusinessUser.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/route');
    const r = await POST(jsonReq(URL, 'POST', { title: 'X' }) as any);
    expect(r.status).toBe(401);
  });

  it('400 on invalid body', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/route');
    const r = await POST(jsonReq(URL, 'POST', { wrong: true }) as any);
    expect(r.status).toBe(400);
  });

  it('400 when title is missing', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/route');
    const r = await POST(jsonReq(URL, 'POST', {}) as any);
    expect(r.status).toBe(400);
  });

  it('201 + audit business.deal.created on success', async () => {
    authed();
    dealsRepo.createDeal.mockResolvedValue(makeDeal());
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/route');
    const r = await POST(jsonReq(URL, 'POST', { title: 'Acme deal' }) as any);
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.deal.created' }),
    );
  });

  it('accepts optional contact_id, value_cents, stage, tags', async () => {
    authed();
    dealsRepo.createDeal.mockResolvedValue(
      makeDeal({ contactId: 'c-1', valueCents: 50000, stage: 'qualified', tags: ['hot', 'urgent'] }),
    );
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/route');
    const r = await POST(jsonReq(URL, 'POST', {
      title: 'Big one',
      contact_id: '11111111-1111-1111-1111-111111111111',
      value_cents: 50000,
      stage: 'qualified',
      tags: ['hot', 'urgent'],
    }) as any);
    expect(r.status).toBe(201);
    expect(dealsRepo.createDeal).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        contactId: '11111111-1111-1111-1111-111111111111',
        valueCents: 50000,
        stage: 'qualified',
        tags: ['hot', 'urgent'],
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /deals/[id] (single resource)
// ═══════════════════════════════════════════════════════════════════════

describe('GET /deals/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/deals/d-1';

  it('401 when unauthenticated', async () => {
    getCurrentBusinessUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/route');
    const r = await GET(new Request(URL) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/route');
    const r = await GET(new Request(URL) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(404);
  });

  it('200 with deal', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(makeDeal());
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/route');
    const r = await GET(new Request(URL) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.deal.id).toBe('d-1');
  });
});

describe('PATCH /deals/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/deals/d-1';

  it('401 when unauthenticated', async () => {
    getCurrentBusinessUser.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { title: 'X' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { title: 'X' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(404);
  });

  it('PATCH archived=true delegates to archiveDeal + audits .archived', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(makeDeal());
    dealsRepo.archiveDeal.mockResolvedValue(
      makeDeal({ archivedAt: '2026-05-12T11:00:00Z' }),
    );
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { archived: true }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.deal.archived' }),
    );
  });

  it('PATCH archived=false 400s with restore-route pointer', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(makeDeal());
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { archived: false }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.restorePath).toContain('/deals/d-1/restore');
  });

  it('PATCH partial update audits .updated with fields list', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(makeDeal());
    dealsRepo.updateDeal.mockResolvedValue({ kind: 'ok', deal: makeDeal({ title: 'Updated' }) });
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { title: 'Updated' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'business.deal.updated',
        payload: expect.objectContaining({ fields: expect.arrayContaining(['title']) }),
      }),
    );
  });

  it('rejects stray fields via z.object().strict()', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(makeDeal());
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/route');
    const r = await PATCH(
      jsonReq(URL, 'PATCH', { stray_unknown_key: 'x' }) as any,
      params({ id: 'd-1' }),
    );
    expect(r.status).toBe(400);
  });
});

describe('DELETE /deals/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/deals/d-1';

  it('401 when unauthenticated', async () => {
    getCurrentBusinessUser.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(404);
  });

  it('soft-archives + audits .archived', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(makeDeal());
    dealsRepo.archiveDeal.mockResolvedValue(
      makeDeal({ archivedAt: '2026-05-12T11:00:00Z' }),
    );
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.deal.archived' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /deals/[id]/restore
// ═══════════════════════════════════════════════════════════════════════

describe('POST /deals/[id]/restore', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/deals/d-1/restore';

  it('401 when unauthenticated', async () => {
    getCurrentBusinessUser.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/restore/route');
    const r = await POST(new Request(URL, { method: 'POST' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(401);
  });

  it('404 cross-tenant', async () => {
    authed();
    dealsRepo.restoreDeal.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/restore/route');
    const r = await POST(new Request(URL, { method: 'POST' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(404);
  });

  it('400 when already active', async () => {
    authed();
    dealsRepo.restoreDeal.mockResolvedValue({
      deal: makeDeal(), alreadyActive: true,
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/restore/route');
    const r = await POST(new Request(URL, { method: 'POST' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(400);
  });

  it('200 + audit business.deal.restored on success', async () => {
    authed();
    dealsRepo.restoreDeal.mockResolvedValue({
      deal: makeDeal(), alreadyActive: false,
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/restore/route');
    const r = await POST(new Request(URL, { method: 'POST' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.deal.restored' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /deals/[id]/stage
// ═══════════════════════════════════════════════════════════════════════

describe('POST /deals/[id]/stage', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/deals/d-1/stage';

  it('401 when unauthenticated', async () => {
    getCurrentBusinessUser.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/stage/route');
    const r = await POST(jsonReq(URL, 'POST', { stage: 'qualified' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(401);
  });

  it('404 when deal not found', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/stage/route');
    const r = await POST(jsonReq(URL, 'POST', { stage: 'qualified' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(404);
  });

  it('400 on invalid body (bad stage value)', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(makeDeal());
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/stage/route');
    const r = await POST(jsonReq(URL, 'POST', { stage: 'startup' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(400);
  });

  it('always audits business.deal.stage_changed', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(makeDeal({ stage: 'lead' }));
    dealsRepo.transitionDealStage.mockResolvedValue({
      kind: 'ok', deal: makeDeal({ stage: 'qualified' }),
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/stage/route');
    const r = await POST(jsonReq(URL, 'POST', { stage: 'qualified' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(200);
    const stageChangeCall = recordAudit.mock.calls.find(
      (c: any) => c[0].action === 'business.deal.stage_changed',
    );
    expect(stageChangeCall).toBeDefined();
  });

  it('audits business.deal.won when moving to won stage', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(makeDeal({ stage: 'negotiation' }));
    dealsRepo.transitionDealStage.mockResolvedValue({
      kind: 'ok', deal: makeDeal({ stage: 'won', closedAt: NOW }),
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/stage/route');
    await POST(jsonReq(URL, 'POST', { stage: 'won' }) as any, params({ id: 'd-1' }));
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.deal.won' }),
    );
  });

  it('audits business.deal.lost when moving to lost stage (with lost_reason)', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(makeDeal({ stage: 'proposal' }));
    dealsRepo.transitionDealStage.mockResolvedValue({
      kind: 'ok', deal: makeDeal({ stage: 'lost', lostReason: 'Went with competitor', closedAt: NOW }),
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/stage/route');
    await POST(jsonReq(URL, 'POST', {
      stage: 'lost', lost_reason: 'Went with competitor',
    }) as any, params({ id: 'd-1' }));
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'business.deal.lost',
        payload: expect.objectContaining({ lostReason: 'Went with competitor' }),
      }),
    );
  });

  it('audits business.deal.reopened when moving FROM won/lost back to open', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(makeDeal({ stage: 'lost', closedAt: NOW }));
    dealsRepo.transitionDealStage.mockResolvedValue({
      kind: 'ok', deal: makeDeal({ stage: 'lead', closedAt: null }),
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/stage/route');
    await POST(jsonReq(URL, 'POST', { stage: 'lead' }) as any, params({ id: 'd-1' }));
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.deal.reopened' }),
    );
  });

  it('400 on invalid transition (repo returns kind=invalid_transition)', async () => {
    authed();
    dealsRepo.getDeal.mockResolvedValue(makeDeal({ stage: 'lead' }));
    dealsRepo.transitionDealStage.mockResolvedValue({
      kind: 'invalid_transition', reason: 'Already in stage',
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/deals/[id]/stage/route');
    const r = await POST(jsonReq(URL, 'POST', { stage: 'lead' }) as any, params({ id: 'd-1' }));
    expect(r.status).toBe(400);
  });
});
