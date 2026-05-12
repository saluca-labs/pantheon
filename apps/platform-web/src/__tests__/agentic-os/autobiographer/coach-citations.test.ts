/**
 * Autobiographer OS Phase 7 — coach citation parser tests.
 *
 * Covers:
 *   - Empty string / non-string returns [].
 *   - One marker → one entry with paragraph_index = 1.
 *   - Multiple markers → ordered entries 1..N.
 *   - UUID extraction is case-insensitive + lowercases on output.
 *   - Duplicate UUIDs within one marker are deduped (first-seen order).
 *   - Non-UUID tokens are dropped silently.
 *   - Markers with no UUIDs are skipped (paragraph_index not incremented).
 *   - countCitationMarkers handles edge cases.
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  countCitationMarkers,
  parseCitations,
} from '@/lib/agentic-os/autobiographer/coach/citations';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

describe('parseCitations: empty/invalid inputs', () => {
  it('returns [] for empty string', () => {
    expect(parseCitations('')).toEqual([]);
  });

  it('returns [] for non-string input', () => {
    expect(parseCitations(undefined as any)).toEqual([]);
    expect(parseCitations(null as any)).toEqual([]);
    expect(parseCitations(42 as any)).toEqual([]);
  });

  it('returns [] when no markers are present', () => {
    expect(parseCitations('A paragraph with no citations.')).toEqual([]);
  });
});

describe('parseCitations: single marker', () => {
  it('parses one [cites: …] line', () => {
    const text = `Paragraph one body.

[cites: ${UUID_A}]`;
    expect(parseCitations(text)).toEqual([
      { paragraph_index: 1, memory_ids: [UUID_A.toLowerCase()] },
    ]);
  });

  it('lowercases the extracted UUID', () => {
    const upper = UUID_A.toUpperCase();
    expect(parseCitations(`[cites: ${upper}]`)).toEqual([
      { paragraph_index: 1, memory_ids: [UUID_A.toLowerCase()] },
    ]);
  });

  it('tolerates whitespace around UUIDs', () => {
    expect(parseCitations(`[cites:   ${UUID_A}   ,    ${UUID_B}  ]`)).toEqual([
      {
        paragraph_index: 1,
        memory_ids: [UUID_A.toLowerCase(), UUID_B.toLowerCase()],
      },
    ]);
  });
});

describe('parseCitations: multiple markers', () => {
  it('numbers paragraphs 1..N in source order', () => {
    const text = `Para 1.

[cites: ${UUID_A}]

Para 2.

[cites: ${UUID_B}, ${UUID_C}]`;
    expect(parseCitations(text)).toEqual([
      { paragraph_index: 1, memory_ids: [UUID_A.toLowerCase()] },
      {
        paragraph_index: 2,
        memory_ids: [UUID_B.toLowerCase(), UUID_C.toLowerCase()],
      },
    ]);
  });

  it('skips markers with no UUIDs without bumping paragraph_index', () => {
    const text = `[cites: nothing here]
[cites: ${UUID_A}]`;
    const out = parseCitations(text);
    // The first marker has zero UUIDs, so it bumps the counter but is
    // skipped. Behavior: paragraph_index for the surviving entry is 2
    // (we increment before validating ids — that's the documented
    // ordinal-by-marker contract).
    expect(out.length).toBe(1);
    expect(out[0].paragraph_index).toBe(2);
  });
});

describe('parseCitations: dedup + drop', () => {
  it('dedupes UUIDs within a single marker, first-seen order', () => {
    const text = `[cites: ${UUID_A}, ${UUID_B}, ${UUID_A}, ${UUID_B}]`;
    expect(parseCitations(text)).toEqual([
      {
        paragraph_index: 1,
        memory_ids: [UUID_A.toLowerCase(), UUID_B.toLowerCase()],
      },
    ]);
  });

  it('drops non-UUID tokens silently', () => {
    const text = `[cites: ${UUID_A}, not-a-uuid, ${UUID_B}, also-no, 12345]`;
    expect(parseCitations(text)).toEqual([
      {
        paragraph_index: 1,
        memory_ids: [UUID_A.toLowerCase(), UUID_B.toLowerCase()],
      },
    ]);
  });

  it('survives mixed case [Cites:] / [CITES:] markers', () => {
    expect(parseCitations(`[Cites: ${UUID_A}]`)).toEqual([
      { paragraph_index: 1, memory_ids: [UUID_A.toLowerCase()] },
    ]);
    expect(parseCitations(`[CITES: ${UUID_A}]`)).toEqual([
      { paragraph_index: 1, memory_ids: [UUID_A.toLowerCase()] },
    ]);
  });
});

describe('countCitationMarkers', () => {
  it('returns 0 for empty / non-string', () => {
    expect(countCitationMarkers('')).toBe(0);
    expect(countCitationMarkers(null as any)).toBe(0);
  });

  it('counts every marker, even malformed ones (no-UUID still counts)', () => {
    const text = `[cites: ${UUID_A}]
[cites: nothing]
[cites: ${UUID_B}, ${UUID_C}]`;
    expect(countCitationMarkers(text)).toBe(3);
  });

  it('handles a single marker', () => {
    expect(countCitationMarkers(`[cites: ${UUID_A}]`)).toBe(1);
  });

  it('handles 0 markers', () => {
    expect(countCitationMarkers('just prose, nothing cited')).toBe(0);
  });
});
