/**
 * Maker OS — unit tests for maintenance.ts (Phase 4 pure helpers).
 *
 * Covers:
 *   - MAINTENANCE_EVENT_KIND_VALUES locked enum.
 *   - daysUntilNextDue arithmetic + null guards.
 *   - sortMaintenanceEvents (newest first).
 *   - summarizeMaintenance aggregation.
 *   - formatCost rendering.
 *   - validators.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  MAINTENANCE_EVENT_KIND_VALUES,
  MAINTENANCE_EVENT_KIND_LABELS,
  daysUntilNextDue,
  formatCost,
  sortMaintenanceEvents,
  summarizeMaintenance,
  validateCostCents,
  validateMaintenanceEventKind,
  type MaintenanceEvent,
} from '@/lib/agentic-os/maker/maintenance';

function makeEvent(over: Partial<MaintenanceEvent> = {}): MaintenanceEvent {
  return {
    id: 'm-1',
    toolId: 't-1',
    eventKind: 'cleaned',
    performedAt: '2026-05-01T00:00:00.000Z',
    costCents: null,
    currency: 'USD',
    vendor: null,
    notes: null,
    nextDueAt: null,
    metadata: {},
    createdAt: '',
    ...over,
  };
}

describe('MAINTENANCE_EVENT_KIND_VALUES + LABELS', () => {
  it('contains the 5 locked event kinds', () => {
    expect(MAINTENANCE_EVENT_KIND_VALUES).toEqual([
      'cleaned',
      'serviced',
      'calibrated',
      'repaired',
      'inspected',
    ]);
  });

  it('every value has a label', () => {
    for (const v of MAINTENANCE_EVENT_KIND_VALUES) {
      expect(MAINTENANCE_EVENT_KIND_LABELS[v]).toBeTruthy();
    }
  });
});

describe('daysUntilNextDue', () => {
  const today = new Date('2026-05-11T00:00:00Z');

  it('returns null when nextDueAt is missing', () => {
    expect(daysUntilNextDue({ nextDueAt: null }, today)).toBeNull();
  });

  it('returns null when nextDueAt is unparseable', () => {
    expect(daysUntilNextDue({ nextDueAt: 'not-a-date' }, today)).toBeNull();
  });

  it('returns positive integer for future dates', () => {
    expect(
      daysUntilNextDue({ nextDueAt: '2026-05-18T00:00:00Z' }, today),
    ).toBe(7);
  });

  it('returns 0 when due today', () => {
    expect(
      daysUntilNextDue({ nextDueAt: '2026-05-11T00:00:00Z' }, today),
    ).toBe(0);
  });

  it('returns negative integer for overdue dates', () => {
    expect(
      daysUntilNextDue({ nextDueAt: '2026-05-01T00:00:00Z' }, today),
    ).toBe(-10);
  });
});

describe('sortMaintenanceEvents', () => {
  it('orders newest first', () => {
    const out = sortMaintenanceEvents([
      makeEvent({ id: 'old', performedAt: '2026-01-01T00:00:00Z' }),
      makeEvent({ id: 'new', performedAt: '2026-05-01T00:00:00Z' }),
      makeEvent({ id: 'mid', performedAt: '2026-03-01T00:00:00Z' }),
    ]);
    expect(out.map((e) => e.id)).toEqual(['new', 'mid', 'old']);
  });

  it('returns a new array (does not mutate)', () => {
    const input = [makeEvent({ id: 'a' }), makeEvent({ id: 'b' })];
    sortMaintenanceEvents(input);
    expect(input.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('summarizeMaintenance', () => {
  it('empty list zeroes out', () => {
    expect(summarizeMaintenance([])).toEqual({
      total: 0,
      totalCostCents: 0,
      currency: 'USD',
      lastPerformedAt: null,
      nextDueAt: null,
    });
  });

  it('sums cost across events', () => {
    const stats = summarizeMaintenance([
      makeEvent({ costCents: 1500 }),
      makeEvent({ costCents: 2500 }),
      makeEvent({ costCents: null }),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.totalCostCents).toBe(4000);
  });

  it('tracks most recent performedAt', () => {
    const stats = summarizeMaintenance([
      makeEvent({ id: '1', performedAt: '2026-01-01T00:00:00Z' }),
      makeEvent({ id: '2', performedAt: '2026-05-01T00:00:00Z' }),
    ]);
    expect(stats.lastPerformedAt).toBe('2026-05-01T00:00:00Z');
  });

  it('tracks soonest nextDueAt', () => {
    const stats = summarizeMaintenance([
      makeEvent({ id: '1', nextDueAt: '2026-12-01T00:00:00Z' }),
      makeEvent({ id: '2', nextDueAt: '2026-08-01T00:00:00Z' }),
      makeEvent({ id: '3', nextDueAt: null }),
    ]);
    expect(stats.nextDueAt).toBe('2026-08-01T00:00:00Z');
  });
});

describe('formatCost', () => {
  it('renders em-dash for null', () => {
    expect(formatCost(null)).toBe('—');
  });

  it('renders cents as fixed 2-decimal value', () => {
    expect(formatCost(1500)).toBe('USD 15.00');
    expect(formatCost(99)).toBe('USD 0.99');
    expect(formatCost(0)).toBe('USD 0.00');
  });

  it('respects currency argument', () => {
    expect(formatCost(1000, 'EUR')).toBe('EUR 10.00');
  });
});

describe('validateMaintenanceEventKind', () => {
  it('accepts every locked value', () => {
    for (const v of MAINTENANCE_EVENT_KIND_VALUES) {
      expect(validateMaintenanceEventKind(v)).toBeNull();
    }
  });

  it('rejects unknown values', () => {
    expect(validateMaintenanceEventKind('upgraded')).toMatch(/one of/);
    expect(validateMaintenanceEventKind(42 as never)).toMatch(/one of/);
  });
});

describe('validateCostCents', () => {
  it('accepts null', () => {
    expect(validateCostCents(null)).toBeNull();
  });

  it('accepts non-negative integers', () => {
    expect(validateCostCents(0)).toBeNull();
    expect(validateCostCents(1500)).toBeNull();
  });

  it('rejects negative, decimals, NaN', () => {
    expect(validateCostCents(-1)).toMatch(/non-negative/);
    expect(validateCostCents(1.5)).toMatch(/integer/);
    expect(validateCostCents(Number.NaN)).toMatch(/number/);
  });

  it('rejects non-numeric input', () => {
    expect(validateCostCents('5' as never)).toMatch(/number/);
  });
});
