import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

/**
 * Pantheon platform-web ESLint config.
 *
 * W-E.4 enforces `eslint-plugin-jsx-a11y`'s recommended preset at `error` level
 * for every file in the W-E.4 touch zone (`_shared/` primitives + the
 * mobile-nav layout shell). The contract lives in `_design/a11y.md`; the rule
 * list is owned by the plugin (we deliberately do not pin specific rules here
 * so plugin updates land automatically).
 *
 * Why scoped instead of repo-wide: the recommended preset surfaces 240+
 * latent violations across the broader codebase (mostly `<div onClick>`
 * patterns and form-label nesting issues) that are destined for separate
 * fix-it subs in Wave E.4+. Scoping enforcement to the W-E.4 touch zone
 * keeps the gate green where the wave actually ships, without theatre.
 * Subsequent waves will broaden the scope as the latent backlog drains.
 *
 * `eslint-config-next` already wires the jsx-a11y plugin with a handful of
 * rules at `warn` level. The block below layers the full recommended preset
 * at `error` on top, restricted to the touch-zone glob.
 *
 * Carve-outs are inline at the violation site via
 * `// eslint-disable-next-line jsx-a11y/<rule> -- <reason>`. No global rule
 * downgrades and no `warn` levels in the touch zone — enforcement is
 * theatrical otherwise.
 */

// Derive the recommended rule set from the plugin. The shape of
// `jsxA11y.configs.recommended.rules` is `{ rule: 'off' | 'warn' | 'error' |
// [severity, options] }`. We preserve rules the preset deliberately leaves
// `off` (e.g. `label-has-for` is deprecated in favor of
// `label-has-associated-control`) and lift every active rule to `error`,
// keeping its options array intact.
const jsxA11yErrorRules = Object.fromEntries(
  Object.entries(jsxA11y.configs.recommended.rules).map(([key, value]) => {
    if (typeof value === "string") {
      return [key, value === "off" ? "off" : "error"];
    }
    if (Array.isArray(value) && value.length > 0) {
      const [severity, ...rest] = value;
      const next = severity === "off" || severity === 0 ? severity : "error";
      return [key, [next, ...rest]];
    }
    return [key, value];
  }),
);

// Files in scope for W-E.4 enforcement. Wave E.5+ will broaden this.
const A11Y_TOUCH_ZONE = [
  "src/components/agentic-os/_shared/**/*.{js,jsx,ts,tsx}",
  "src/components/layout/mobile-nav.tsx",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // jsx-a11y recommended preset at error level — scoped to the W-E.4 touch
  // zone. See block comment above for why this is scoped.
  {
    files: A11Y_TOUCH_ZONE,
    rules: jsxA11yErrorRules,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
