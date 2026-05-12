/**
 * Autobiographer OS — pseudonym redaction algorithm.
 *
 * Locks every invariant from `redaction.ts`'s docstring. The redaction
 * algorithm is the spec-critical piece of Phase 6 — every consumer
 * (PDF export, future coach reads) depends on the rules these tests
 * pin down.
 *
 * Test catalog:
 *   - Whole-token word-boundary substitution (no substring matches)
 *   - Case preservation on the first letter only
 *   - Aliases substitute identically to canonical_name
 *   - Left-to-right application order with overlapping pseudonyms
 *   - Empty map = identity
 *   - applied-ids set captures every pseudonym that fired
 *   - redactTitle is the same algorithm for memory titles
 *
 * @license MIT — Tiresias Autobiographer OS Phase 6 (internal).
 */

import { describe, it, expect } from 'vitest';
import {
  applyPseudonymRedaction,
  caseAdjust,
  mergeAppliedIds,
  redactTitle,
  type PseudonymInput,
} from '@/lib/agentic-os/autobiographer/redaction';

const mom: PseudonymInput = {
  id: 'p-mom',
  canonicalName: 'Mom',
  aliases: [],
  pseudonym: 'Mary',
};

const al: PseudonymInput = {
  id: 'p-al',
  canonicalName: 'Al',
  aliases: ['Albert'],
  pseudonym: 'Steven',
};

const dad: PseudonymInput = {
  id: 'p-dad',
  canonicalName: 'Dad',
  aliases: ['Father', 'Papa'],
  pseudonym: 'James',
};

describe('caseAdjust', () => {
  it('uppercase first letter → uppercase pseudonym first letter', () => {
    expect(caseAdjust('Mom', 'Mary')).toBe('Mary');
  });

  it('lowercase first letter → lowercase pseudonym first letter', () => {
    expect(caseAdjust('mom', 'Mary')).toBe('mary');
  });

  it('ALL-CAPS first letter → uppercase pseudonym first letter, rest from pseudonym', () => {
    expect(caseAdjust('MOM', 'Mary')).toBe('Mary');
  });

  it('non-letter first char → pseudonym verbatim', () => {
    expect(caseAdjust('1Mom', 'Mary')).toBe('Mary');
  });

  it('empty matched returns pseudonym', () => {
    expect(caseAdjust('', 'Mary')).toBe('Mary');
  });
});

describe('applyPseudonymRedaction — empty inputs', () => {
  it('empty text returns identity', () => {
    const r = applyPseudonymRedaction('', [mom]);
    expect(r.text).toBe('');
    expect(r.appliedPseudonymIds.size).toBe(0);
  });

  it('empty pseudonym map returns identity', () => {
    const text = 'Mom met Al at the diner.';
    const r = applyPseudonymRedaction(text, []);
    expect(r.text).toBe(text);
    expect(r.appliedPseudonymIds.size).toBe(0);
  });
});

describe('applyPseudonymRedaction — whole-token boundaries', () => {
  it('substitutes canonical_name as a whole token', () => {
    const r = applyPseudonymRedaction('Mom called.', [mom]);
    expect(r.text).toBe('Mary called.');
    expect(r.appliedPseudonymIds.has('p-mom')).toBe(true);
  });

  it('does NOT substitute inside a longer word', () => {
    // person "Al" must not replace inside "always" / "walked"
    const r = applyPseudonymRedaction('Always walked together.', [al]);
    expect(r.text).toBe('Always walked together.');
    expect(r.appliedPseudonymIds.size).toBe(0);
  });

  it('matches at sentence-start and sentence-end', () => {
    const r = applyPseudonymRedaction('Mom. Then Mom.', [mom]);
    expect(r.text).toBe('Mary. Then Mary.');
  });

  it('matches around punctuation', () => {
    const r = applyPseudonymRedaction("Mom's car. (Mom!)", [mom]);
    expect(r.text).toBe("Mary's car. (Mary!)");
  });
});

