'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, MessageSquare, X } from 'lucide-react';
import type { CreatorConversation } from '@/lib/agentic-os/creator/chat';
import { Spinner } from '@/components/agentic-os/_shared/views';

interface ChatSidebarProps {
  conversations: CreatorConversation[];
  activeId?: string;
}

export function ChatSidebar({ conversations, activeId }: ChatSidebarProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleNew = async () => {
    setCreating(true);
    try {
      const res = await fetch(
        '/api/tiresias/agentic-os/creator/chat/conversations',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) throw new Error('Failed to create');
      const data = await res.json();
      router.push(`/dashboard/os/creator/chat/${data.conversation.id}`);
    } catch (err) {
      console.error('Failed to create conversation', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/creator/chat/conversations/${id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Failed to delete');
      if (activeId === id) {
        router.push('/dashboard/os/creator/chat');
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error('Failed to delete conversation', err);
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  const modelLabel = (model: string) => {
    if (model === 'claude-sonnet-4-6') return 'Sonnet';
    if (model === 'claude-opus-4-7') return 'Opus';
    if (model === 'claude-haiku-4-5') return 'Haiku';
    if (model === 'gpt-4o') return 'GPT-4o';
    if (model === 'gpt-4o-mini') return 'GPT-4oM';
    if (model.startsWith('ollama/')) return model.replace('ollama/', '').split(':')[0];
    return model;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full w-72 border-r border-border-subtle bg-surface-1/50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border-subtle">
        <h2 className="text-sm font-semibold text-text-primary tracking-tight">
          Conversations
        </h2>
        <button
          type="button"
          onClick={handleNew}
          disabled={creating}
          className="inline-flex items-center gap-1 rounded-md bg-os-creator px-2 py-1 text-xs font-medium text-white hover:bg-os-creator/90 disabled:opacity-50 transition-colors"
        >
          {creating ? (
            <Spinner label="Creating" size="xs" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          New
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {conversations.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <MessageSquare className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
            <p className="text-sm text-text-tertiary">No conversations yet</p>
            <button
              type="button"
              onClick={handleNew}
              className="mt-3 text-xs text-os-creator hover:text-os-creator/80 transition-colors"
            >
              Start your first chat
            </button>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group relative flex items-center gap-2 px-3 py-2 mx-1 rounded-md transition-colors ${
                activeId === conv.id
                  ? 'bg-surface-2 text-text-primary'
                  : 'text-text-secondary hover:bg-surface-2/50 hover:text-text-primary'
              }`}
            >
              <Link
                href={`/dashboard/os/creator/chat/${conv.id}`}
                className="flex-1 min-w-0"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm truncate">
                    {conv.title}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] px-1 py-0.5 rounded bg-surface-3/50 text-text-secondary font-mono">
                    {modelLabel(conv.model)}
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    {formatDate(conv.updatedAt)}
                  </span>
                </div>
              </Link>

              {/* Delete */}
              {confirmDelete === conv.id ? (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleDelete(conv.id)}
                    disabled={deleting === conv.id}
                    className="p-1 rounded text-danger hover:bg-danger/10 transition-colors"
                  >
                    {deleting === conv.id ? (
                      <Spinner label="Deleting" size="sm" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(null)}
                    className="p-1 rounded text-text-tertiary hover:text-text-secondary transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(conv.id)}
                  className="p-1 rounded text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
