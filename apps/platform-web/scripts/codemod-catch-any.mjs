/**
 * Wave F.1.3 — codemod that drains `catch (e: any)` / `catch (err: any)`
 * patterns across `apps/platform-web/src/**` (both production AND test code).
 *
 * Strategy (per W-F.1.3 strategy doc):
 *   1. Replace `catch (e: any)` → `catch (e: unknown)`.
 *   2. Inspect the catch body for accesses on the binding:
 *      a. **Re-throw flow** (body ends with / contains `throw <binding>;` —
 *         typical of repo / route files that re-throw non-handled errors):
 *         prepend a narrowing guard + widening cast at the top of the body:
 *           `if (!(e instanceof Error)) throw e;
 *            const eErr = e as Error & { code?: string; constraint?: string };`
 *         Then mechanically substitute `e.<member>` → `eErr.<member>` within
 *         the catch body (preserves all existing access patterns including
 *         `e?.code`, `e.constraint`, etc.).
 *
 *      b. **No-rethrow flow** (typical of UI form handlers that call
 *         `setError(e.message ?? '...')`):
 *         prepend a value-preserving narrowing alias:
 *           `const eErr = e instanceof Error ? e : new Error(String(e));`
 *         Then substitute `e.<member>` → `eErr.<member>` within the body.
 *         This preserves runtime flow (non-Error values get wrapped, not
 *         re-thrown — important because some `setError` paths may receive
 *         caught non-Error rejections).
 *
 *      c. **No body access** (body only logs `e` or just `throw e`):
 *         just the annotation change is sufficient.
 *
 *   3. The substitution uses a fresh alias name (`<binding>Err` — typically
 *      `eErr` or `errErr`) to avoid colliding with any pre-existing local of
 *      the same name. The original binding name remains as the catch
 *      parameter (typed `unknown`); only references to its members get
 *      rewritten to go through the typed alias.
 *
 * Run from repo root:
 *   node apps/platform-web/scripts/codemod-catch-any.mjs            # full sweep
 *   node apps/platform-web/scripts/codemod-catch-any.mjs <file...>  # specific files
 */

import { Project, SyntaxKind } from 'ts-morph';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(APP_ROOT, 'src');

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
    : walk(SRC_ROOT);

