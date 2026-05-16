/**
 * Wave F.1.1 — codemod that drains `@typescript-eslint/no-explicit-any`
 * from `src/__tests__/**`.
 *
 * Strategy (per W-F.1 strategy doc):
 *   - `Record<string, any>`            → `Record<string, unknown>`
 *   - `(...args: any[])`               → `(...args: unknown[])`
 *   - `: any[]` (param/var annot)      → `: unknown[]`
 *   - `: any` (param/var annot)        → `: unknown`
 *   - `const X: any = new Error(...)`  → `const X = new Error(...) as Error & { code?: string }`
 *   - `(m as any).mockReset()` etc.    → `(m as unknown as Mock).mockReset()`
 *   - `as any` (in call-arg position)  → `as never`  (type-safe-ish "lie", same
 *                                       runtime cost as `any` but typechecks)
 *
 * The `as never` substitute is deliberate: in test contexts these casts exist
 * to satisfy structural mismatches between mock objects (e.g. `new NextRequest(...)`)
 * and the typed handler signatures (`GET(req: NextRequest, ctx: { params: ... })`).
 * `never` is bottom-type and assignable to anything, so the call sites still
 * typecheck without re-introducing `any`.
 *
 * NOT in scope (W-F.1.3 will handle):
 *   - `catch (e: any)`  — already verified there are none in `__tests__/`.
 *
 * Run from repo root:
 *   node apps/platform-web/scripts/codemod-test-any.mjs            # full sweep
 *   node apps/platform-web/scripts/codemod-test-any.mjs <file...>  # specific files
 */

import { Project } from 'ts-morph';
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

const cliArgs = process.argv.slice(2);
const targetFiles =
  cliArgs.length > 0
    ? cliArgs.map((p) => path.resolve(process.cwd(), p))
    : walk(TESTS_ROOT);

const project = new Project({
  tsConfigFilePath: path.join(APP_ROOT, 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});

for (const f of targetFiles) {
  project.addSourceFileAtPath(f);
}

const counts = {
  recordStringAny: 0,
  argsAny: 0,
  annotAnyArray: 0,
  annotAny: 0,
  errAnyAssign: 0,
  mockResetAs: 0,
  asAnyToNever: 0,
};

const filesChanged = new Set();

for (const sourceFile of project.getSourceFiles()) {
  const filePath = sourceFile.getFilePath();
  const before = sourceFile.getFullText();
  let text = before;

  // 1) Record<string, any> → Record<string, unknown>
  text = text.replace(/Record<string,\s*any>/g, (m) => {
    counts.recordStringAny++;
    return 'Record<string, unknown>';
  });

  // 2) (...args: any[]) → (...args: unknown[])
  text = text.replace(/\(\s*\.\.\.\s*([A-Za-z_$][\w$]*)\s*:\s*any\[\]\s*\)/g, (_m, name) => {
    counts.argsAny++;
    return `(...${name}: unknown[])`;
  });

  // 3) (param: any[] = []) → (param: unknown[] = [])  -- vector for param annot before #4
  text = text.replace(/(\b[A-Za-z_$][\w$]*)\s*:\s*any\[\]\s*=\s*\[\]/g, (_m, name) => {
    counts.annotAnyArray++;
    return `${name}: unknown[] = []`;
  });

  // 4) Generic `: any[]` (variable/param annot)
  text = text.replace(/:\s*any\[\]/g, (_m) => {
    counts.annotAnyArray++;
    return ': unknown[]';
  });

  // 5) `const X: any = new Error(...)` → `const X = new Error(...) as Error & { code?: string; constraint?: string }`
  //    Some PG-error mocks set additional fields (`constraint`, etc.) so the
  //    type needs to be permissive enough to allow them.
  text = text.replace(
    /\b(const|let)\s+([A-Za-z_$][\w$]*)\s*:\s*any\s*=\s*new\s+Error\(([^)]*)\)/g,
    (_m, kind, name, errArgs) => {
      counts.errAnyAssign++;
      return `${kind} ${name} = new Error(${errArgs}) as Error & { code?: string; constraint?: string }`;
    },
  );

  // 6) `(repoMocks)) (m as any).mockReset()` style — broaden:
  //    `(<expr> as any).mockReset()` → `(<expr> as unknown as { mockReset: () => void }).mockReset()`
  text = text.replace(/\(([^()]+?)\s+as\s+any\)\.mockReset\(\)/g, (_m, expr) => {
    counts.mockResetAs++;
    return `(${expr} as unknown as { mockReset: () => void }).mockReset()`;
  });

  // 7) Remaining `as any` → `as never`
  //    (Bottom-type cast: source-side always typechecks (assignment is
  //     `unknown → never` width; ts-morph allows because `never` is the
  //     subtype of everything) and target-side accepts any consumer.)
  text = text.replace(/\bas\s+any\b/g, (_m) => {
    counts.asAnyToNever++;
    return 'as never';
  });

  // 8) Remaining variable/param `: any` annotations (after #5 caught the err pattern)
  //    Match `: any` not followed by `[]` or word char.
  text = text.replace(/:\s*any(?![\w[])/g, (_m) => {
    counts.annotAny++;
    return ': unknown';
  });

  if (text !== before) {
    sourceFile.replaceWithText(text);
    filesChanged.add(filePath);
  }
}

await project.save();

console.log('--- Wave F.1.1 codemod summary ---');
console.log(`Files changed: ${filesChanged.size}`);
console.log('Substitutions:');
for (const [k, v] of Object.entries(counts)) {
  console.log(`  ${k}: ${v}`);
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`Total substitutions: ${total}`);
