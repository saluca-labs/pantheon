/**
 * Business OS Phase 1 — route handler tests.
 *
 * Covers the 11 new BFF routes + legacy /contacts passthrough.
 * Repo / session / audit mocked at module level.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCurrentBusinessUser = vi.fn();
const recordAudit = vi.fn();

const orgsRepo = {
  listOrganizations: vi.fn(),
  getOrganization: vi.fn(),
  createOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  archiveOrganization: vi.fn(),
  restoreOrganization: vi.fn(),
  countActivePeopleForOrganization: vi.fn(),
};
const peopleRepo = {
  listPeople: vi.fn(),
  getPerson: vi.fn(),
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  archivePerson: vi.fn(),
  restorePerson: vi.fn(),
  countActivePeople: vi.fn(),
  countActiveOrganizations: vi.fn(),
};
const interactionsRepo = {
  listInteractions: vi.fn(),
  getInteraction: vi.fn(),
  createInteraction: vi.fn(),
  updateInteraction: vi.fn(),
  deleteInteraction: vi.fn(),
};
const settingsRepo = {
  getSettings: vi.fn(),
  getOrCreateSettings: vi.fn(),
  updateSettings: vi.fn(),
};

vi.mock('@/lib/agentic-os/business/session', () => ({
  getCurrentBusinessUser: (...a: any[]) => getCurrentBusinessUser(...a),
  getBusinessPool: () => ({ query: vi.fn() }),
}));

vi.mock('@/lib/agentic-os/business/repo', () => ({
  recordAudit: (...a: any[]) => recordAudit(...a),
  listPeople: (...a: any[]) => peopleRepo.listPeople(...a),
  listOrganizations: (...a: any[]) => orgsRepo.listOrganizations(...a),
  listInteractions: (...a: any[]) => interactionsRepo.listInteractions(...a),
}));

vi.mock('@/lib/agentic-os/business/orgs-repo', () => orgsRepo);
vi.mock('@/lib/agentic-os/business/people-repo', () => peopleRepo);
vi.mock('@/lib/agentic-os/business/interactions-repo', () => interactionsRepo);
vi.mock('@/lib/agentic-os/business/settings-repo', () => settingsRepo);

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
  for (const m of Object.values({
    ...orgsRepo, ...peopleRepo, ...interactionsRepo, ...settingsRepo,
  })) {
    (m as any).mockReset();
  }
});

const NOW = '2026-05-12T10:00:00.000Z';

function makePerson(o: Record<string, any> = {}) {
  return {
    id: 'p-1', userId: 'u-1',
    firstName: 'Jane', lastName: 'Smith',
    email: null, phone: null, role: null, organizationId: null,
    stage: 'lead',
    tags: [], notes: null,
    descriptionMd: '', address: null, metadata: {},
    archivedAt: null, createdAt: NOW, updatedAt: NOW,
    ...o,
  };
}

function makeOrg(o: Record<string, any> = {}) {
  return {
    id: 'o-1', userId: 'u-1', name: 'Acme', orgType: 'company',
    website: null, industry: null, notes: null,
    descriptionMd: '', address: null,
    tags: [], metadata: {},
    archivedAt: null, createdAt: NOW, updatedAt: NOW,
    ...o,
  };
}

function makeInteraction(o: Record<string, any> = {}) {
  return {
    id: 'i-1', userId: 'u-1',
    personId: null, organizationId: null,
    interactionType: 'note', summary: 'hello',
    occurredAt: NOW, createdAt: NOW,
    ...o,
  };
}

function makeSettings(o: Record<string, any> = {}) {
  return {
    id: 's-1', userId: 'u-1',
    businessName: '', logoUrl: null, address: '',
    taxId: null, defaultCurrency: 'USD',
    invoiceNumberPrefix: 'INV', quoteNumberPrefix: 'Q',
    defaultPaymentTerms: 'net_30',
    defaultHourlyRateCents: null, accentColor: 'teal',
    metadata: {}, createdAt: NOW, updatedAt: NOW,
    ...o,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// /people
// ═══════════════════════════════════════════════════════════════════════

describe('GET /people', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/people';

  it('401 when unauthenticated', async () => {
    getCurrentBusinessUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/people/route');
    const r = await GET(new Request(URL) as any);
    expect(r.status).toBe(401);
  });

  it('200 with empty list and default opts', async () => {
    authed();
    peopleRepo.listPeople.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/people/route');
    const r = await GET(new Request(URL) as any);
    expect(r.status).toBe(200);
    expect(peopleRepo.listPeople).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ archived: false }),
    );
  });

  it('?archived=true forwards archived=true', async () => {
    authed();
    peopleRepo.listPeople.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/people/route');
    await GET(new Request(`${URL}?archived=true`) as any);
    expect(peopleRepo.listPeople).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ archived: true }),
    );
  });

  it('passes tag/organization_id/q to repo', async () => {
    authed();
    peopleRepo.listPeople.mockResolvedValue([]);
    const orgId = '11111111-1111-1111-1111-111111111111';
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/people/route');
    await GET(new Request(`${URL}?tag=warm&organization_id=${orgId}&q=jane`) as any);
    expect(peopleRepo.listPeople).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ tag: 'warm', organizationId: orgId, q: 'jane' }),
    );
  });

  it('400 on bogus organization_id', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/people/route');
    const r = await GET(new Request(`${URL}?organization_id=not-a-uuid`) as any);
    expect(r.status).toBe(400);
  });

  it('400 on out-of-range limit', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/people/route');
    const r = await GET(new Request(`${URL}?limit=9999`) as any);
    expect(r.status).toBe(400);
  });
});

describe('POST /people', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/people';

  it('400 on invalid body', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/people/route');
    const r = await POST(jsonReq(URL, 'POST', { wrong: true }) as any);
    expect(r.status).toBe(400);
  });

  it('201 + audit business.person.created on success', async () => {
    authed();
    peopleRepo.createPerson.mockResolvedValue(makePerson());
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/people/route');
    const r = await POST(
      jsonReq(URL, 'POST', { first_name: 'Jane', last_name: 'Smith' }) as any,
    );
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.person.created' }),
    );
  });

  it('audit payload uses business.* action namespace only', async () => {
    authed();
    peopleRepo.createPerson.mockResolvedValue(makePerson());
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/people/route');
    await POST(jsonReq(URL, 'POST', { first_name: 'J', last_name: 'S' }) as any);
    const call = recordAudit.mock.calls[0]![0] as any;
    expect(call.action).toMatch(/^business\./);
  });
});

describe('GET /people/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/people/p-1';

  it('404 cross-tenant', async () => {
    authed();
    peopleRepo.getPerson.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/people/[id]/route');
    const r = await GET(new Request(URL) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(404);
  });

  it('200 with person', async () => {
    authed();
    peopleRepo.getPerson.mockResolvedValue(makePerson());
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/people/[id]/route');
    const r = await GET(new Request(URL) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.person.id).toBe('p-1');
  });
});

describe('PATCH /people/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/people/p-1';

  it('404 cross-tenant', async () => {
    authed();
    peopleRepo.getPerson.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/people/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { first_name: 'Z' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(404);
  });

  it('PATCH archived=true delegates to archivePerson + audits .archived', async () => {
    authed();
    peopleRepo.getPerson.mockResolvedValue(makePerson());
    peopleRepo.archivePerson.mockResolvedValue(
      makePerson({ archivedAt: '2026-05-12T11:00:00Z' }),
    );
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/people/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { archived: true }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.person.archived' }),
    );
  });

  it('PATCH archived=false 400s with a restore-route pointer', async () => {
    authed();
    peopleRepo.getPerson.mockResolvedValue(makePerson());
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/people/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { archived: false }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.restorePath).toContain('/people/p-1/restore');
  });

  it('PATCH partial update audits .updated with fields list', async () => {
    authed();
    peopleRepo.getPerson.mockResolvedValue(makePerson());
    peopleRepo.updatePerson.mockResolvedValue({ kind: 'ok', person: makePerson({ role: 'CEO' }) });
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/people/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { role: 'CEO' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'business.person.updated',
        payload: expect.objectContaining({ fields: expect.arrayContaining(['role']) }),
      }),
    );
  });

  it('rejects stray fields via z.object().strict()', async () => {
    authed();
    peopleRepo.getPerson.mockResolvedValue(makePerson());
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/people/[id]/route');
    const r = await PATCH(
      jsonReq(URL, 'PATCH', { stray_unknown_key: 'x' }) as any,
      params({ id: 'p-1' }),
    );
    expect(r.status).toBe(400);
  });
});

describe('DELETE /people/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/people/p-1';

  it('404 cross-tenant', async () => {
    authed();
    peopleRepo.getPerson.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/business/people/[id]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(404);
  });

  it('soft-archives + audits .archived', async () => {
    authed();
    peopleRepo.getPerson.mockResolvedValue(makePerson());
    peopleRepo.archivePerson.mockResolvedValue(
      makePerson({ archivedAt: '2026-05-12T11:00:00Z' }),
    );
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/business/people/[id]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.person.archived' }),
    );
  });
});

describe('POST /people/[id]/restore', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/people/p-1/restore';

  it('404 cross-tenant', async () => {
    authed();
    peopleRepo.restorePerson.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/people/[id]/restore/route');
    const r = await POST(new Request(URL, { method: 'POST' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(404);
  });

  it('400 when already active', async () => {
    authed();
    peopleRepo.restorePerson.mockResolvedValue({
      person: makePerson(),
      alreadyActive: true,
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/people/[id]/restore/route');
    const r = await POST(new Request(URL, { method: 'POST' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(400);
  });

  it('200 + audit business.person.restored on success', async () => {
    authed();
    peopleRepo.restorePerson.mockResolvedValue({
      person: makePerson(),
      alreadyActive: false,
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/people/[id]/restore/route');
    const r = await POST(new Request(URL, { method: 'POST' }) as any, params({ id: 'p-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.person.restored' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /organizations
// ═══════════════════════════════════════════════════════════════════════

describe('GET /organizations', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/organizations';

  it('401 when unauthenticated', async () => {
    getCurrentBusinessUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/organizations/route');
    const r = await GET(new Request(URL) as any);
    expect(r.status).toBe(401);
  });

  it('400 on invalid org_type filter', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/organizations/route');
    const r = await GET(new Request(`${URL}?org_type=startup`) as any);
    expect(r.status).toBe(400);
  });

  it('passes tag/industry/org_type/q to repo', async () => {
    authed();
    orgsRepo.listOrganizations.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/organizations/route');
    await GET(new Request(`${URL}?tag=enterprise&industry=saas&org_type=company&q=acme`) as any);
    expect(orgsRepo.listOrganizations).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        tag: 'enterprise', industry: 'saas', orgType: 'company', q: 'acme', archived: false,
      }),
    );
  });
});

describe('POST /organizations', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/organizations';

  it('400 on invalid body', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/organizations/route');
    const r = await POST(jsonReq(URL, 'POST', { wrong: true }) as any);
    expect(r.status).toBe(400);
  });

  it('201 + audit business.org.created on success', async () => {
    authed();
    orgsRepo.createOrganization.mockResolvedValue(makeOrg());
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/organizations/route');
    const r = await POST(jsonReq(URL, 'POST', { name: 'Acme' }) as any);
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.org.created' }),
    );
  });

  it('rejects invalid org_type with 400', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/organizations/route');
    const r = await POST(
      jsonReq(URL, 'POST', { name: 'Acme', org_type: 'startup' }) as any,
    );
    expect(r.status).toBe(400);
  });
});

describe('GET /organizations/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/organizations/o-1';

  it('404 cross-tenant', async () => {
    authed();
    orgsRepo.getOrganization.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/organizations/[id]/route');
    const r = await GET(new Request(URL) as any, params({ id: 'o-1' }));
    expect(r.status).toBe(404);
  });

  it('200 with org + activePeopleCount', async () => {
    authed();
    orgsRepo.getOrganization.mockResolvedValue(makeOrg());
    orgsRepo.countActivePeopleForOrganization.mockResolvedValue(5);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/organizations/[id]/route');
    const r = await GET(new Request(URL) as any, params({ id: 'o-1' }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.activePeopleCount).toBe(5);
  });
});

describe('PATCH /organizations/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/organizations/o-1';

  it('archived=true audits .archived', async () => {
    authed();
    orgsRepo.getOrganization.mockResolvedValue(makeOrg());
    orgsRepo.archiveOrganization.mockResolvedValue(
      makeOrg({ archivedAt: '2026-05-12T11:00:00Z' }),
    );
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/organizations/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { archived: true }) as any, params({ id: 'o-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.org.archived' }),
    );
  });

  it('archived=false 400s with restore pointer', async () => {
    authed();
    orgsRepo.getOrganization.mockResolvedValue(makeOrg());
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/organizations/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { archived: false }) as any, params({ id: 'o-1' }));
    expect(r.status).toBe(400);
  });

  it('rejects stray fields via .strict()', async () => {
    authed();
    orgsRepo.getOrganization.mockResolvedValue(makeOrg());
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/organizations/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { stray: 'x' }) as any, params({ id: 'o-1' }));
    expect(r.status).toBe(400);
  });

  it('updates non-archive fields with audit', async () => {
    authed();
    orgsRepo.getOrganization.mockResolvedValue(makeOrg());
    orgsRepo.updateOrganization.mockResolvedValue({ kind: 'ok', org: makeOrg({ industry: 'fintech' }) });
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/organizations/[id]/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { industry: 'fintech' }) as any, params({ id: 'o-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.org.updated' }),
    );
  });
});

describe('DELETE /organizations/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/organizations/o-1';

  it('soft-archives + audits .archived', async () => {
    authed();
    orgsRepo.getOrganization.mockResolvedValue(makeOrg());
    orgsRepo.archiveOrganization.mockResolvedValue(
      makeOrg({ archivedAt: '2026-05-12T11:00:00Z' }),
    );
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/business/organizations/[id]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ id: 'o-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.org.archived' }),
    );
  });
});

describe('POST /organizations/[id]/restore', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/organizations/o-1/restore';

  it('404 cross-tenant', async () => {
    authed();
    orgsRepo.restoreOrganization.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/organizations/[id]/restore/route');
    const r = await POST(new Request(URL, { method: 'POST' }) as any, params({ id: 'o-1' }));
    expect(r.status).toBe(404);
  });

  it('400 already active', async () => {
    authed();
    orgsRepo.restoreOrganization.mockResolvedValue({
      org: makeOrg(), alreadyActive: true,
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/organizations/[id]/restore/route');
    const r = await POST(new Request(URL, { method: 'POST' }) as any, params({ id: 'o-1' }));
    expect(r.status).toBe(400);
  });

  it('200 + audit business.org.restored on success', async () => {
    authed();
    orgsRepo.restoreOrganization.mockResolvedValue({
      org: makeOrg(), alreadyActive: false,
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/organizations/[id]/restore/route');
    const r = await POST(new Request(URL, { method: 'POST' }) as any, params({ id: 'o-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.org.restored' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /interactions
// ═══════════════════════════════════════════════════════════════════════

describe('GET /interactions', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/interactions';

  it('401 when unauthenticated', async () => {
    getCurrentBusinessUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/interactions/route');
    const r = await GET(new Request(URL) as any);
    expect(r.status).toBe(401);
  });

  it('passes person_id/organization_id/interaction_type/from/to', async () => {
    authed();
    interactionsRepo.listInteractions.mockResolvedValue([]);
    const pid = '11111111-1111-1111-1111-111111111111';
    const oid = '22222222-2222-2222-2222-222222222222';
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/interactions/route');
    await GET(new Request(
      `${URL}?person_id=${pid}&organization_id=${oid}&interaction_type=call&from=2026-05-01&to=2026-05-31`,
    ) as any);
    expect(interactionsRepo.listInteractions).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        personId: pid, organizationId: oid, interactionType: 'call',
        from: '2026-05-01', to: '2026-05-31',
      }),
    );
  });

  it('400 on bad interaction_type', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/interactions/route');
    const r = await GET(new Request(`${URL}?interaction_type=phonecall`) as any);
    expect(r.status).toBe(400);
  });

  it('400 on bad from date', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/interactions/route');
    const r = await GET(new Request(`${URL}?from=last-tuesday`) as any);
    expect(r.status).toBe(400);
  });
});

describe('POST /interactions', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/interactions';

  it('400 on invalid body', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/interactions/route');
    const r = await POST(jsonReq(URL, 'POST', { wrong: true }) as any);
    expect(r.status).toBe(400);
  });

  it('201 + audit business.interaction.created', async () => {
    authed();
    interactionsRepo.createInteraction.mockResolvedValue(makeInteraction());
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/interactions/route');
    const r = await POST(
      jsonReq(URL, 'POST', { interaction_type: 'note', summary: 'hi' }) as any,
    );
    expect(r.status).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.interaction.created' }),
    );
  });
});

describe('GET / PATCH / DELETE /interactions/[id]', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/interactions/i-1';

  it('GET 404 cross-tenant', async () => {
    authed();
    interactionsRepo.getInteraction.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/interactions/[id]/route');
    const r = await GET(new Request(URL) as any, params({ id: 'i-1' }));
    expect(r.status).toBe(404);
  });

  it('PATCH audits .updated on success', async () => {
    authed();
    interactionsRepo.getInteraction.mockResolvedValue(makeInteraction());
    interactionsRepo.updateInteraction.mockResolvedValue({
      kind: 'ok', interaction: makeInteraction({ summary: 'updated' }),
    });
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/interactions/[id]/route');
    const r = await PATCH(
      jsonReq(URL, 'PATCH', { summary: 'updated' }) as any,
      params({ id: 'i-1' }),
    );
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.interaction.updated' }),
    );
  });

  it('PATCH rejects stray fields via .strict()', async () => {
    authed();
    interactionsRepo.getInteraction.mockResolvedValue(makeInteraction());
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/interactions/[id]/route');
    const r = await PATCH(
      jsonReq(URL, 'PATCH', { stray: 'x' }) as any,
      params({ id: 'i-1' }),
    );
    expect(r.status).toBe(400);
  });

  it('DELETE audits .deleted on success', async () => {
    authed();
    interactionsRepo.getInteraction.mockResolvedValue(makeInteraction());
    interactionsRepo.deleteInteraction.mockResolvedValue(true);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/business/interactions/[id]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ id: 'i-1' }));
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.interaction.deleted' }),
    );
  });

  it('DELETE 404 when interaction not found', async () => {
    authed();
    interactionsRepo.getInteraction.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/tiresias/agentic-os/business/interactions/[id]/route');
    const r = await DELETE(new Request(URL, { method: 'DELETE' }) as any, params({ id: 'i-1' }));
    expect(r.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// /settings
// ═══════════════════════════════════════════════════════════════════════

describe('GET /settings', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/settings';

  it('401 when unauthenticated', async () => {
    getCurrentBusinessUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/settings/route');
    const r = await GET();
    expect(r.status).toBe(401);
  });

  it('200 returns settings without audit on existing row', async () => {
    authed();
    settingsRepo.getOrCreateSettings.mockResolvedValue({
      settings: makeSettings(), created: false,
    });
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/settings/route');
    const r = await GET();
    expect(r.status).toBe(200);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('200 + audits business.settings.created on lazy-create', async () => {
    authed();
    settingsRepo.getOrCreateSettings.mockResolvedValue({
      settings: makeSettings(), created: true,
    });
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/settings/route');
    const r = await GET();
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.settings.created' }),
    );
  });

  it('caller never sees another user\'s row (scope is via session)', async () => {
    // The route reads getCurrentBusinessUser() and then calls
    // getOrCreateSettings(user.userId).  If we mock the session to return
    // u-2 we observe that the repo receives u-2 — never u-1.
    getCurrentBusinessUser.mockResolvedValue({
      userId: 'u-2', tenantId: 't-2', email: 'other@example.com',
    });
    settingsRepo.getOrCreateSettings.mockResolvedValue({
      settings: makeSettings({ userId: 'u-2' }), created: false,
    });
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/settings/route');
    await GET();
    expect(settingsRepo.getOrCreateSettings).toHaveBeenCalledWith('u-2');
  });
});

describe('PATCH /settings', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/settings';

  it('400 on invalid body', async () => {
    authed();
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/settings/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { default_hourly_rate_cents: 'not-a-number' }) as any);
    expect(r.status).toBe(400);
  });

  it('rejects stray fields via .strict()', async () => {
    authed();
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/settings/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { stray_field: 'x' }) as any);
    expect(r.status).toBe(400);
  });

  it('200 + audit business.settings.updated', async () => {
    authed();
    settingsRepo.updateSettings.mockResolvedValue(makeSettings({ businessName: 'Acme' }));
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/settings/route');
    const r = await PATCH(jsonReq(URL, 'PATCH', { business_name: 'Acme' }) as any);
    expect(r.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'business.settings.updated' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Legacy /contacts deprecation
// ═══════════════════════════════════════════════════════════════════════

describe('Legacy /contacts route', () => {
  const URL = 'http://t/api/tiresias/agentic-os/business/contacts';

  it('GET joins people + organizations + interactions into legacy shape', async () => {
    authed();
    peopleRepo.listPeople.mockResolvedValue([makePerson()]);
    orgsRepo.listOrganizations.mockResolvedValue([makeOrg()]);
    interactionsRepo.listInteractions.mockResolvedValue([makeInteraction()]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/contacts/route');
    const r = await GET();
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toHaveProperty('people');
    expect(body).toHaveProperty('organizations');
    expect(body).toHaveProperty('interactions');
  });

  it('GET 401 when unauthenticated', async () => {
    getCurrentBusinessUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/business/contacts/route');
    const r = await GET();
    expect(r.status).toBe(401);
  });

  it('POST returns 410 Gone with a pointer to the new routes', async () => {
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/contacts/route');
    const r = await POST();
    expect(r.status).toBe(410);
    const body = await r.json();
    expect(body.detail).toMatch(/\/people/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Audit-namespace guard (no leak into other OS slugs)
// ═══════════════════════════════════════════════════════════════════════

describe('Audit namespace guard', () => {
  it('every audited mutation uses a business.* action name', async () => {
    authed();
    peopleRepo.createPerson.mockResolvedValue(makePerson());
    orgsRepo.createOrganization.mockResolvedValue(makeOrg());
    interactionsRepo.createInteraction.mockResolvedValue(makeInteraction());
    settingsRepo.updateSettings.mockResolvedValue(makeSettings());

    const { POST: PostPerson } = await import('@/app/api/tiresias/agentic-os/business/people/route');
    const { POST: PostOrg } = await import('@/app/api/tiresias/agentic-os/business/organizations/route');
    const { POST: PostInteraction } = await import('@/app/api/tiresias/agentic-os/business/interactions/route');
    const { PATCH: PatchSettings } = await import('@/app/api/tiresias/agentic-os/business/settings/route');

    await PostPerson(jsonReq('http://t/api/tiresias/agentic-os/business/people', 'POST', { first_name: 'J', last_name: 'S' }) as any);
    await PostOrg(jsonReq('http://t/api/tiresias/agentic-os/business/organizations', 'POST', { name: 'Acme' }) as any);
    await PostInteraction(jsonReq('http://t/api/tiresias/agentic-os/business/interactions', 'POST', { interaction_type: 'note', summary: 'x' }) as any);
    await PatchSettings(jsonReq('http://t/api/tiresias/agentic-os/business/settings', 'PATCH', { business_name: 'X' }) as any);

    expect(recordAudit).toHaveBeenCalledTimes(4);
    for (const call of recordAudit.mock.calls) {
      expect((call[0] as any).action).toMatch(/^business\./);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Bridge / PII guard — best-effort
// ═══════════════════════════════════════════════════════════════════════

describe('Bridge PII guard', () => {
  it('person audit payloads do not echo raw email/phone strings', async () => {
    authed();
    peopleRepo.createPerson.mockResolvedValue(makePerson({ email: 'jane@example.com', phone: '+1-555-0123' }));
    const { POST } = await import('@/app/api/tiresias/agentic-os/business/people/route');
    await POST(
      jsonReq(
        'http://t/api/tiresias/agentic-os/business/people',
        'POST',
        { first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com', phone: '+1-555-0123' },
      ) as any,
    );
    const call = recordAudit.mock.calls[0]![0] as any;
    const payloadJson = JSON.stringify(call.payload);
    expect(payloadJson).not.toMatch(/jane@example\.com/);
    expect(payloadJson).not.toMatch(/\+1-555-0123/);
  });

  it('settings update payload echoes only the fields list, not the secret values', async () => {
    authed();
    settingsRepo.updateSettings.mockResolvedValue(makeSettings());
    const { PATCH } = await import('@/app/api/tiresias/agentic-os/business/settings/route');
    await PATCH(
      jsonReq(
        'http://t/api/tiresias/agentic-os/business/settings',
        'PATCH',
        { tax_id: 'TOPSECRET-EIN-1234' },
      ) as any,
    );
    const call = recordAudit.mock.calls[0]![0] as any;
    const payloadJson = JSON.stringify(call.payload);
    expect(payloadJson).not.toMatch(/TOPSECRET-EIN-1234/);
    // But the field name should be echoed for change-tracking
    expect(payloadJson).toMatch(/tax_id/);
  });
});