describe('applyPseudonymRedaction — case preservation', () => {
  it('"Mom" → "Mary"', () => {
    const r = applyPseudonymRedaction('Mom', [mom]);
    expect(r.text).toBe('Mary');
  });

  it('"mom" → "mary" (first letter lowercased)', () => {
    const r = applyPseudonymRedaction('mom', [mom]);
    expect(r.text).toBe('mary');
  });

  it('"MOM" → "Mary" (uppercase first letter; rest verbatim from pseudonym)', () => {
    const r = applyPseudonymRedaction('MOM', [mom]);
    expect(r.text).toBe('Mary');
  });

  it('preserves the rest of the pseudonym verbatim ("MacGregor" pseudonym keeps the middle cap)', () => {
    const macP: PseudonymInput = {
      id: 'p-mac',
      canonicalName: 'Bob',
      aliases: [],
      pseudonym: 'MacGregor',
    };
    expect(applyPseudonymRedaction('Bob', [macP]).text).toBe('MacGregor');
    expect(applyPseudonymRedaction('bob', [macP]).text).toBe('macGregor');
  });

  it('hits multiple instances of varying case in one body', () => {
    const r = applyPseudonymRedaction(
      'Mom said hi. mom said hi again. MOM was tired.',
      [mom],
    );
    expect(r.text).toBe('Mary said hi. mary said hi again. Mary was tired.');
    expect(r.appliedPseudonymIds.has('p-mom')).toBe(true);
  });
});

describe('applyPseudonymRedaction — aliases', () => {
  it('aliases substitute to the same pseudonym', () => {
    const r = applyPseudonymRedaction(
      'Dad called. Then Father waved. Then Papa smiled.',
      [dad],
    );
    expect(r.text).toBe('James called. Then James waved. Then James smiled.');
    expect(r.appliedPseudonymIds.has('p-dad')).toBe(true);
  });

  it('one alias firing is enough to register the pseudonym id', () => {
    const r = applyPseudonymRedaction('Father visited.', [dad]);
    expect(r.text).toBe('James visited.');
    expect(r.appliedPseudonymIds.has('p-dad')).toBe(true);
  });

  it('alias matches case-preserve too', () => {
    const r = applyPseudonymRedaction('father visited.', [dad]);
    expect(r.text).toBe('james visited.');
  });

  it('multi-word alias matches with arbitrary whitespace', () => {
    const mw: PseudonymInput = {
      id: 'p-mw',
      canonicalName: 'Bob',
      aliases: ['Robert J. Smith'],
      pseudonym: 'Carl',
    };
    expect(
      applyPseudonymRedaction('Then Robert J. Smith left.', [mw]).text,
    ).toBe('Then Carl left.');
    expect(
      applyPseudonymRedaction('Then Robert J.  Smith left.', [mw]).text,
    ).toBe('Then Carl left.');
  });
});

describe('applyPseudonymRedaction — left-to-right pseudonym order', () => {
  it('first pseudonym in the array fires first', () => {
    // Two pseudonyms; both could match "Mom" — but we use distinct
    // names so the ordering is observable but unambiguous.
    const r = applyPseudonymRedaction('Mom and Al met.', [mom, al]);
    expect(r.text).toBe('Mary and Steven met.');
    expect(r.appliedPseudonymIds.has('p-mom')).toBe(true);
    expect(r.appliedPseudonymIds.has('p-al')).toBe(true);
  });

  it('pseudonym N is applied to the output of 1..N-1', () => {
    // Construct a transitive case: pseudonym A maps "Mom" → "Mary";
    // pseudonym B maps "Mary" → "Maria". With left-to-right ordering,
    // "Mom" becomes "Mary" then "Maria".
    const a: PseudonymInput = {
      id: 'p-a',
      canonicalName: 'Mom',
      aliases: [],
      pseudonym: 'Mary',
    };
    const b: PseudonymInput = {
      id: 'p-b',
      canonicalName: 'Mary',
      aliases: [],
      pseudonym: 'Maria',
    };
    const r = applyPseudonymRedaction('Mom called.', [a, b]);
    expect(r.text).toBe('Maria called.');
    // Both fired (a on the original "Mom", b on the intermediate "Mary").
    expect(r.appliedPseudonymIds.has('p-a')).toBe(true);
    expect(r.appliedPseudonymIds.has('p-b')).toBe(true);
  });

  it('longer alias substitutes before shorter source within a single pseudonym', () => {
    // canonicalName "Mary" + alias "Mary Jane Watson" → pseudonym "Carla".
    // The whole-token alias must hit first so "Mary Jane Watson" doesn't
    // partially substitute as "Carla Jane Watson".
    const p: PseudonymInput = {
      id: 'p-x',
      canonicalName: 'Mary',
      aliases: ['Mary Jane Watson'],
      pseudonym: 'Carla',
    };
    const r = applyPseudonymRedaction(
      'Mary Jane Watson and Mary met.',
      [p],
    );
    expect(r.text).toBe('Carla and Carla met.');
    expect(r.appliedPseudonymIds.has('p-x')).toBe(true);
  });
});

