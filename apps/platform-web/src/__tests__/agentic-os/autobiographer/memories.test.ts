/**
 * Autobiographer OS — memories.ts domain unit tests.
 *
 * Exercises source taxonomy, validators, and tag / URL normalizers.
 * Pure functions — no DB.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  MEMORY_SOURCES,
  MEMORY_SOURCE_LABELS,
  normalizeMemoryTags,
  normalizePhotoUrls,
  memoryWordCount,
  validateMemorySource,
  validateMemoryTitle,
  validateMemoryBody,
} from '@/lib/agentic-os/autobiographer/memories';
import type { MemorySource } from '@/lib/agentic-os/autobiographer/memories';

// ─── MEMORY_SOURCES ──────────────────────────────────────────────────────────

describe('MEMORY_SOURCES', () => {
  it('contains exactly the 4 locked values', () => {
    expect(MEMORY_SOURCES).toHaveLength(4);
    for (const s of [
      'text',
      'audio_transcript',
      'photo_caption',
      'import',
    ]) {
      expect(MEMORY_SOURCES).toContain(s as MemorySource);
    }
  });

  it('has a label for every source', () => {
    for (const s of MEMORY_SOURCES) {
      expect(MEMORY_SOURCE_LABELS[s]).toBeTruthy();
    }
  });

  it('label map matches source set', () => {
    expect(Object.keys(MEMORY_SOURCE_LABELS).sort()).toEqual(
      [...MEMORY_SOURCES].sort(),
    );
  });
});

// ─── validateMemorySource ────────────────────────────────────────────────────

describe('validateMemorySource', () => {
  it('returns null for valid sources', () => {
    for (const s of MEMORY_SOURCES) {
      expect(validateMemorySource(s)).toBeNull();
    }
  });

  it('rejects unknown strings', () => {
    expect(validateMemorySource('voice')).not.toBeNull();
    expect(validateMemorySource('')).not.toBeNull();
  });

  it('rejects non-strings', () => {
    expect(validateMemorySource(null)).not.toBeNull();
    expect(validateMemorySource(undefined)).not.toBeNull();
    expect(validateMemorySource(42)).not.toBeNull();
  });

  it('error message lists the valid options', () => {
    const err = validateMemorySource('nope');
    expect(err).toContain('text');
    expect(err).toContain('audio_transcript');
  });
});

// ─── validateMemoryTitle ─────────────────────────────────────────────────────

describe('validateMemoryTitle', () => {
  it('returns null for a non-empty title', () => {
    expect(validateMemoryTitle('First move to Albuquerque')).toBeNull();
  });

  it('rejects empty string and whitespace-only', () => {
    expect(validateMemoryTitle('')).not.toBeNull();
    expect(validateMemoryTitle('   ')).not.toBeNull();
  });

  it('rejects non-strings', () => {
    expect(validateMemoryTitle(null)).not.toBeNull();
    expect(validateMemoryTitle(42)).not.toBeNull();
  });

  it('rejects titles over 500 chars', () => {
    expect(validateMemoryTitle('a'.repeat(501))).not.toBeNull();
  });

  it('accepts 500-char title (boundary)', () => {
    expect(validateMemoryTitle('a'.repeat(500))).toBeNull();
  });
});

// ─── validateMemoryBody ──────────────────────────────────────────────────────

describe('validateMemoryBody', () => {
  it('returns null for non-empty body', () => {
    expect(validateMemoryBody('It was a Tuesday in 1985…')).toBeNull();
  });

  it('rejects empty string', () => {
    expect(validateMemoryBody('')).not.toBeNull();
  });

  it('rejects non-strings', () => {
    expect(validateMemoryBody(null)).not.toBeNull();
    expect(validateMemoryBody(undefined)).not.toBeNull();
    expect(validateMemoryBody(42)).not.toBeNull();
  });
});

// ─── normalizeMemoryTags ─────────────────────────────────────────────────────

describe('normalizeMemoryTags', () => {
  it('trims whitespace', () => {
    expect(normalizeMemoryTags(['  joy  ', ' grief'])).toEqual([
      'joy',
      'grief',
    ]);
  });

  it('drops empty entries', () => {
    expect(normalizeMemoryTags(['joy', '', '   '])).toEqual(['joy']);
  });

  it('dedupes case-insensitively', () => {
    expect(normalizeMemoryTags(['Joy', 'joy', 'Pride'])).toEqual([
      'Joy',
      'Pride',
    ]);
  });

  it('drops non-string entries', () => {
    expect(normalizeMemoryTags(['joy', 42 as never, null as never])).toEqual([
      'joy',
    ]);
  });

  it('handles empty input', () => {
    expect(normalizeMemoryTags([])).toEqual([]);
  });
});

// ─── normalizePhotoUrls ──────────────────────────────────────────────────────

describe('normalizePhotoUrls', () => {
  it('trims whitespace', () => {
    expect(normalizePhotoUrls(['  https://x/a.jpg  '])).toEqual([
      'https://x/a.jpg',
    ]);
  });

  it('drops empty entries', () => {
    expect(normalizePhotoUrls(['https://x/a.jpg', '', '   '])).toEqual([
      'https://x/a.jpg',
    ]);
  });

  it('dedupes case-sensitively (URLs are case-sensitive)', () => {
    // Same URL twice -> deduped
    expect(
      normalizePhotoUrls(['https://x/a.jpg', 'https://x/a.jpg']),
    ).toEqual(['https://x/a.jpg']);
    // Different case in path -> NOT deduped (URLs are case-sensitive on path)
    expect(
      normalizePhotoUrls(['https://x/a.jpg', 'https://x/A.jpg']),
    ).toEqual(['https://x/a.jpg', 'https://x/A.jpg']);
  });

  it('drops non-string entries', () => {
    expect(
      normalizePhotoUrls(['https://x/a.jpg', 42 as never, null as never]),
    ).toEqual(['https://x/a.jpg']);
  });

  it('handles empty input', () => {
    expect(normalizePhotoUrls([])).toEqual([]);
  });
});

// ─── memoryWordCount ────────────────────────────────────────────────────────

describe('memoryWordCount', () => {
  it('returns 0 for empty + whitespace-only', () => {
    expect(memoryWordCount('')).toBe(0);
    expect(memoryWordCount('   ')).toBe(0);
    expect(memoryWordCount('\n\t  ')).toBe(0);
  });

  it('counts words split on whitespace', () => {
    expect(memoryWordCount('the quick brown fox')).toBe(4);
  });

  it('handles multiple whitespace runs', () => {
    expect(memoryWordCount('the  quick   brown\tfox')).toBe(4);
  });

  it('counts a single word', () => {
    expect(memoryWordCount('hello')).toBe(1);
  });
});
