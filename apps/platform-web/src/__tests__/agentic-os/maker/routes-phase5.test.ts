/**
 * Maker OS — Phase 5 route handler tests.
 *
 * Covers:
 *   - 401 unauthenticated on every new route.
 *   - 200 / 201 happy paths against the mocked repo.
 *   - 400 invalid body on POST routes.
 *   - 400 attachment-exclusivity violations on POST /spec-sheets.
 *   - 409 on duplicate project↔reference link.
 *   - 404 routing when the repo throws "not found".
 *   - 400 on /export.pdf with empty project.
 *   - 200 application/pdf + Content-Disposition on /export.pdf with data.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentMakerUser = vi.fn();

vi.mock('@/lib/agentic-os/maker/session', () => ({
  getCurrentMakerUser: (...args: unknown[]) => getCurrentMakerUser(...args),
  getMakerPool: () => ({ query: vi.fn() }),
}));

const repoMocks = {
  listSpecSheets: vi.fn(),
  getSpecSheet: vi.fn(),
  createSpecSheet: vi.fn(),
  updateSpecSheet: vi.fn(),
  deleteSpecSheet: vi.fn(),
  listSpecSheetsForProject: vi.fn(),
  listReferences: vi.fn(),
  getReference: vi.fn(),
  createReference: vi.fn(),
  updateReference: vi.fn(),
  deleteReference: vi.fn(),
  listReferencesForProject: vi.fn(),
  attachReferenceToProject: vi.fn(),
  updateProjectReferenceLink: vi.fn(),
  detachReferenceFromProject: vi.fn(),
  getProject: vi.fn(),
  getBomSummary: vi.fn(),
  listBuildSteps: vi.fn(),
  listMilestones: vi.fn(),
  listToolsForProject: vi.fn(),
  recordAudit: vi.fn(),
};

vi.mock('@/lib/agentic-os/maker/repo', () => repoMocks);

// Mock the PDF render primitive so we don't run @react-pdf/renderer in tests.
vi.mock('@/lib/agentic-os/_shared/pdf/render', () => ({
  renderPdfToBuffer: vi.fn(async () => Buffer.from('%PDF-1.4 fake content')),
}));

beforeEach(() => {
  getCurrentMakerUser.mockReset();
  for (const m of Object.values(repoMocks)) (m as unknown as { mockReset: () => void }).mockReset();
});

function authed() {
  getCurrentMakerUser.mockResolvedValue({
    userId: 'u-1',
    tenantId: 't-1',
    email: 'cristian@example.com',
  });
}

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

function paramsFor(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

const VALID_UUID = '00000000-0000-4000-8000-000000000001';

// ═════════ /spec-sheets ═══════════════════════════════════════════════════

describe('GET /spec-sheets', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/spec-sheets/route');
    const res = await GET(jsonReq('http://t/spec-sheets', 'GET') as never);
    expect(res.status).toBe(401);
  });

  it('200 with specSheets array', async () => {
    authed();
    repoMocks.listSpecSheets.mockResolvedValue([{ id: 's-1' }]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/spec-sheets/route');
    const res = await GET(jsonReq('http://t/spec-sheets', 'GET') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.specSheets).toHaveLength(1);
    expect(repoMocks.listSpecSheets).toHaveBeenCalledWith({
      userId: 'u-1',
      attachment: undefined,
      partId: undefined,
      toolId: undefined,
      projectId: undefined,
      kind: undefined,
      tag: undefined,
    });
  });

  it('forwards ?attachment + ?part_id + ?kind + ?tag', async () => {
    authed();
    repoMocks.listSpecSheets.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/spec-sheets/route');
    await GET(
      jsonReq(
        'http://t/spec-sheets?attachment=part&part_id=pa-1&kind=datasheet&tag=stepper',
        'GET',
      ) as never,
    );
    expect(repoMocks.listSpecSheets).toHaveBeenCalledWith({
      userId: 'u-1',
      attachment: 'part',
      partId: 'pa-1',
      toolId: undefined,
      projectId: undefined,
      kind: 'datasheet',
      tag: 'stepper',
    });
  });

  it('400 invalid attachment', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/spec-sheets/route');
    const res = await GET(
      jsonReq('http://t/spec-sheets?attachment=bogus', 'GET') as never,
    );
    expect(res.status).toBe(400);
  });

  it('400 invalid kind', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/spec-sheets/route');
    const res = await GET(
      jsonReq('http://t/spec-sheets?kind=schematic', 'GET') as never,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /spec-sheets', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/spec-sheets/route');
    const res = await POST(
      jsonReq('http://t/spec-sheets', 'POST', {
        title: 'X',
        url: 'http://x',
        partId: VALID_UUID,
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('400 invalid body (missing title)', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/spec-sheets/route');
    const res = await POST(
      jsonReq('http://t/spec-sheets', 'POST', {
        url: 'http://x',
        partId: VALID_UUID,
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('400 attachment-exclusivity violation (zero attachments)', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/spec-sheets/route');
    const res = await POST(
      jsonReq('http://t/spec-sheets', 'POST', {
        title: 'X',
        url: 'http://x',
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/);
  });

  it('400 attachment-exclusivity violation (two attachments)', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/spec-sheets/route');
    const res = await POST(
      jsonReq('http://t/spec-sheets', 'POST', {
        title: 'X',
        url: 'http://x',
        partId: VALID_UUID,
        toolId: VALID_UUID,
      }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not more/);
  });

  it('201 happy path with part attachment', async () => {
    authed();
    repoMocks.createSpecSheet.mockResolvedValue({
      id: 's-1',
      title: 'NEMA17 datasheet',
      kind: 'datasheet',
      partId: VALID_UUID,
      toolId: null,
      projectId: null,
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/spec-sheets/route');
    const res = await POST(
      jsonReq('http://t/spec-sheets', 'POST', {
        title: 'NEMA17 datasheet',
        url: 'https://example.com/d.pdf',
        partId: VALID_UUID,
      }) as never,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.spec_sheet.created' }),
    );
  });

  it('404 when repo says part not found', async () => {
    authed();
    repoMocks.createSpecSheet.mockRejectedValue(
      new Error('Part not found or not owned by user'),
    );
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/spec-sheets/route');
    const res = await POST(
      jsonReq('http://t/spec-sheets', 'POST', {
        title: 'X',
        url: 'http://x',
        partId: VALID_UUID,
      }) as never,
    );
    expect(res.status).toBe(404);
  });
});

describe('GET / PATCH / DELETE /spec-sheets/[id]', () => {
  it('GET 401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/spec-sheets/[id]/route'
    );
    const res = await GET(
      jsonReq('http://t/spec-sheets/s-1', 'GET') as never,
      paramsFor({ id: 's-1' }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('GET 404 when not owned', async () => {
    authed();
    repoMocks.getSpecSheet.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/spec-sheets/[id]/route'
    );
    const res = await GET(
      jsonReq('http://t/spec-sheets/s-1', 'GET') as never,
      paramsFor({ id: 's-1' }) as never,
    );
    expect(res.status).toBe(404);
  });

  it('GET 200 when owned', async () => {
    authed();
    repoMocks.getSpecSheet.mockResolvedValue({ id: 's-1', title: 'X' });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/spec-sheets/[id]/route'
    );
    const res = await GET(
      jsonReq('http://t/spec-sheets/s-1', 'GET') as never,
      paramsFor({ id: 's-1' }) as never,
    );
    expect(res.status).toBe(200);
  });

  it('PATCH 200 happy path', async () => {
    authed();
    repoMocks.updateSpecSheet.mockResolvedValue({ id: 's-1', title: 'New' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/spec-sheets/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/spec-sheets/s-1', 'PATCH', { title: 'New' }) as never,
      paramsFor({ id: 's-1' }) as never,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.spec_sheet.updated' }),
    );
  });

  it('PATCH 404 when not found', async () => {
    authed();
    repoMocks.updateSpecSheet.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/spec-sheets/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/spec-sheets/s-1', 'PATCH', { title: 'New' }) as never,
      paramsFor({ id: 's-1' }) as never,
    );
    expect(res.status).toBe(404);
  });

  it('DELETE 200 happy path', async () => {
    authed();
    repoMocks.getSpecSheet.mockResolvedValue({ id: 's-1', projectId: 'p-1' });
    repoMocks.deleteSpecSheet.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/spec-sheets/[id]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/spec-sheets/s-1', 'DELETE') as never,
      paramsFor({ id: 's-1' }) as never,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.spec_sheet.deleted' }),
    );
  });

  it('DELETE 404 when not owned', async () => {
    authed();
    repoMocks.getSpecSheet.mockResolvedValue(null);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/spec-sheets/[id]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/spec-sheets/s-1', 'DELETE') as never,
      paramsFor({ id: 's-1' }) as never,
    );
    expect(res.status).toBe(404);
  });
});

// ═════════ Nested wrappers — /catalog/[id]/spec-sheets ════════════════════

describe('GET / POST /catalog/[id]/spec-sheets', () => {
  it('GET 401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/spec-sheets/route'
    );
    const res = await GET(
      jsonReq('http://t/catalog/pa-1/spec-sheets', 'GET') as never,
      paramsFor({ id: 'pa-1' }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('GET 200 forwards partId to the repo', async () => {
    authed();
    repoMocks.listSpecSheets.mockResolvedValue([{ id: 's-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/spec-sheets/route'
    );
    const res = await GET(
      jsonReq('http://t/catalog/pa-1/spec-sheets', 'GET') as never,
      paramsFor({ id: 'pa-1' }) as never,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.listSpecSheets).toHaveBeenCalledWith({
      userId: 'u-1',
      partId: 'pa-1',
    });
  });

  it('POST 201 happy path locks partId from URL', async () => {
    authed();
    repoMocks.createSpecSheet.mockResolvedValue({
      id: 's-1',
      partId: 'pa-1',
      kind: 'datasheet',
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/catalog/[id]/spec-sheets/route'
    );
    const res = await POST(
      jsonReq('http://t/catalog/pa-1/spec-sheets', 'POST', {
        title: 'X',
        url: 'http://x',
      }) as never,
      paramsFor({ id: 'pa-1' }) as never,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.createSpecSheet).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ partId: 'pa-1' }),
    );
  });
});

// ═════════ Nested wrappers — /tools/[toolId]/spec-sheets ══════════════════

describe('GET / POST /tools/[toolId]/spec-sheets', () => {
  it('GET 200 forwards toolId to the repo', async () => {
    authed();
    repoMocks.listSpecSheets.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/spec-sheets/route'
    );
    const res = await GET(
      jsonReq('http://t/tools/t-1/spec-sheets', 'GET') as never,
      paramsFor({ toolId: 't-1' }) as never,
    );
    expect(res.status).toBe(200);
    expect(repoMocks.listSpecSheets).toHaveBeenCalledWith({
      userId: 'u-1',
      toolId: 't-1',
    });
  });

  it('POST 201 happy path locks toolId from URL', async () => {
    authed();
    repoMocks.createSpecSheet.mockResolvedValue({ id: 's-1', toolId: 't-1' });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/tools/[toolId]/spec-sheets/route'
    );
    const res = await POST(
      jsonReq('http://t/tools/t-1/spec-sheets', 'POST', {
        title: 'X',
        url: 'http://x',
      }) as never,
      paramsFor({ toolId: 't-1' }) as never,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.createSpecSheet).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ toolId: 't-1' }),
    );
  });
});

// ═════════ /references ════════════════════════════════════════════════════

describe('GET /references', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/references/route');
    const res = await GET(jsonReq('http://t/references', 'GET') as never);
    expect(res.status).toBe(401);
  });

  it('200 with references array', async () => {
    authed();
    repoMocks.listReferences.mockResolvedValue([{ id: 'r-1' }]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/references/route');
    const res = await GET(jsonReq('http://t/references', 'GET') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.references).toHaveLength(1);
  });

  it('forwards ?kind + ?tag', async () => {
    authed();
    repoMocks.listReferences.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/references/route');
    await GET(jsonReq('http://t/references?kind=paper&tag=ml', 'GET') as never);
    expect(repoMocks.listReferences).toHaveBeenCalledWith({
      userId: 'u-1',
      kind: 'paper',
      tag: 'ml',
    });
  });

  it('400 invalid kind', async () => {
    authed();
    const { GET } = await import('@/app/api/tiresias/agentic-os/maker/references/route');
    const res = await GET(jsonReq('http://t/references?kind=zine', 'GET') as never);
    expect(res.status).toBe(400);
  });
});

describe('POST /references', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/references/route');
    const res = await POST(
      jsonReq('http://t/references', 'POST', { title: 'X', url: 'http://x' }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('400 invalid body', async () => {
    authed();
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/references/route');
    const res = await POST(
      jsonReq('http://t/references', 'POST', { url: 'http://x' }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('201 happy path with audit', async () => {
    authed();
    repoMocks.createReference.mockResolvedValue({
      id: 'r-1',
      title: 'X',
      kind: 'paper',
    });
    const { POST } = await import('@/app/api/tiresias/agentic-os/maker/references/route');
    const res = await POST(
      jsonReq('http://t/references', 'POST', {
        title: 'X',
        url: 'https://example.com/x.pdf',
      }) as never,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maker.reference.created' }),
    );
  });
});

describe('GET / PATCH / DELETE /references/[id]', () => {
  it('GET 404 when not owned', async () => {
    authed();
    repoMocks.getReference.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/references/[id]/route'
    );
    const res = await GET(
      jsonReq('http://t/references/r-1', 'GET') as never,
      paramsFor({ id: 'r-1' }) as never,
    );
    expect(res.status).toBe(404);
  });

  it('GET 200 when owned', async () => {
    authed();
    repoMocks.getReference.mockResolvedValue({ id: 'r-1' });
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/references/[id]/route'
    );
    const res = await GET(
      jsonReq('http://t/references/r-1', 'GET') as never,
      paramsFor({ id: 'r-1' }) as never,
    );
    expect(res.status).toBe(200);
  });

  it('PATCH 200 happy path', async () => {
    authed();
    repoMocks.updateReference.mockResolvedValue({ id: 'r-1', title: 'New' });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/references/[id]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/references/r-1', 'PATCH', { title: 'New' }) as never,
      paramsFor({ id: 'r-1' }) as never,
    );
    expect(res.status).toBe(200);
  });

  it('DELETE 200 happy path', async () => {
    authed();
    repoMocks.deleteReference.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/references/[id]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/references/r-1', 'DELETE') as never,
      paramsFor({ id: 'r-1' }) as never,
    );
    expect(res.status).toBe(200);
  });

  it('DELETE 404 when missing', async () => {
    authed();
    repoMocks.deleteReference.mockResolvedValue(false);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/references/[id]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/references/r-1', 'DELETE') as never,
      paramsFor({ id: 'r-1' }) as never,
    );
    expect(res.status).toBe(404);
  });
});

// ═════════ /projects/[id]/references ══════════════════════════════════════

describe('GET / POST /projects/[id]/references', () => {
  it('GET 401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/references/route'
    );
    const res = await GET(
      jsonReq('http://t/projects/p-1/references', 'GET') as never,
      paramsFor({ id: 'p-1' }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('GET 200 with references array', async () => {
    authed();
    repoMocks.listReferencesForProject.mockResolvedValue([{ id: 'pr-1' }]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/references/route'
    );
    const res = await GET(
      jsonReq('http://t/projects/p-1/references', 'GET') as never,
      paramsFor({ id: 'p-1' }) as never,
    );
    expect(res.status).toBe(200);
  });

  it('GET 404 when project not owned', async () => {
    authed();
    repoMocks.listReferencesForProject.mockRejectedValue(
      new Error('Project not found or not owned by user'),
    );
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/references/route'
    );
    const res = await GET(
      jsonReq('http://t/projects/p-1/references', 'GET') as never,
      paramsFor({ id: 'p-1' }) as never,
    );
    expect(res.status).toBe(404);
  });

  it('POST 201 happy path with projectId audit', async () => {
    authed();
    repoMocks.attachReferenceToProject.mockResolvedValue({
      id: 'pr-1',
      projectId: 'p-1',
      referenceId: VALID_UUID,
    });
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/references/route'
    );
    const res = await POST(
      jsonReq('http://t/projects/p-1/references', 'POST', {
        reference_id: VALID_UUID,
      }) as never,
      paramsFor({ id: 'p-1' }) as never,
    );
    expect(res.status).toBe(201);
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'maker.project.reference.linked',
        projectId: 'p-1',
      }),
    );
  });

  it('POST 409 duplicate link', async () => {
    authed();
    repoMocks.attachReferenceToProject.mockRejectedValue(
      new Error(
        'duplicate key value violates unique constraint "agos_maker_project_references_project_reference_unique"',
      ),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/references/route'
    );
    const res = await POST(
      jsonReq('http://t/projects/p-1/references', 'POST', {
        reference_id: VALID_UUID,
      }) as never,
      paramsFor({ id: 'p-1' }) as never,
    );
    expect(res.status).toBe(409);
  });

  it('POST 404 when reference not owned', async () => {
    authed();
    repoMocks.attachReferenceToProject.mockRejectedValue(
      new Error('Reference not found or not owned by user'),
    );
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/references/route'
    );
    const res = await POST(
      jsonReq('http://t/projects/p-1/references', 'POST', {
        reference_id: VALID_UUID,
      }) as never,
      paramsFor({ id: 'p-1' }) as never,
    );
    expect(res.status).toBe(404);
  });

  it('POST 400 invalid body', async () => {
    authed();
    const { POST } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/references/route'
    );
    const res = await POST(
      jsonReq('http://t/projects/p-1/references', 'POST', {}) as never,
      paramsFor({ id: 'p-1' }) as never,
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH / DELETE /projects/[id]/references/[refId]', () => {
  it('PATCH 200 happy path', async () => {
    authed();
    repoMocks.updateProjectReferenceLink.mockResolvedValue({
      id: 'pr-1',
      projectId: 'p-1',
      referenceId: 'r-1',
      notes: 'note',
    });
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/references/[refId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { notes: 'note' }) as never,
      paramsFor({ id: 'p-1', refId: 'r-1' }) as never,
    );
    expect(res.status).toBe(200);
  });

  it('PATCH 404 when missing', async () => {
    authed();
    repoMocks.updateProjectReferenceLink.mockResolvedValue(null);
    const { PATCH } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/references/[refId]/route'
    );
    const res = await PATCH(
      jsonReq('http://t/x', 'PATCH', { notes: 'note' }) as never,
      paramsFor({ id: 'p-1', refId: 'r-1' }) as never,
    );
    expect(res.status).toBe(404);
  });

  it('DELETE 200 happy path', async () => {
    authed();
    repoMocks.detachReferenceFromProject.mockResolvedValue(true);
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/references/[refId]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/x', 'DELETE') as never,
      paramsFor({ id: 'p-1', refId: 'r-1' }) as never,
    );
    expect(res.status).toBe(200);
  });

  it('DELETE 404 when reference not owned', async () => {
    authed();
    repoMocks.detachReferenceFromProject.mockRejectedValue(
      new Error('Reference not found or not owned by user'),
    );
    const { DELETE } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/references/[refId]/route'
    );
    const res = await DELETE(
      jsonReq('http://t/x', 'DELETE') as never,
      paramsFor({ id: 'p-1', refId: 'r-1' }) as never,
    );
    expect(res.status).toBe(404);
  });
});

// ═════════ /projects/[id]/export.pdf ══════════════════════════════════════

describe('GET /projects/[id]/export.pdf', () => {
  it('401 unauthenticated', async () => {
    getCurrentMakerUser.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/export.pdf/route'
    );
    const res = await GET(
      jsonReq('http://t/x', 'GET') as never,
      paramsFor({ id: 'p-1' }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('404 when project not owned', async () => {
    authed();
    repoMocks.getProject.mockResolvedValue(null);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/export.pdf/route'
    );
    const res = await GET(
      jsonReq('http://t/x', 'GET') as never,
      paramsFor({ id: 'p-1' }) as never,
    );
    expect(res.status).toBe(404);
  });

  it('400 when project has nothing to export', async () => {
    authed();
    repoMocks.getProject.mockResolvedValue({
      id: 'p-1',
      name: 'Empty',
      status: 'concept',
      tags: [],
      phaseProgress: {},
      teamSize: null,
      targetCompletionDate: null,
    });
    repoMocks.getBomSummary.mockResolvedValue({ linesCount: 0 });
    repoMocks.listBuildSteps.mockResolvedValue([]);
    repoMocks.listMilestones.mockResolvedValue([]);
    repoMocks.listToolsForProject.mockResolvedValue([]);
    repoMocks.listReferencesForProject.mockResolvedValue([]);
    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/export.pdf/route'
    );
    const res = await GET(
      jsonReq('http://t/x', 'GET') as never,
      paramsFor({ id: 'p-1' }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('200 application/pdf when project has data', async () => {
    authed();
    repoMocks.getProject.mockResolvedValue({
      id: 'p-1',
      name: 'CNC v2',
      status: 'concept',
      tags: [],
      phaseProgress: {},
      teamSize: null,
      targetCompletionDate: null,
    });
    repoMocks.getBomSummary.mockResolvedValue({
      projectId: 'p-1',
      rows: [],
      totalEstCostCents: 0,
      currency: 'USD',
      totalDeficit: 0,
      linesCount: 1,
      criticalDeficitLines: 0,
    });
    repoMocks.listBuildSteps.mockResolvedValue([]);
    repoMocks.listMilestones.mockResolvedValue([]);
    repoMocks.listToolsForProject.mockResolvedValue([]);
    repoMocks.listReferencesForProject.mockResolvedValue([]);

    const { GET } = await import(
      '@/app/api/tiresias/agentic-os/maker/projects/[id]/export.pdf/route'
    );
    const res = await GET(
      jsonReq('http://t/x', 'GET') as never,
      paramsFor({ id: 'p-1' }) as never,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(
      /attachment; filename="cnc-v2-\d{4}-\d{2}-\d{2}\.pdf"/,
    );
    expect(repoMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'maker.project.export_pdf',
        projectId: 'p-1',
      }),
    );
  });
});
