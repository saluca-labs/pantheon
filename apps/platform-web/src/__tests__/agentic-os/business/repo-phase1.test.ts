/**
 * Business OS Phase 1 — repo behavior tests (mocked pg pool).
 *
 * Exercises the four repos via a single shared `pool.query` mock that
 * dispatches by SQL fragment.  Verifies the user_id scoping contract,
 * archive lifecycle, lazy-create on settings, and the audit-writer
 * migration plumbing.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Single mock pool the session module returns to every repo.
const query = vi.fn();
const pool = { query };

vi.mock('@/lib/agentic-os/business/session', () => ({
  getBusinessPool: () => pool,
  getCurrentBusinessUser: vi.fn(),
}));

// Spy the shared audit so we can assert the migration plumbing.
const sharedRecordAudit = vi.fn();
vi.mock('@/lib/agentic-os/_shared/audit', () => ({
  recordAudit: (args: any) => sharedRecordAudit(args),
}));

beforeEach(() => {
  query.mockReset();
  sharedRecordAudit.mockReset();
  sharedRecordAudit.mockResolvedValue(undefined);
});

const NOW = new Date('2026-05-12T10:00:00.000Z');

function mockSelectOrgs(rows: any[]) {
  query.mockResolvedValueOnce({ rows, rowCount: rows.length });
}

// ─── recordAudit shim plumbing ──────────────────────────────────────────

describe('recordAudit shim (business/repo.ts)', () => {
  it('delegates to _shared/audit with osSlug locked to business', async () => {
    const { recordAudit } = await import('@/lib/agentic-os/business/repo');
    await recordAudit({ actorId: 'u-1', action: 'business.org.created', payload: { x: 1 } });
    expect(sharedRecordAudit).toHaveBeenCalledTimes(1);
    expect(sharedRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        osSlug: 'business',
        actorId: 'u-1',
        action: 'business.org.created',
      }),
    );
  });

  it('passes payload through verbatim', async () => {
    const { recordAudit } = await import('@/lib/agentic-os/business/repo');
    await recordAudit({
      actorId: 'u-1',
      action: 'business.person.updated',
      payload: { personId: 'p-1', fields: ['email'] },
    });
    expect(sharedRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { personId: 'p-1', fields: ['email'] },
      }),
    );
  });

  it('forwards projectId when present', async () => {
    const { recordAudit } = await import('@/lib/agentic-os/business/repo');
    await recordAudit({
      actorId: 'u-1',
      action: 'business.org.created',
      projectId: 'proj-1',
    });
    expect(sharedRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj-1' }),
    );
  });

  it('defaults projectId to null', async () => {
    const { recordAudit } = await import('@/lib/agentic-os/business/repo');
    await recordAudit({ actorId: 'u-1', action: 'business.person.created' });
    expect(sharedRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: null }),
    );
  });
});

// ─── orgs-repo ──────────────────────────────────────────────────────────

describe('listOrganizations', () => {
  it('scopes by user_id and excludes archived by default', async () => {
    mockSelectOrgs([]);
    const { listOrganizations } = await import('@/lib/agentic-os/business/orgs-repo');
    await listOrganizations('u-1');
    const [, params] = query.mock.calls[0]!;
    const sql = query.mock.calls[0]![0] as string;
    expect(params[0]).toBe('u-1');
    expect(sql).toContain('user_id = $1');
    expect(sql).toContain('archived_at IS NULL');
  });

  it('includes archived when archived=true', async () => {
    mockSelectOrgs([]);
    const { listOrganizations } = await import('@/lib/agentic-os/business/orgs-repo');
    await listOrganizations('u-1', { archived: true });
    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toContain('archived_at IS NOT NULL');
  });

  it('throws on invalid orgType filter', async () => {
    const { listOrganizations } = await import('@/lib/agentic-os/business/orgs-repo');
    await expect(
      listOrganizations('u-1', { orgType: 'startup' as any }),
    ).rejects.toThrow(/Invalid org_type filter/);
  });

  it('hydrates rows with archivedAt + descriptionMd + tags', async () => {
    const now = new Date('2026-05-12T10:00:00Z');
    mockSelectOrgs([
      {
        id: 'o-1',
        user_id: 'u-1',
        name: 'Acme',
        org_type: 'company',
        website: null,
        industry: null,
        notes: null,
        description_md: '## about',
        address: null,
        tags: ['enterprise'],
        metadata: {},
        archived_at: null,
        created_at: now,
        updated_at: now,
      },
    ]);
    const { listOrganizations } = await import('@/lib/agentic-os/business/orgs-repo');
    const r = await listOrganizations('u-1');
    expect(r).toHaveLength(1);
    expect(r[0]?.descriptionMd).toBe('## about');
    expect(r[0]?.tags).toEqual(['enterprise']);
    expect(r[0]?.archivedAt).toBeNull();
  });
});

describe('createOrganization', () => {
  it('normalizes tags before insert', async () => {
    const now = new Date();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // INSERT
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 'o-1', user_id: 'u-1', name: 'Acme',
        org_type: 'company', website: null, industry: null, notes: null,
        description_md: '', address: null,
        tags: ['enterprise', 'usa'], metadata: {},
        archived_at: null, created_at: now, updated_at: now,
      }],
    }); // SELECT after insert
    const { createOrganization } = await import('@/lib/agentic-os/business/orgs-repo');
    await createOrganization('u-1', {
      name: 'Acme',
      tags: [' Enterprise', 'USA', 'enterprise'],
    });
    const params = query.mock.calls[0]![1] as any[];
    // Tags param (index 9) should be normalized + deduped.
    expect(params[9]).toEqual(['enterprise', 'usa']);
  });

  it('throws on invalid orgType', async () => {
    const { createOrganization } = await import('@/lib/agentic-os/business/orgs-repo');
    await expect(
      createOrganization('u-1', { name: 'X', orgType: 'startup' as any }),
    ).rejects.toThrow(/Invalid org_type/);
  });
});

describe('archiveOrganization / restoreOrganization', () => {
  it('archive returns null when org is not owned by user', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // UPDATE no-op
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // SELECT after
    const { archiveOrganization } = await import('@/lib/agentic-os/business/orgs-repo');
    const r = await archiveOrganization('o-x', 'u-1');
    expect(r).toBeNull();
  });

  it('restore returns null when org not owned', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // initial getOrganization
    const { restoreOrganization } = await import('@/lib/agentic-os/business/orgs-repo');
    const r = await restoreOrganization('o-x', 'u-1');
    expect(r).toBeNull();
  });

  it('restore returns alreadyActive=true on a non-archived org', async () => {
    const now = new Date();
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 'o-1', user_id: 'u-1', name: 'Acme', org_type: 'company',
        website: null, industry: null, notes: null,
        description_md: '', address: null,
        tags: [], metadata: {},
        archived_at: null, created_at: now, updated_at: now,
      }],
    });
    const { restoreOrganization } = await import('@/lib/agentic-os/business/orgs-repo');
    const r = await restoreOrganization('o-1', 'u-1');
    expect(r?.alreadyActive).toBe(true);
  });
});

// ─── people-repo ────────────────────────────────────────────────────────

describe('listPeople', () => {
  it('scopes by user_id and excludes archived by default', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const { listPeople } = await import('@/lib/agentic-os/business/people-repo');
    await listPeople('u-1');
    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toContain('user_id = $1');
    expect(sql).toContain('archived_at IS NULL');
  });

  it('filters by organizationId when scope is set', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const { listPeople } = await import('@/lib/agentic-os/business/people-repo');
    await listPeople('u-1', { organizationId: 'org-1' });
    const params = query.mock.calls[0]![1] as any[];
    expect(params).toContain('org-1');
  });

  it('hydrates stage as a string (free-form)', async () => {
    const now = new Date();
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 'p-1', user_id: 'u-1',
        first_name: 'J', last_name: 'S',
        email: null, phone: null, role: null, organization_id: null,
        stage: 'VIP',
        tags: ['warm'], notes: null,
        description_md: '', address: null,
        metadata: {},
        archived_at: null, created_at: now, updated_at: now,
      }],
    });
    const { listPeople } = await import('@/lib/agentic-os/business/people-repo');
    const r = await listPeople('u-1');
    expect(r[0]?.stage).toBe('VIP');
  });
});

describe('countActivePeople / countActiveOrganizations', () => {
  it('countActivePeople returns the integer from COUNT(*)', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ n: 7 }] });
    const { countActivePeople } = await import('@/lib/agentic-os/business/people-repo');
    expect(await countActivePeople('u-1')).toBe(7);
  });

  it('countActiveOrganizations returns 0 on empty', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ n: 0 }] });
    const { countActiveOrganizations } = await import('@/lib/agentic-os/business/people-repo');
    expect(await countActiveOrganizations('u-1')).toBe(0);
  });
});

// ─── interactions-repo ──────────────────────────────────────────────────

describe('listInteractions', () => {
  it('orders by occurred_at DESC', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const { listInteractions } = await import('@/lib/agentic-os/business/interactions-repo');
    await listInteractions('u-1');
    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toMatch(/ORDER BY occurred_at DESC/);
  });

  it('filters by from/to window', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const { listInteractions } = await import('@/lib/agentic-os/business/interactions-repo');
    await listInteractions('u-1', { from: '2026-05-01', to: '2026-05-31' });
    const params = query.mock.calls[0]![1] as any[];
    expect(params).toContain('2026-05-01');
    expect(params).toContain('2026-05-31');
  });

  it('throws on invalid interactionType filter', async () => {
    const { listInteractions } = await import('@/lib/agentic-os/business/interactions-repo');
    await expect(
      listInteractions('u-1', { interactionType: 'phonecall' as any }),
    ).rejects.toThrow(/Invalid interaction_type filter/);
  });
});

describe('createInteraction', () => {
  it('rejects invalid interactionType', async () => {
    const { createInteraction } = await import('@/lib/agentic-os/business/interactions-repo');
    await expect(
      createInteraction('u-1', { interactionType: 'phonecall' as any, summary: 'x' }),
    ).rejects.toThrow(/Invalid interaction_type/);
  });
});

describe('deleteInteraction', () => {
  it('returns true on rowCount > 0', async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });
    const { deleteInteraction } = await import('@/lib/agentic-os/business/interactions-repo');
    expect(await deleteInteraction('i-1', 'u-1')).toBe(true);
  });
  it('returns false on rowCount 0 (cross-tenant)', async () => {
    query.mockResolvedValueOnce({ rowCount: 0 });
    const { deleteInteraction } = await import('@/lib/agentic-os/business/interactions-repo');
    expect(await deleteInteraction('i-1', 'u-1')).toBe(false);
  });
});

// ─── settings-repo (lazy create) ────────────────────────────────────────

describe('getOrCreateSettings', () => {
  it('returns existing row when present (no INSERT)', async () => {
    const now = new Date();
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 's-1', user_id: 'u-1',
        business_name: 'Acme', logo_url: null, address: '',
        tax_id: null, default_currency: 'USD',
        invoice_number_prefix: 'INV', quote_number_prefix: 'Q',
        default_payment_terms: 'net_30',
        default_hourly_rate_cents: null, accent_color: 'teal',
        metadata: {}, created_at: now, updated_at: now,
      }],
    });
    const { getOrCreateSettings } = await import('@/lib/agentic-os/business/settings-repo');
    const r = await getOrCreateSettings('u-1');
    expect(r.created).toBe(false);
    expect(r.settings.businessName).toBe('Acme');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('inserts a defaults row on miss', async () => {
    const now = new Date();
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // initial GET miss
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // INSERT
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 's-1', user_id: 'u-1',
        business_name: '', logo_url: null, address: '',
        tax_id: null, default_currency: 'USD',
        invoice_number_prefix: 'INV', quote_number_prefix: 'Q',
        default_payment_terms: 'net_30',
        default_hourly_rate_cents: null, accent_color: 'teal',
        metadata: {}, created_at: now, updated_at: now,
      }],
    }); // SELECT after INSERT
    const { getOrCreateSettings } = await import('@/lib/agentic-os/business/settings-repo');
    const r = await getOrCreateSettings('u-1');
    expect(r.created).toBe(true);
    expect(r.settings.defaultCurrency).toBe('USD');
  });

  it('survives a concurrent-create race (23505 → re-read)', async () => {
    const now = new Date();
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // initial GET miss
    // INSERT throws 23505 (race winner already created the row).
    const dupErr: any = new Error('duplicate key');
    dupErr.code = '23505';
    query.mockRejectedValueOnce(dupErr);
    // Final re-read returns the winning row.
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 's-other', user_id: 'u-1',
        business_name: '', logo_url: null, address: '',
        tax_id: null, default_currency: 'USD',
        invoice_number_prefix: 'INV', quote_number_prefix: 'Q',
        default_payment_terms: 'net_30',
        default_hourly_rate_cents: null, accent_color: 'teal',
        metadata: {}, created_at: now, updated_at: now,
      }],
    });
    const { getOrCreateSettings } = await import('@/lib/agentic-os/business/settings-repo');
    const r = await getOrCreateSettings('u-1');
    expect(r.created).toBe(false);
    expect(r.settings.id).toBe('s-other');
  });

  it('re-throws non-23505 INSERT errors', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    query.mockRejectedValueOnce(new Error('out of disk'));
    const { getOrCreateSettings } = await import('@/lib/agentic-os/business/settings-repo');
    await expect(getOrCreateSettings('u-1')).rejects.toThrow(/disk/);
  });
});

describe('updateSettings', () => {
  it('lazy-creates if no row exists, then PATCHes', async () => {
    const now = new Date();
    // getOrCreateSettings: miss → insert → re-read
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 's-1', user_id: 'u-1',
        business_name: '', logo_url: null, address: '',
        tax_id: null, default_currency: 'USD',
        invoice_number_prefix: 'INV', quote_number_prefix: 'Q',
        default_payment_terms: 'net_30',
        default_hourly_rate_cents: null, accent_color: 'teal',
        metadata: {}, created_at: now, updated_at: now,
      }],
    });
    // UPDATE
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    // SELECT after update
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 's-1', user_id: 'u-1',
        business_name: 'Acme', logo_url: null, address: '',
        tax_id: null, default_currency: 'EUR',
        invoice_number_prefix: 'INV', quote_number_prefix: 'Q',
        default_payment_terms: 'net_30',
        default_hourly_rate_cents: null, accent_color: 'teal',
        metadata: {}, created_at: now, updated_at: now,
      }],
    });
    const { updateSettings } = await import('@/lib/agentic-os/business/settings-repo');
    const r = await updateSettings('u-1', { businessName: 'Acme', defaultCurrency: 'EUR' });
    expect(r?.businessName).toBe('Acme');
    expect(r?.defaultCurrency).toBe('EUR');
  });
});
