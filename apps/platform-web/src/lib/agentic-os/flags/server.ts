/**
 * Feature flags — server-side helpers.
 *
 * Provides `getEnabledModules` and `isOsEnabled` for use in server
 * components and server actions. These filter the static registry against
 * the per-user flag store.
 *
 * @license MIT — Tiresias Agentic OS (internal).
 */

import 'server-only';
import { AGENTIC_OS_MODULES, type AgenticOsModule } from '../registry';
import { getFlags } from './repo';

/**
 * Returns the subset of `AGENTIC_OS_MODULES` that are enabled for `userId`.
 * All modules are enabled by default; only explicit `false` rows disable.
 */
export async function getEnabledModules(
  userId: string,
): Promise<AgenticOsModule[]> {
  const flags = await getFlags(userId);
  return AGENTIC_OS_MODULES.filter((m) => flags[m.slug] !== false);
}

/**
 * Returns `true` if the OS identified by `slug` is enabled for `userId`.
 * Returns `true` for unknown slugs (safe default — the route notFound()
 * handles unrecognised slugs before this is called).
 */
export async function isOsEnabled(
  userId: string,
  slug: string,
): Promise<boolean> {
  const flags = await getFlags(userId);
  return flags[slug] !== false;
}