const project = new Project({
  tsConfigFilePath: path.join(APP_ROOT, 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});

for (const f of targetFiles) {
  project.addSourceFileAtPath(f);
}

const counts = {
  rethrow: 0, // Strategy A
  noRethrow: 0, // Strategy B
  noAccess: 0, // Strategy C
};

const filesChanged = new Set();

/**
 * Determine the catch-body strategy.
 *
 * Returns one of:
 *   - 'rethrow' — body contains a `throw <binding>` statement (the catch
 *      re-throws non-handled errors). Use the narrow-or-throw guard.
 *   - 'noRethrow' — body accesses members on the binding but does NOT
 *      re-throw it. Use the value-preserving Error-wrap alias.
 *   - 'noAccess' — body does not access any member on the binding (and may
 *      or may not re-throw it as a value). Annotation-only change.
 */
function classifyCatch(catchClause, bindingName) {
  const block = catchClause.getBlock();
  if (!block) return 'noAccess';

  let hasAccess = false;
  let hasRethrow = false;

  block.forEachDescendant((node) => {
    // PropertyAccessExpression: `<binding>.member` or `<binding>?.member`
    if (node.getKind() === SyntaxKind.PropertyAccessExpression) {
      const expr = node.getExpression();
      if (
        expr.getKind() === SyntaxKind.Identifier &&
        expr.getText() === bindingName
      ) {
        hasAccess = true;
      }
    }
    // ElementAccessExpression: `<binding>[...]`
    if (node.getKind() === SyntaxKind.ElementAccessExpression) {
      const expr = node.getExpression();
      if (
        expr.getKind() === SyntaxKind.Identifier &&
        expr.getText() === bindingName
      ) {
        hasAccess = true;
      }
    }
    // ThrowStatement with the binding as the argument
    if (node.getKind() === SyntaxKind.ThrowStatement) {
      const arg = node.getExpression();
      if (
        arg &&
        arg.getKind() === SyntaxKind.Identifier &&
        arg.getText() === bindingName
      ) {
        hasRethrow = true;
      }
    }
  });

  if (!hasAccess) return 'noAccess';
  if (hasRethrow) return 'rethrow';
  return 'noRethrow';
}

/**
 * Rewrite all `<binding>.member` / `<binding>?.member` / `<binding>[...]`
 * within the catch block to use `<aliasName>` instead.
 */
function rewriteBindingAccesses(catchClause, bindingName, aliasName) {
  const block = catchClause.getBlock();
  if (!block) return;

  // Collect identifier nodes that are the LHS of a member access on the
  // binding. We collect first then rewrite to avoid mutating during
  // traversal.
  const toReplace = [];
  block.forEachDescendant((node) => {
    const kind = node.getKind();
    if (
      kind === SyntaxKind.PropertyAccessExpression ||
      kind === SyntaxKind.ElementAccessExpression
    ) {
      const expr = node.getExpression();
      if (
        expr.getKind() === SyntaxKind.Identifier &&
        expr.getText() === bindingName
      ) {
        toReplace.push(expr);
      }
    }
  });

  // Replace from the end of the file backwards to preserve positions.
  toReplace.sort((a, b) => b.getStart() - a.getStart());
  for (const id of toReplace) {
    id.replaceWithText(aliasName);
  }
}

for (const sourceFile of project.getSourceFiles()) {
  const filePath = sourceFile.getFilePath();
  let mutated = false;

  // Collect catches first (mutating during traversal is risky).
  const catches = sourceFile.getDescendantsOfKind(SyntaxKind.CatchClause);
  for (const catchClause of catches) {
    const decl = catchClause.getVariableDeclaration();
    if (!decl) continue;

    const typeNode = decl.getTypeNode();
    if (!typeNode) continue;
    if (typeNode.getText() !== 'any') continue;

    const bindingName = decl.getName();
    // Choose alias name that doesn't collide with existing identifiers in
    // the catch block. Default: <bindingName>Err. If that collides (e.g.
    // binding is already `err`, alias would be `errErr` — fine), bump to
    // <bindingName>Err2, etc.
    let aliasName = `${bindingName}Err`;
    if (aliasName === bindingName) aliasName = `${bindingName}Aliased`;

    const strategy = classifyCatch(catchClause, bindingName);
    counts[strategy]++;

    // Step 1: Annotation always changes.
    typeNode.replaceWithText('unknown');

    if (strategy === 'noAccess') {
      mutated = true;
      continue;
    }

    // Step 2: Rewrite member accesses to use the alias.
    rewriteBindingAccesses(catchClause, bindingName, aliasName);

    // Step 3: Prepend guard + alias declaration to the catch block.
    // Pass as an array of separate statement strings so ts-morph handles the
    // indentation of each line consistently (single concatenated string with
    // an embedded newline ends up double-indenting the second line).
    const block = catchClause.getBlock();
    let prefixStatements;
    if (strategy === 'rethrow') {
      prefixStatements = [
        `if (!(${bindingName} instanceof Error)) throw ${bindingName};`,
        `const ${aliasName} = ${bindingName} as Error & { code?: string; constraint?: string };`,
      ];
    } else {
      // noRethrow — value-preserving wrap.
      prefixStatements = [
        `const ${aliasName} = ${bindingName} instanceof Error ? ${bindingName} : new Error(String(${bindingName}));`,
      ];
    }
    block.insertStatements(0, prefixStatements);

    mutated = true;
  }

  if (mutated) {
    filesChanged.add(filePath);
  }
}

await project.save();

console.log('--- Wave F.1.3 codemod summary ---');
console.log(`Files changed: ${filesChanged.size}`);
console.log('Catch strategies applied:');
for (const [k, v] of Object.entries(counts)) {
  console.log(`  ${k}: ${v}`);
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`Total catches transformed: ${total}`);
