/**
 * Maker OS — spec-sheet domain helpers tests.
 *
 * Pure functions in `lib/agentic-os/maker/spec-sheets.ts`. No DB / fetch.
 *
 * @license MIT — Tiresias Maker OS Phase 5 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  SPEC_SHEET_KIND_VALUES,
  SPEC_SHEET_ATTACHMENT_VALUES,
  SPEC_SHEET_KIND_LABELS,
  SPEC_SHEET_ATTACHMENT_LABELS,
  validateSpecSheetKind,
  validateSpecSheetTitle,
  validateSpecSheetUrl,
  validateIssuedAt,
  validateAttachmentExclusivity,
  groupSpecSheetsByAttachment,
  specSheetAttachment,
  type SpecSheet,
} from '@/lib/agentic-os/maker/spec-sheets';

function sheet(over: Partial<SpecSheet> = {}): SpecSheet {
  return {
    id: 's-1',
    userId: 'u-1',
    title: 'NEMA17 datasheet',
    kind: 'datasheet',
    url: 'https://example.com/datasheet.pdf',
    notes: null,
    revision: null,
    issuedAt: null,
    partId: null,
    toolId: null,
    projectId: null,
    tags: [],
    metadata: {},
    createdAt: '2026-05-11T00:00:00Z',
    updatedAt: '2026-05-11T00:00:00Z',
    ...over,
  };
}

describe('SPEC_SHEET_KIND_VALUES', () => {
  it('locks the 6 kinds in canonical order', () => {
    expect(SPEC_SHEET_KIND_VALUES).toEqual([
      'datasheet',
      'spec',
      'manual',
      'drawing',
      'certificate',
      'other',
    ]);
  });

  it('every kind has a human label', () => {
    for (const k of SPEC_SHEET_KIND_VALUES) {
      expect(typeof SPEC_SHEET_KIND_LABELS[k]).toBe('string');
      expect(SPEC_SHEET_KIND_LABELS[k].length).toBeGreaterThan(0);
    }
  });
});

describe('SPEC_SHEET_ATTACHMENT_VALUES', () => {
  it('locks the 3 attachment kinds', () => {
    expect(SPEC_SHEET_ATTACHMENT_VALUES).toEqual(['part', 'tool', 'project']);
  });

  it('every attachment kind has a human label', () => {
    for (const a of SPEC_SHEET_ATTACHMENT_VALUES) {
      expect(typeof SPEC_SHEET_ATTACHMENT_LABELS[a]).toBe('string');
    }
  });
});

describe('validateSpecSheetKind', () => {
  it('accepts the 6 locked values', () => {
    for (const k of SPEC_SHEET_KIND_VALUES) {
      expect(validateSpecSheetKind(k)).toBeNull();
    }
  });

  it('rejects an unknown kind', () => {
    expect(validateSpecSheetKind('schematic')).toMatch(/one of/);
  });

  it('rejects non-string', () => {
    expect(validateSpecSheetKind(7)).toMatch(/one of/);
    expect(validateSpecSheetKind(null)).toMatch(/one of/);
  });
});

describe('validateSpecSheetTitle', () => {
  it('accepts a normal title', () => {
    expect(validateSpecSheetTitle('NEMA17 datasheet')).toBeNull();
  });

  it('rejects empty', () => {
    expect(validateSpecSheetTitle('')).toMatch(/required/);
    expect(validateSpecSheetTitle('   ')).toMatch(/required/);
  });

  it('rejects oversize', () => {
    expect(validateSpecSheetTitle('x'.repeat(201))).toMatch(/200/);
  });

  it('rejects non-string', () => {
    expect(validateSpecSheetTitle(7)).toMatch(/string/);
  });
});

describe('validateSpecSheetUrl', () => {
  it('accepts a normal URL', () => {
    expect(validateSpecSheetUrl('https://x.com/y.pdf')).toBeNull();
  });

  it('rejects empty', () => {
    expect(validateSpecSheetUrl('')).toMatch(/required/);
  });

  it('rejects oversize', () => {
    expect(validateSpecSheetUrl('x'.repeat(2001))).toMatch(/2000/);
  });

  it('rejects non-string', () => {
    expect(validateSpecSheetUrl(7)).toMatch(/string/);
  });
});

describe('validateIssuedAt', () => {
  it('accepts null', () => {
    expect(validateIssuedAt(null)).toBeNull();
  });

  it('accepts YYYY-MM-DD', () => {
    expect(validateIssuedAt('2026-05-11')).toBeNull();
  });

  it('rejects malformed', () => {
    expect(validateIssuedAt('05/11/2026')).toMatch(/YYYY-MM-DD/);
    expect(validateIssuedAt('2026-5-11')).toMatch(/YYYY-MM-DD/);
  });

  it('rejects non-string', () => {
    expect(validateIssuedAt(7)).toMatch(/string/);
  });
});

describe('validateAttachmentExclusivity', () => {
  it('accepts exactly one attachment (part)', () => {
    expect(validateAttachmentExclusivity({ partId: 'p-1' })).toBeNull();
  });

  it('accepts exactly one attachment (tool)', () => {
    expect(validateAttachmentExclusivity({ toolId: 't-1' })).toBeNull();
  });

  it('accepts exactly one attachment (project)', () => {
    expect(validateAttachmentExclusivity({ projectId: 'pr-1' })).toBeNull();
  });

  it('rejects zero attachments', () => {
    expect(validateAttachmentExclusivity({})).toMatch(/required/);
  });

  it('rejects two attachments', () => {
    expect(
      validateAttachmentExclusivity({ partId: 'p-1', toolId: 't-1' }),
    ).toMatch(/not more/);
  });

  it('rejects three attachments', () => {
    expect(
      validateAttachmentExclusivity({
        partId: 'p-1',
        toolId: 't-1',
        projectId: 'pr-1',
      }),
    ).toMatch(/not more/);
  });

  it('treats null and undefined the same way', () => {
    expect(
      validateAttachmentExclusivity({
        partId: null,
        toolId: undefined,
        projectId: null,
      }),
    ).toMatch(/required/);
  });
});

describe('specSheetAttachment', () => {
  it('returns part for part-attached sheet', () => {
    expect(specSheetAttachment(sheet({ partId: 'p-1' }))).toBe('part');
  });

  it('returns tool for tool-attached sheet', () => {
    expect(specSheetAttachment(sheet({ toolId: 't-1' }))).toBe('tool');
  });

  it('returns project for project-attached sheet', () => {
    expect(specSheetAttachment(sheet({ projectId: 'pr-1' }))).toBe('project');
  });

  it('returns null when no attachment set', () => {
    expect(specSheetAttachment(sheet())).toBeNull();
  });
});

describe('groupSpecSheetsByAttachment', () => {
  it('partitions sheets by attachment kind', () => {
    const groups = groupSpecSheetsByAttachment([
      sheet({ id: 's-1', partId: 'p-1' }),
      sheet({ id: 's-2', toolId: 't-1' }),
      sheet({ id: 's-3', toolId: 't-2' }),
      sheet({ id: 's-4', projectId: 'pr-1' }),
    ]);
    expect(groups.part).toHaveLength(1);
    expect(groups.tool).toHaveLength(2);
    expect(groups.project).toHaveLength(1);
  });

  it('returns empty buckets for an empty list', () => {
    const groups = groupSpecSheetsByAttachment([]);
    expect(groups.part).toEqual([]);
    expect(groups.tool).toEqual([]);
    expect(groups.project).toEqual([]);
  });

  it('ignores sheets with no attachment set (shouldn’t exist post-CHECK)', () => {
    const groups = groupSpecSheetsByAttachment([sheet()]);
    expect(groups.part).toEqual([]);
    expect(groups.tool).toEqual([]);
    expect(groups.project).toEqual([]);
  });
});
