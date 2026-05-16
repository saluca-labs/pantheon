/**
 * Maker OS — unit tests for consumables.ts (Phase 4 pure helpers).
 *
 * Covers:
 *   - CONSUMABLE_KIND_VALUES locked enum.
 *   - percentRemaining math (null when missing, clamps to [0,1]).
 *   - consumableStatus pill derivation (exhausted/low/ok/unknown).
 *   - sortConsumables ordering.
 *   - formatHours integer vs decimal rendering.
 *   - validators.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  CONSUMABLE_KIND_VALUES,
  CONSUMABLE_KIND_LABELS,
  CONSUMABLE_STATUS_VALUES,
  consumableStatus,
  formatHours,
  percentRemaining,
  sortConsumables,
  validateConsumableName,
  validateHours,
  type ToolConsumable,
} from '@/lib/agentic-os/maker/consumables';

function makeC(over: Partial<ToolConsumable> = {}): ToolConsumable {
  return {
    id: 'c-1',
    toolId: 't-1',
    name: 'Bit',
    kind: null,
    hoursRemaining: null,
    maxHours: null,
    lastReplacedAt: null,
    notes: null,
    metadata: {},
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('CONSUMABLE_KIND_VALUES + LABELS', () => {
  it('contains the 6 locked picker defaults', () => {
    expect(CONSUMABLE_KIND_VALUES).toEqual([
      'bit',
      'blade',
      'filter',
      'nozzle',
      'endmill',
      'other',
    ]);
  });

  it('every value has a label', () => {
    for (const v of CONSUMABLE_KIND_VALUES) {
      expect(CONSUMABLE_KIND_LABELS[v]).toBeTruthy();
    }
  });
});

describe('CONSUMABLE_STATUS_VALUES', () => {
  it('contains the 4 derived statuses', () => {
    expect(CONSUMABLE_STATUS_VALUES).toEqual([
      'exhausted',
      'low',
      'ok',
      'unknown',
    ]);
  });
});

describe('percentRemaining', () => {
  it('returns null when either field is missing', () => {
    expect(percentRemaining({ hoursRemaining: null, maxHours: 10 })).toBeNull();
    expect(percentRemaining({ hoursRemaining: 5, maxHours: null })).toBeNull();
    expect(percentRemaining({ hoursRemaining: null, maxHours: null })).toBeNull();
  });

  it('returns 0 when maxHours is zero', () => {
    expect(percentRemaining({ hoursRemaining: 5, maxHours: 0 })).toBe(0);
  });

  it('computes the ratio when both present', () => {
    expect(percentRemaining({ hoursRemaining: 5, maxHours: 10 })).toBeCloseTo(0.5);
    expect(percentRemaining({ hoursRemaining: 0, maxHours: 10 })).toBe(0);
    expect(percentRemaining({ hoursRemaining: 10, maxHours: 10 })).toBe(1);
  });

  it('clamps below 0', () => {
    expect(percentRemaining({ hoursRemaining: -5, maxHours: 10 })).toBe(0);
  });

  it('clamps above 1 (manual bump beyond max)', () => {
    expect(percentRemaining({ hoursRemaining: 15, maxHours: 10 })).toBe(1);
  });

  it('returns null when inputs are non-finite', () => {
    expect(
      percentRemaining({ hoursRemaining: Number.NaN, maxHours: 10 }),
    ).toBeNull();
    expect(
      percentRemaining({ hoursRemaining: 5, maxHours: Number.POSITIVE_INFINITY }),
    ).toBeNull();
  });
});

describe('consumableStatus', () => {
  it('returns unknown when either field missing', () => {
    expect(consumableStatus({ hoursRemaining: null, maxHours: 10 })).toBe('unknown');
    expect(consumableStatus({ hoursRemaining: 5, maxHours: null })).toBe('unknown');
  });

  it('returns exhausted at 0 hours', () => {
    expect(consumableStatus({ hoursRemaining: 0, maxHours: 10 })).toBe('exhausted');
  });

  it('returns low when <= 20% remaining', () => {
    expect(consumableStatus({ hoursRemaining: 1, maxHours: 10 })).toBe('low');
    expect(consumableStatus({ hoursRemaining: 2, maxHours: 10 })).toBe('low');
  });

  it('returns ok when > 20% remaining', () => {
    expect(consumableStatus({ hoursRemaining: 3, maxHours: 10 })).toBe('ok');
    expect(consumableStatus({ hoursRemaining: 10, maxHours: 10 })).toBe('ok');
  });
});

describe('formatHours', () => {
  it('renders em-dash for null/invalid', () => {
    expect(formatHours(null)).toBe('—');
    expect(formatHours(Number.NaN)).toBe('—');
  });

  it('renders integer values without decimal', () => {
    expect(formatHours(5)).toBe('5');
    expect(formatHours(0)).toBe('0');
  });

  it('renders fractional values to 1 decimal', () => {
    expect(formatHours(5.5)).toBe('5.5');
    expect(formatHours(0.25)).toBe('0.3');
  });
});

describe('sortConsumables', () => {
  it('puts exhausted/low first, ok+unknown later', () => {
    const out = sortConsumables([
      makeC({ id: 'ok', name: 'A-ok', hoursRemaining: 10, maxHours: 10 }),
      makeC({ id: 'ex', name: 'X-exhausted', hoursRemaining: 0, maxHours: 10 }),
      makeC({ id: 'low', name: 'A-low', hoursRemaining: 1, maxHours: 10 }),
      makeC({ id: 'un', name: 'B-unknown' }),
    ]);
    expect(out.map((c) => c.id)).toEqual(['ex', 'low', 'ok', 'un']);
  });

  it('ties broken by name ASC', () => {
    const out = sortConsumables([
      makeC({ id: 'b', name: 'Beta', hoursRemaining: 5, maxHours: 10 }),
      makeC({ id: 'a', name: 'Alpha', hoursRemaining: 5, maxHours: 10 }),
    ]);
    expect(out.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('validateConsumableName', () => {
  it('accepts normal name', () => {
    expect(validateConsumableName('1/8 carbide bit')).toBeNull();
  });

  it('rejects empty / whitespace', () => {
    expect(validateConsumableName('')).toMatch(/required/);
    expect(validateConsumableName(' ')).toMatch(/required/);
  });

  it('rejects > 200 chars', () => {
    expect(validateConsumableName('x'.repeat(201))).toMatch(/200 characters/);
  });
});

describe('validateHours', () => {
  it('accepts null and non-negative numbers', () => {
    expect(validateHours(null)).toBeNull();
    expect(validateHours(0)).toBeNull();
    expect(validateHours(5.5)).toBeNull();
  });

  it('rejects negative numbers', () => {
    expect(validateHours(-1)).toMatch(/non-negative/);
  });

  it('rejects non-numeric input', () => {
    expect(validateHours('5' as never)).toMatch(/number/);
    expect(validateHours(Number.NaN)).toMatch(/number/);
  });
});
