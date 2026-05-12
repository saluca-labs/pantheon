'use client';

/**
 * Business OS Phase 1 — recent-interactions feed (deprecated stand-alone
 * use; surface in the hub's third card). Kept as a separate component for
 * tests + future reuse.
 *
 * @license MIT — Tiresias Business OS Phase 1 (internal).
 */

import type { Interaction } from '@/lib/agentic-os/business/crm';
import { InteractionTimeline } from './interaction-timeline';

export function RecentInteractions({ interactions }: { interactions: Interaction[] }) {
  return <InteractionTimeline interactions={interactions} />;
}
