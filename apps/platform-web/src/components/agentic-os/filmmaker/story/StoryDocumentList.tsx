'use client';

/**
 * Filmmaker OS — StoryDocumentList.
 *
 * Sidebar list of a project's story documents, grouped by `kind`. Each
 * kind section shows existing documents with a "+ New" button to mint
 * another one of that kind. Empty kinds render a "Create a {Label}" CTA
 * with the kind's description.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, FileText } from 'lucide-react';
import {
  STORY_DOCUMENT_KINDS,
  type StoryDocument,
  type StoryDocumentKind,
} from '@/lib/agentic-os/filmmaker/story-documents';

interface Props {
  projectId: string;
  initialDocuments: StoryDocument[];
  activeDocumentId?: string;
}

export function StoryDocumentList({ projectId, initialDocuments, activeDocumentId }: Props) {
  const router = useRouter();
  const [documents, setDocuments] = useState<StoryDocument[]>(initialDocuments);
  const [creatingKind, setCreatingKind] = useState<StoryDocumentKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function createDocument(kind: StoryDocumentKind) {
    setCreatingKind(kind);
    setError(null);
    try {
      const r = await fetch(
        `/api/tiresias/agentic-os/filmmaker/projects/${projectId}/story-documents`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind }),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Create failed (${r.status})`);
      }
      const data = (await r.json()) as { document: StoryDocument };
      setDocuments((prev) => [data.document, ...prev]);
      startTransition(() => {
        router.push(
          `/dashboard/os/filmmaker/projects/${projectId}/story/${data.document.id}`,
        );
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreatingKind(null);
    }
  }

  return (
    <div className="space-y-5">
      {STORY_DOCUMENT_KINDS.map(({ kind, label, description }) => {
        const docs = documents.filter((d) => d.kind === kind);
        return (
          <section key={kind} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-white uppercase tracking-wide">
                  {label}
                </h3>
                <p className="text-[11px] text-text-secondary mt-0.5">{description}</p>
              </div>
              <button
                type="button"
                onClick={() => createDocument(kind)}
                disabled={creatingKind === kind}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border-subtle bg-surface-0 text-text-primary hover:text-white hover:border-accent/60 disabled:opacity-50 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                {creatingKind === kind ? 'Creating…' : 'New'}
              </button>
            </div>

            {docs.length === 0 ? (
              <button
                type="button"
                onClick={() => createDocument(kind)}
                disabled={creatingKind === kind}
                className="w-full rounded-lg border border-dashed border-border-subtle bg-surface-2/40 p-3 text-left hover:border-accent/60 transition disabled:opacity-50"
              >
                <p className="text-sm text-white">Create a {label}</p>
                <p className="text-xs text-text-secondary mt-0.5">{description}</p>
              </button>
            ) : (
              <ul className="space-y-1">
                {docs.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      href={`/dashboard/os/filmmaker/projects/${projectId}/story/${doc.id}`}
                      className={[
                        'block rounded-lg border p-2.5 transition',
                        doc.id === activeDocumentId
                          ? 'border-accent/60 bg-accent/10'
                          : 'border-border-subtle bg-surface-2 hover:border-accent/40',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                        <span className="text-sm text-white truncate">{doc.title}</span>
                      </div>
                      <p className="text-[11px] text-text-secondary mt-1">
                        {doc.wordCount.toLocaleString()} words · v{doc.version}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
