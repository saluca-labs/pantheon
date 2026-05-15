/**
 * Type augmentation for `vitest-axe` matchers under Vitest 3+/4+.
 *
 * `vitest-axe/extend-expect` augments the legacy `Vi.Assertion` namespace,
 * which Vitest 0.x exposed. Current Vitest exposes the assertion interface on
 * the `vitest` module directly, so we re-augment that here so test files can
 * call `expect(...).toHaveNoViolations()` with full TypeScript support.
 */
import type { AxeMatchers } from 'vitest-axe';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
