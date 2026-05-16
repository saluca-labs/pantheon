/**
 * Wave F.1.1 — second-pass fixup for typecheck errors introduced by the
 * primary codemod (`codemod-test-any.mjs`).
 *
 * Strategy:
 *   - `(<expr> as never).<methodOrProp>` → `(<expr> as unknown as Record<string, any>).<methodOrProp>`
 *     ... but that re-introduces `any`. Instead:
 *     - For method calls on mocks: `as unknown as { mockReset?: () => void; mockResolvedValue?: (v: unknown) => void; mockReturnValue?: (v: unknown) => void; mockClear?: () => void; mock?: { calls: unknown[][] }; (...a: unknown[]): unknown; }`
 *     - For property reads on response: `as unknown as Response`
 *     - For property reads on context.data, args, etc.: a permissive helper type.
 *
 * Simplest pragmatic approach: introduce a single shared "TestAny" helper
 * type at the top of each affected file? That's too invasive.
 *
 * Cleanest: use a recursive Proxy type for "untyped access":
 *   type AnyObj = { [k: string]: AnyObj } & ((...a: unknown[]) => AnyObj) & unknown[];
 *
 * Even simpler: write inline `as unknown as Record<string, unknown>` for property
 * reads, then deep accesses (`.counts.book_count`) need an extra cast. But
 * tests only do 1-2 levels deep — handle the few exceptions manually.
 *
 * Final approach for this fixup script:
 *   1) `(<expr> as never).mockReset()` etc. → `(<expr> as unknown as ReturnType<typeof vi.fn>).mockReset()`
 *      Handles: mockReset, mockResolvedValue, mockReturnValue, mockClear, mockImplementation, mockRejectedValue, mock
 *   2) `await (res as never).text()` → `await (res as unknown as Response).text()`
 *   3) `(<expr> as never).<prop>` (single prop, non-method) → `(<expr> as unknown as Record<string, unknown>).<prop>`
 *      Then if cascaded errors come up, those need manual fixes.
 *
 * Run from repo root:
 *   node apps/platform-web/scripts/codemod-test-any-fixup.mjs
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');
const TESTS_ROOT = path.join(APP_ROOT, 'src', '__tests__');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const targetFiles = walk(TESTS_ROOT);

const MOCK_METHODS = new Set([
  'mockReset',
  'mockResolvedValue',
  'mockResolvedValueOnce',
  'mockReturnValue',
  'mockReturnValueOnce',
  'mockClear',
  'mockImplementation',
  'mockImplementationOnce',
  'mockRejectedValue',
  'mockRejectedValueOnce',
  'mock',
]);

const counts = {
  mockMethod: 0,
  responseText: 0,
  propRead: 0,
};
const changed = new Set();

for (const file of targetFiles) {
  const before = fs.readFileSync(file, 'utf8');
  let text = before;

  // Pattern: `(<expr> as never).<member>`
  // We capture the expression up to `as never)` then the property.
  // To avoid breaking generic uses of `as never`, we match only inside
  // a `.<member>` access chain.
  text = text.replace(
    /\(([^()]+?)\s+as\s+never\)\s*\.\s*([A-Za-z_$][\w$]*)/g,
    (m, expr, member) => {
      if (MOCK_METHODS.has(member)) {
        counts.mockMethod++;
        return `(${expr} as unknown as ReturnType<typeof vi.fn>).${member}`;
      }
      if (member === 'text' || member === 'json' || member === 'blob' || member === 'arrayBuffer') {
        counts.responseText++;
        return `(${expr} as unknown as Response).${member}`;
      }
      // Property read — broaden to Record<string, unknown>.
      counts.propRead++;
      return `(${expr} as unknown as Record<string, unknown>).${member}`;
    },
  );

  // Pattern: `<expr> as never\)\[<key>\]` (indexed access)
  text = text.replace(
    /\(([^()]+?)\s+as\s+never\)\s*\[/g,
    (_m, expr) => {
      counts.propRead++;
      return `(${expr} as unknown as Record<string, ReturnType<typeof vi.fn>>)[`;
    },
  );

  if (text !== before) {
    fs.writeFileSync(file, text);
    changed.add(file);
  }
}

console.log('--- Wave F.1.1 fixup pass summary ---');
console.log(`Files changed: ${changed.size}`);
console.log(`Mock method cast fixes: ${counts.mockMethod}`);
console.log(`Response method cast fixes: ${counts.responseText}`);
console.log(`Property read cast fixes: ${counts.propRead}`);
