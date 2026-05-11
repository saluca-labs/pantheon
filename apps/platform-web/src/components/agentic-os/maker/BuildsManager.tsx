'use client';

/**
 * Maker OS — BuildsManager (deprecated shim).
 *
 * Phase 1 (v0.1.29) renamed Builds to Projects. This file is kept for one
 * release so any third-party / vendored code that imports `BuildsManager`
 * still resolves; internally it just re-exports `ProjectsManager` and adapts
 * the legacy `initialBuilds` prop to `initialProjects`.
 *
 * Remove in Phase 2 once direct importers have migrated.
 *
 * @deprecated Use `ProjectsManager` from `./projects-manager.tsx` instead.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import type { MakerProject } from '@/lib/agentic-os/maker/repo';
import { ProjectsManager } from './projects-manager';

/** @deprecated — use `ProjectsManager` directly. */
export function BuildsManager({ initialBuilds }: { initialBuilds: MakerProject[] }) {
  return <ProjectsManager initialProjects={initialBuilds} />;
}

export default BuildsManager;
