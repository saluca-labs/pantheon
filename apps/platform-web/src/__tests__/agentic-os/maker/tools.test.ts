/**
 * Maker OS — unit tests for tools.ts (Phase 4 pure helpers).
 *
 * Covers:
 *   - TOOL_KIND_VALUES / TOOL_STATUS_VALUES locked enums.
 *   - sortTools + summarizeTools.
 *   - Validators reject invalid input and accept good values.
 *
 * @license MIT — Tiresias Maker OS Phase 4 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  TOOL_KIND_VALUES,
  TOOL_KIND_LABELS,
  TOOL_STATUS_VALUES,
  TOOL_STATUS_LABELS,
  TOOL_KINDS,
  sortTools,
  summarizeTools,
  validateToolKind,
  validateToolStatus,
  validateToolName,
  validatePurchasedAt,
  type Tool,
} from '@/lib/agentic-os/maker/tools';

function makeTool(over: Partial<Tool> = {}): Tool {
  return {
    id: 't-1',
    userId: 'u-1',
    name: 'Drill',
    kind: 'powertool',
    manufacturer: null,
    model: null,
    serial: null,
    location: null,
    status: 'active',
    purchasedAt: null,
    imageUrl: null,
    datasheetUrl: null,
    manualUrl: null,
    notes: null,
    tags: [],
    metadata: {},
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('TOOL_KIND_VALUES + LABELS', () => {
  it('contains the 9 locked kinds', () => {
    expect(TOOL_KIND_VALUES).toEqual([
      'cnc',
      '3d_printer',
      'laser',
      'soldering',
      'oscilloscope',
      'multimeter',
      'handtool',
      'powertool',
      'other',
    ]);
  });

  it('every kind has a label', () => {
    for (const v of TOOL_KIND_VALUES) {
      expect(TOOL_KIND_LABELS[v]).toBeTruthy();
    }
  });

  it('TOOL_KINDS array carries icon for each value', () => {
    for (const info of TOOL_KINDS) {
      expect(info.icon).toBeTruthy();
      expect(info.label).toBeTruthy();
    }
    expect(TOOL_KINDS.map((k) => k.value)).toEqual(TOOL_KIND_VALUES);
  });
});

describe('TOOL_STATUS_VALUES + LABELS', () => {
  it('contains the 3 locked statuses', () => {
    expect(TOOL_STATUS_VALUES).toEqual(['active', 'down', 'retired']);
  });

  it('every status has a label', () => {
    for (const v of TOOL_STATUS_VALUES) {
      expect(TOOL_STATUS_LABELS[v]).toBeTruthy();
    }
  });
});

describe('sortTools', () => {
  it('sorts active before down before retired', () => {
    const out = sortTools([
      makeTool({ id: 'r', name: 'Z-retired', status: 'retired' }),
      makeTool({ id: 'd', name: 'A-down', status: 'down' }),
      makeTool({ id: 'a', name: 'M-active', status: 'active' }),
    ]);
    expect(out.map((t) => t.id)).toEqual(['a', 'd', 'r']);
  });

  it('within the same status, sorts by name ASC', () => {
    const out = sortTools([
      makeTool({ id: 'b', name: 'Beta', status: 'active' }),
      makeTool({ id: 'a', name: 'Alpha', status: 'active' }),
    ]);
    expect(out.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('returns a new array (does not mutate)', () => {
    const input = [makeTool({ id: 'a' }), makeTool({ id: 'b' })];
    sortTools(input);
    expect(input.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('summarizeTools', () => {
  it('counts active/down/retired separately', () => {
    const stats = summarizeTools([
      makeTool({ id: '1', status: 'active' }),
      makeTool({ id: '2', status: 'active' }),
      makeTool({ id: '3', status: 'down' }),
      makeTool({ id: '4', status: 'retired' }),
    ]);
    expect(stats).toEqual({ total: 4, active: 2, down: 1, retired: 1 });
  });

  it('handles empty list with zeroes', () => {
    expect(summarizeTools([])).toEqual({
      total: 0,
      active: 0,
      down: 0,
      retired: 0,
    });
  });
});

describe('validateToolKind', () => {
  it('accepts every locked value', () => {
    for (const v of TOOL_KIND_VALUES) {
      expect(validateToolKind(v)).toBeNull();
    }
  });

  it('rejects unknown values', () => {
    expect(validateToolKind('drone')).toMatch(/one of/);
    expect(validateToolKind(42 as any)).toMatch(/one of/);
    expect(validateToolKind(null)).toMatch(/one of/);
  });
});

describe('validateToolStatus', () => {
  it('accepts every locked value', () => {
    for (const v of TOOL_STATUS_VALUES) {
      expect(validateToolStatus(v)).toBeNull();
    }
  });

  it('rejects unknown values', () => {
    expect(validateToolStatus('broken')).toMatch(/one of/);
  });
});

describe('validateToolName', () => {
  it('accepts a normal name', () => {
    expect(validateToolName('Shapeoko 5 Pro')).toBeNull();
  });

  it('rejects empty / whitespace-only', () => {
    expect(validateToolName('')).toMatch(/required/);
    expect(validateToolName('   ')).toMatch(/required/);
  });

  it('rejects > 200 characters', () => {
    expect(validateToolName('x'.repeat(201))).toMatch(/200 characters/);
  });

  it('rejects non-string input', () => {
    expect(validateToolName(42 as any)).toMatch(/string/);
  });
});

describe('validatePurchasedAt', () => {
  it('accepts null', () => {
    expect(validatePurchasedAt(null)).toBeNull();
  });

  it('accepts a real YYYY-MM-DD', () => {
    expect(validatePurchasedAt('2026-05-11')).toBeNull();
  });

  it('rejects non-YYYY-MM-DD strings', () => {
    expect(validatePurchasedAt('05/11/2026')).toMatch(/YYYY-MM-DD/);
    expect(validatePurchasedAt('2026-5-11')).toMatch(/YYYY-MM-DD/);
  });

  it('rejects non-string non-null input', () => {
    expect(validatePurchasedAt(42 as any)).toMatch(/string/);
  });
});
