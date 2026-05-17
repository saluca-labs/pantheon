/**
 * Autobiographer OS — hub page.
 *
 * Server component. Wave E-2 (UI Depth Wave coherence pass): the bespoke
 * header + sectioned-cards layout — hand-rolled icon/title header with
 * inline "New book" action, stat widgets, recent-activity DashboardWidget,
 * BookList, "Workshop" memory + people jump-off cards, and a filtered
 * "More surfaces" grid — that pre-dated the primitive-aware
 * `DashboardHub` is retired. The hub now renders through the shared
 * `DashboardHub` shell like the rest of the suite:
 *   - `module`          — drives the icon / name / status badge / tagline /
 *                         description header and the registry feature grid
 *                         (Hub, Memories, People, Chapters, Voice, Timeline,
 *                         Coach, Privacy).
 *   - `dashboardSlot`   — the Autobiographer dashboard region: the
 *                         quick-create "New book" action, the four
 *                         aggregate-stat widget tiles, the merged
 *                         recent-activity feed, and the books list.
 *                         The escape hatch is used (rather than the
 *                         declarative `dashboard` prop) because the
 *                         quick-create interactivity, recent-activity
 *                         footer link, and the BookList client filter
 *                         chips can't be expressed by the
 *                         widgets+chart+activity declarative slots.
 *
 * Same data, same routes, same counts, same status mixes, same empty
 * states, same quick-create behavior — presentation layer only.
 *
 * @license MIT — Tiresias Autobiographer OS (internal).
 */

import { redirect } from 'next/navigation';
import { findAgenticOsModule } from '@/lib/agentic-os/registry';
import { DashboardHub } from '@/components/agentic-os/_shared/dashboard-hub';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { listBooks } from '@/lib/agentic-os/autobiographer/books-repo';
import {
  listMemories,
  countMemoriesForUser,
} from '@/lib/agentic-os/autobiographer/memories-repo';
import {
  listPeople,
  countPeopleForUser,
} from '@/lib/agentic-os/autobiographer/people-repo';
import {
  listChaptersForUser,
  countChaptersForUser,
} from '@/lib/agentic-os/autobiographer/chapters-repo';
import { AutobiographerDashboard } from '@/components/agentic-os/autobiographer/autobiographer-dashboard';

export const dynamic = 'force-dynamic';

const AUTO_SLUG = 'autobiographer';

export default async function AutobiographerHubPage() {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');

  const mod = findAgenticOsModule(AUTO_SLUG);
  if (!mod) {
    throw new Error('Autobiographer OS module missing from registry');
  }

  const [
    books,
    recentMemories,
    people,
    recentChapters,
    chapterCount,
    memoryCount,
    peopleCount,
  ] = await Promise.all([
    listBooks({ userId: user.userId, limit: 50 }),
    listMemories({ userId: user.userId, limit: 5 }),
    listPeople({ userId: user.userId, limit: 5 }),
    listChaptersForUser(user.userId, { limit: 5 }),
    countChaptersForUser(user.userId),
    countMemoriesForUser(user.userId),
    countPeopleForUser(user.userId),
  ]);

  return (
    <DashboardHub
      module={mod}
      dashboardSlot={
        <AutobiographerDashboard
          books={books}
          recentMemories={recentMemories}
          people={people}
          recentChapters={recentChapters}
          chapterCount={chapterCount}
          memoryCount={memoryCount}
          peopleCount={peopleCount}
        />
      }
    />
  );
}
