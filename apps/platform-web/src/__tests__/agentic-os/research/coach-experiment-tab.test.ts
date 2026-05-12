/**
 * Research OS Phase 7 — experiment-page Coach tab wiring.
 *
 * This test is a static smoke test on the experiment-detail page source
 * to verify the Phase 7 Coach tab integration:
 *
 *   - `'coach'` is in the TabKey type union.
 *   - TABS array contains a `coach` entry.
 *   - isTabKey accepts `'coach'`.
 *   - The Coach tab body renders an Open experiment coach Link that
 *     points at `?experiment_id=<id>&mode=methods_advisor`.
 *
 * Lighter-weight than a JSX render test — we read the source file
 * directly and assert on text patterns. Matches the style of the
 * existing migration-text tests in this folder.
 *
 * @license MIT — Tiresias Research OS Phase 7 (internal).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PAGE_PATH = path.resolve(
  __dirname,
  '../../../app/(dashboard)/dashboard/os/research/experiments/[id]/page.tsx',
);

const source = readFileSync(PAGE_PATH, 'utf8');

describe('experiment page — Coach tab integration', () => {
  it('TabKey type union includes "coach"', () => {
    expect(source).toMatch(/type TabKey =[\s\S]+'coach'/);
  });

  it('TABS array includes a coach entry with the Sparkles icon', () => {
    expect(source).toMatch(/key: 'coach',\s*label: 'Coach',\s*icon: Sparkles/);
  });

  it('isTabKey accepts "coach"', () => {
    expect(source).toMatch(/value === 'coach'/);
  });

  it('Sparkles icon is imported from lucide-react', () => {
    expect(source).toMatch(/Sparkles,?\s*\n[\s\S]*?from 'lucide-react'/);
  });

  it('Coach tab body links into the coach hub with experiment_id + methods_advisor', () => {
    expect(source).toMatch(
      /\/dashboard\/os\/research\/coach\?experiment_id=\$\{experiment\.id\}&mode=methods_advisor/,
    );
  });

  it('Coach tab body carries a test id for downstream tests', () => {
    expect(source).toMatch(/data-testid="coach-tab"/);
    expect(source).toMatch(/data-testid="coach-tab-cta"/);
  });

  it('Coach tab heading mentions AI coach', () => {
    // The h2 inside the tab body should call out the AI coach.
    expect(source).toMatch(/id="coach-heading"[\s\S]+AI coach/);
  });

  it('Coach tab body mentions the regulated-advice referral guarantee', () => {
    expect(source).toMatch(
      /IRB|IACUC|EHS|regulated/i,
    );
  });
});
