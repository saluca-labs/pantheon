'use client';

/**
 * Creator OS Phase 2 — Post list component.
 *
 * Renders a filterable list of publishing posts with status badges,
 * date display, and tag chips. Supports tab-based status filtering.
 *
 * @license MIT — Tiresias Creator OS Phase 2 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, FileEdit, Calendar, Archive, Eye } from 'lucide-react';
import type { CreatorPost, PostStatus } from '@/lib/agentic-os/creator/posts';
import { POST_STATUSES } from '@/lib/agentic-os/creator/posts';

interface PostListProps {
  posts: CreatorPost[];
}

const STATUS_COLORS: Record<PostStatus, string> = {
  idea: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  draft: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  scheduled: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  published: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  archived: 'bg-neutral-500/15 text-neutral-400 border-neutral-500/30',
};

const STATUS_ICONS: Record<PostStatus, React.ReactNode> = {
  idea: <Eye className="w-3 h-3" />,
  draft: <FileEdit className="w-3 h-3" />,
  scheduled: <Calendar className="w-3 h-3" />,
  published: <Eye className="w-3 h-3" />,
  archived: <Archive className="w-3 h-3" />,
};

type FilterTab = 'all' | PostStatus;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'archived', label: 'Archived' },
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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d946ef] text-white text-sm font-medium hover:bg-[#c026d3] disabled:opacity-50 transition"
        >
          <Plus className="w-4 h-4" />
          {creating ? 'Creating…' : 'New Post'}
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary/60" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search posts by title, excerpt, or tags…"
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-border-subtle bg-surface-2 text-sm text-white placeholder:text-text-secondary/40 focus:border-[#d946ef] outline-none"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 rounded-lg bg-surface-2 border border-border-subtle w-fit">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.key === 'all'
              ? posts.length
              : posts.filter((p) => p.status === tab.key).length;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === tab.key
                  ? 'bg-[#d946ef]/20 text-[#d946ef]'
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 text-[10px] opacity-60">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Post list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface-2 px-5 py-10 text-center">
          <FileEdit className="w-8 h-8 text-text-secondary/40 mx-auto mb-3" />
          <p className="text-sm text-text-secondary">
            {searchQuery ? 'No posts match your search.' : 'No posts yet. Create your first post to get started.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface-2 divide-y divide-border-subtle">
          {filtered.map((post) => (
            <button
              key={post.id}
              type="button"
              onClick={() => router.push(`/dashboard/os/creator/posts/${post.id}`)}
              className="w-full text-left px-5 py-4 hover:bg-[#222633] transition group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white truncate group-hover:text-[#d946ef] transition">
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