describe('applyPseudonymRedaction — non-firing pseudonyms', () => {
  it('does not register applied id when nothing matches', () => {
    const r = applyPseudonymRedaction('The diner was empty.', [mom]);
    expect(r.text).toBe('The diner was empty.');
    expect(r.appliedPseudonymIds.size).toBe(0);
  });

  it('drops empty pseudonym row (no canonical name)', () => {
    const empty: PseudonymInput = {
      id: 'p-empty',
      canonicalName: '',
      aliases: [],
      pseudonym: 'Anything',
    };
    const r = applyPseudonymRedaction('Mom met Al.', [empty, mom]);
    expect(r.text).toBe('Mary met Al.');
    expect(r.appliedPseudonymIds.has('p-empty')).toBe(false);
  });

  it('drops row with empty pseudonym (skips substitution)', () => {
    const empty: PseudonymInput = {
      id: 'p-noped',
      canonicalName: 'Mom',
      aliases: [],
      pseudonym: '',
    };
    const r = applyPseudonymRedaction('Mom met Al.', [empty]);
    expect(r.text).toBe('Mom met Al.');
    expect(r.appliedPseudonymIds.size).toBe(0);
  });
});

describe('redactTitle', () => {
  it('applies the same algorithm to a memory title', () => {
    expect(redactTitle('First call with Mom', [mom])).toBe(
      'First call with Mary',
    );
  });

  it('null / undefined → empty string', () => {
    expect(redactTitle(null, [mom])).toBe('');
    expect(redactTitle(undefined, [mom])).toBe('');
  });

  it('no map → returns input unchanged', () => {
    expect(redactTitle('First call with Mom', [])).toBe('First call with Mom');
  });
});

describe('mergeAppliedIds', () => {
  it('unions multiple sets', () => {
    const merged = mergeAppliedIds(
      new Set(['a', 'b']),
      new Set(['b', 'c']),
      new Set(['d']),
    );
    expect(merged.size).toBe(4);
    expect(merged).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('empty input → empty set', () => {
    expect(mergeAppliedIds()).toEqual(new Set());
  });
});

describe('regression — substring vs. boundary edge cases', () => {
  it('"Al" inside "Albuquerque" does NOT substitute', () => {
    const r = applyPseudonymRedaction(
      'We moved to Albuquerque with Al.',
      [al],
    );
    expect(r.text).toBe('We moved to Albuquerque with Steven.');
    expect(r.appliedPseudonymIds.has('p-al')).toBe(true);
  });

  it('digit-adjacent name does NOT match', () => {
    // "Al2" should not match "Al"
    const r = applyPseudonymRedaction('Al2 stayed put.', [al]);
    expect(r.text).toBe('Al2 stayed put.');
  });

  it('underscore-adjacent name does NOT match', () => {
    // "Al_" treats underscore as a word char
    const r = applyPseudonymRedaction('Al_x stayed put.', [al]);
    expect(r.text).toBe('Al_x stayed put.');
  });

  it('hyphen-adjacent name DOES match (hyphen is not a word char)', () => {
    const r = applyPseudonymRedaction('Al-shaped sandwich.', [al]);
    expect(r.text).toBe('Steven-shaped sandwich.');
  });
});
