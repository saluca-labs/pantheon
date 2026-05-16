/**
 * Research OS Phase 2 — entry-kinds taxonomy tests.
 *
 * Locks the 6-kind enum, the label/color/icon maps, and the validators.
 *
 * @license MIT — Tiresias Research OS Phase 2 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  ENTRY_KINDS,
  ENTRY_KIND_LABELS,
  ENTRY_KIND_DESCRIPTIONS,
  ENTRY_KIND_COLOR,
  ENTRY_KIND_ICON,
  asEntryKind,
  entryKindLabel,
  validateEntryKindStrict,
} from '@/lib/agentic-os/research/entry-kinds';

describe('ENTRY_KINDS taxonomy', () => {
  it('contains exactly the 6 documented kinds', () => {
    expect(ENTRY_KINDS).toEqual([
      'note',
      'observation',
      'result',
      'decision',
      'question',
      'todo',
    ]);
  });

  it('has a label for every kind', () => {
    for (const k of ENTRY_KINDS) {
      expect(ENTRY_KIND_LABELS[k]).toBeTruthy();
    }
  });

  it('has a description for every kind', () => {
    for (const k of ENTRY_KINDS) {
      expect(ENTRY_KIND_DESCRIPTIONS[k].length).toBeGreaterThan(5);
    }
  });

  it('has a color token for every kind', () => {
    for (const k of ENTRY_KINDS) {
      expect(ENTRY_KIND_COLOR[k]).toMatch(/text-|bg-|border-/);
    }
  });

  it('non-note kinds source the W-E.5 per-kind tokens (text-kind-<slug> utility prefix)', () => {
    // `note` is the neutral baseline (no chroma); it intentionally reuses
    // the text-secondary + surface-2 + border-subtle tokens. Every other
    // kind should consume its dedicated `kind-<slug>` token family so the
    // palette stays documented in `tokens.md` §11.
    for (const k of ENTRY_KINDS) {
      if (k === 'note') continue;
      expect(ENTRY_KIND_COLOR[k]).toContain(`text-kind-${k}`);
      expect(ENTRY_KIND_COLOR[k]).toContain(`bg-kind-${k}/`);
      expect(ENTRY_KIND_COLOR[k]).toContain(`border-kind-${k}/`);
    }
    // `note` is the documented exception — its className uses neutral tokens.
    expect(ENTRY_KIND_COLOR.note).toContain('text-text-secondary');
  });

  it('has an icon name for every kind', () => {
    for (const k of ENTRY_KINDS) {
      expect(typeof ENTRY_KIND_ICON[k]).toBe('string');
      expect(ENTRY_KIND_ICON[k].length).toBeGreaterThan(0);
    }
  });

  it('uses distinct colors for "note" vs "todo" (taxonomy visibility check)', () => {
    expect(ENTRY_KIND_COLOR.note).not.toBe(ENTRY_KIND_COLOR.todo);
    expect(ENTRY_KIND_COLOR.observation).not.toBe(ENTRY_KIND_COLOR.result);
  });

  it('labels are unique across the 6 kinds', () => {
    const labels = ENTRY_KINDS.map((k) => ENTRY_KIND_LABELS[k]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('asEntryKind()', () => {
  it('accepts every valid kind', () => {
    for (const k of ENTRY_KINDS) {
      expect(asEntryKind(k)).toBe(k);
    }
  });

  it('rejects unknown strings', () => {
    expect(asEntryKind('idea')).toBeNull();
    expect(asEntryKind('NOTE')).toBeNull();
    expect(asEntryKind('note ')).toBeNull();
    expect(asEntryKind('')).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(asEntryKind(null)).toBeNull();
    expect(asEntryKind(undefined)).toBeNull();
    expect(asEntryKind(42)).toBeNull();
    expect(asEntryKind({})).toBeNull();
    expect(asEntryKind([])).toBeNull();
    expect(asEntryKind(true)).toBeNull();
  });
});

describe('entryKindLabel()', () => {
  it('returns the canonical label for valid kinds', () => {
    expect(entryKindLabel('note')).toBe('Note');
    expect(entryKindLabel('todo')).toBe('To-do');
    expect(entryKindLabel('decision')).toBe('Decision');
  });

  it('falls back to the raw string for unknown values', () => {
    expect(entryKindLabel('weird')).toBe('weird');
    expect(entryKindLabel('')).toBe('');
  });
});

describe('validateEntryKindStrict()', () => {
  it('returns the kind on valid input', () => {
    expect(validateEntryKindStrict('observation')).toBe('observation');
  });

  it('throws on invalid input with a helpful message', () => {
    expect(() => validateEntryKindStrict('idea')).toThrow(/Invalid notebook entry_kind/);
    expect(() => validateEntryKindStrict('idea')).toThrow(
      /note, observation, result, decision, question, todo/,
    );
  });

  it('throws on null/undefined/number', () => {
    expect(() => validateEntryKindStrict(null)).toThrow();
    expect(() => validateEntryKindStrict(undefined)).toThrow();
    expect(() => validateEntryKindStrict(42)).toThrow();
  });
});
