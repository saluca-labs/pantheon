'use client';

/**
 * Creator OS Phase 2 — Post list component.
 *
 * Renders a filterable list of publishing posts with status badges,
 * date display, and tag chips. Supports tab-based status filtering.
 *
 * Wave C-4a (UI Depth Wave): the ad-hoc search input is now the shared
 * `EntitySearch` primitive, the status tabs are mirrored by `SavedViews`
 * quick-presets, and the zero-data / no-match states use `EmptyState`.
 * Behavior is preserved — same filtering, same routes, same create flow.
 *
 * @license MIT — Tiresias Creator OS Phase 2 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileEdit, Calendar, Archive, Eye } from 'lucide-react';
import {
  EntitySearch,
  SavedViews,
  EmptyState,
} from '@/components/agentic-os/_shared/views';
import type { SavedView } from '@/components/agentic-os/_shared/views';
import type { CreatorPost, PostStatus } from '@/lib/agentic-os/creator/posts';

interface PostListProps {
  posts: CreatorPost[];
}

const STATUS_COLORS: Record<PostStatus, string> = {
  idea: 'bg-text-secondary/15 text-text-secondary border-text-secondary/30',
  draft: 'bg-accent/15 text-accent border-accent/30',
  scheduled: 'bg-warning/15 text-warning border-warning/30',
  published: 'bg-positive/15 text-positive border-positive/30',
  archived: 'bg-text-secondary/15 text-text-secondary border-text-secondary/30',
};

const STATUS_ICONS: Record<PostStatus, React.ReactNode> = {
  idea: <Eye className="w-3 h-3" />,
  draft: <FileEdit className="w-3 h-3" />,
  scheduled: <Calendar className="w-3 h-3" />,
  published: <Eye className="w-3 h-3" />,
  archived: <Archive className="w-3 h-3" />,
};

type FilterTab = 'all' | PostStatus;

/** Status quick-presets — surfaced as `SavedViews` pills. */
const STATUS_VIEWS: SavedView<FilterTab>[] = [
  { id: 'draft', name: 'Drafts', query: 'draft' },
  { id: 'scheduled', name: 'Scheduled', query: 'scheduled' },
  { id: 'published', name: 'Published', query: 'published' },
  { id: 'archived', name: 'Archived', query: 'archived' },
];

export function PostList({ posts }: PostListProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = posts.filter((p) => {
    if (activeTab !== 'all' && p.status !== activeTab) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        (p.excerpt ?? '').toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  async function handleNewPost() {
    setCreating(true);
    try {
      const res = await fetch('/api/tiresias/agentic-os/creator/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Post' }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/dashboard/os/creator/posts/${data.post.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Publishing</h1>
          <p className="text-sm text-text-secondary">
            Blog posts and newsletter content with scheduling, RSS, and subscriber management.
          </p>
        </div>
        <button
          type="button"
          onClick={handleNewPost}
          disabled={creating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-os-creator text-white text-sm font-medium hover:bg-os-creator/90 disabled:opacity-50 transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Creating…' : 'New Post'}
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <EntitySearch
          placeholder="Search posts by title, excerpt, or tags…"
          defaultValue={searchQuery}
          onQueryChange={setSearchQuery}
        />
      </div>

      {/* Status quick-presets */}
      <div className="mb-6">
        <SavedViews<FilterTab>
          views={STATUS_VIEWS}
          activeViewId={activeTab === 'all' ? null : activeTab}
          currentQuery={activeTab}
          slug="creator"
          allViewsLabel="All"
          onClearView={() => setActiveTab('all')}
          onSelectView={(view) => setActiveTab(view.query)}
          onSaveView={() => {
            /* status presets are fixed — saving a custom view is a Wave E concern */
          }}
        />
      </div>

      {/* Post list */}
      {filtered.length === 0 ? (
        searchQuery || activeTab !== 'all' ? (
          <EmptyState
            icon={<FileEdit className="h-6 w-6" />}
            title="No posts match"
            description="Loosen the search or status filter to see more."
          />
        ) : (
          <EmptyState
            icon={<FileEdit className="h-6 w-6" />}
            title="No posts yet"
            description="Draft your first post to start publishing and building your audience."
            primaryCta={{
              label: creating ? 'Creating…' : 'New Post',
              onClick: handleNewPost,
              icon: <Plus className="h-4 w-4" />,
            }}
          />
        )
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface-2 divide-y divide-border-subtle">
          {filtered.map((post) => (
            <button
              key={post.id}
              type="button"
              onClick={() => router.push(`/dashboard/os/creator/posts/${post.id}`)}
              className="w-full text-left px-5 py-4 hover:bg-surface-3 transition group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white truncate group-hover:text-os-creator transition">
                    {post.title || 'Untitled'}
                  </h3>
                  {post.excerpt && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                      {post.excerpt}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${STATUS_COLORS[post.status]}`}
                    >
                      {STATUS_ICONS[post.status]}
                      {post.status}
                    </span>
                    {post.status === 'scheduled' && post.scheduledAt && (
                      <span className="text-[10px] text-text-secondary">
                        {new Date(post.scheduledAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    )}
                    {post.publishedAt && (
                      <span className="text-[10px] text-text-secondary">
                        Published {new Date(post.publishedAt).toLocaleDateString()}
                      </span>
                    )}
                    <span className="text-[10px] text-text-secondary/60">
                      Updated {new Date(post.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Tags */}
                {post.tags.length > 0 && (
                  <div className="hidden sm:flex flex-wrap gap-1 items-start flex-shrink-0">
                    {post.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-border-subtle text-text-secondary"
                      >
                        {tag}
                      </span>
                    ))}
                    {post.tags.length > 3 && (
                      <span className="text-[10px] text-text-secondary/60">
                        +{post.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
