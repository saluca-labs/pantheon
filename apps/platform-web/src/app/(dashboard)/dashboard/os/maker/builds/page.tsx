/**
 * Maker OS — /dashboard/os/maker/builds (legacy redirect).
 *
 * Phase 1 (v0.1.29) renamed Builds to Projects. This page issues a server-
 * side permanent (308) redirect to `/dashboard/os/maker/projects` so any
 * bookmarked legacy URL lands in the right place. Remove in Phase 2.
 *
 * @license MIT — Tiresias Maker OS (internal).
 */

import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LegacyMakerBuildsPage(): never {
  permanentRedirect('/dashboard/os/maker/projects');
}
