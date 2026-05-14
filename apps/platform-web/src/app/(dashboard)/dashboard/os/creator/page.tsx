/**
 * Creator OS — hub page.
 *
 * Server component. Wave E-3 (UI Depth Wave coherence pass): the bespoke
 * `CreatorHub` client component — hand-rolled header, quick-create button,
 * and the dashboard strip / pinned / recent-notes sections that pre-dated
 * the primitive-aware `DashboardHub` — is retired. The hub now renders
 * through the shared `DashboardHub` shell like the rest of the suite:
 *   - `module`          — drives the icon / name / status badge / tagline /
 *                         description header and the registry feature grid
 *                         (Hub, Notes, Calendar, Publishing, Subscribers,
 *                         Books, Videos, Podcast, AI Chat, AI Coach).
 *   - `dashboardSlot`   — the Creator dashboard region: the quick-create
 *                         "New Note" action, the four aggregate-stat
 *                         widget tiles, the merged recent-activity feed,
 *                         and the pinned-notes + recent-notes sections.
 *                         The escape hatch is used (rather than the
 *                         declarative `dashboard` prop) because the
 *                         quick-create interactivity and the pinned /
 *                         recent-notes sections can't be expressed by the
 *                         widgets+chart+activity declarative slots.
 *   - `roadmapMarkdown` — the Creator execution plan in the collapsed
 *                         accordion.
 *
 * Same data, same routes, same counts, same status mixes, same empty
 * states, same quick-create behavior — presentation layer only.
 *
 * @license MIT — Tiresias Creator OS (internal).
 */

import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { loadAgenticOsPlan } from '@/lib/agentic-os/plan-loader';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { listNotes } from '@/lib/agentic-os/creator/notes-repo';
import { listPosts } from '@/lib/agentic-os/creator/posts-repo';
import { listBooks } from '@/lib/agentic-os/creator/books-repo';
import { listSubscribers } from '@/lib/agentic-os/creator/subscribers-repo';
import { CreatorDashboard } from '@/components/agentic-os/creator/creator-dashboard';

export const dynamic = 'force-dynamic';

const CREATOR_SLUG = 'creator';

export default async function CreatorHubPage() {
  const user = await getCurrentCreatorUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule(CREATOR_SLUG);
  if (!mod) {
    // Defensive — registry must contain Creator while this page is shipped.
    throw new Error('Creator OS module missing from registry');
  }

  const [plan, pinnedNotes, recentNotes, posts, books, subscribers] =
    await Promise.all([
      loadAgenticOsPlan(CREATOR_SLUG),
      listNotes(user.userId, { isPinned: true, limit: 12 }),
      listNotes(user.userId, { limit: 20 }),
      listPosts(user.userId, { limit: 200 }),
      listBooks(user.userId),
      listSubscribers(user.userId, { limit: 500 }),
    ]);

  return (
    <DashboardHub
      module={mod}
      roadmapMarkdown={plan ?? null}
      dashboardSlot={
        <CreatorDashboard
          pinnedNotes={pinnedNotes}
          recentNotes={recentNotes}
          posts={posts}
          books={books}
          subscribers={subscribers}
        />
      }
    />
  );
}
