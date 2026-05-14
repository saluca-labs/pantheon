/**
 * Research OS Phase 5 — Protocol detail page.
 *
 * Header: title + version + kind + Bump-version button + tags.
 * Body: body_md via react-markdown (NO rehype-raw — XSS guard).
 * Sidebar: version history (parent_protocol_id walk).
 *
 * Each version is a separate row, so deep-linking to old versions
 * works — the route `[id]` resolves to whichever version the user
 * opens.
 *
 * @license MIT — Tiresias Research OS Phase 5 (internal).
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, FileText } from 'lucide-react';
import { getCurrentResearchUser } from '@/lib/agentic-os/research/session';
import {
  getProtocol,
  getProtocolTree,
} from '@/lib/agentic-os/research/protocols-repo';
import { ProtocolKindPill } from '@/components/agentic-os/research/protocol-kind-pill';
import { ProtocolVersionHistory } from '@/components/agentic-os/research/protocol-version-history';
import { ProtocolVersionBumpButton } from '@/components/agentic-os/research/protocol-version-bump-button';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProtocolDetailPage({ params }: Props) {
  const user = await getCurrentResearchUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const protocol = await getProtocol(id, user.userId);
  if (!protocol) notFound();
  const versions = await getProtocolTree(id, user.userId);

  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/os/research/protocols"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to protocols library
      </Link>

      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6 mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <FileText className="w-5 h-5 text-accent" />
              <h1 className="text-2xl font-semibold text-white">{protocol.title}</h1>
              <ProtocolKindPill kind={protocol.kind} />
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-accent/40 text-accent bg-accent/10">
                v{protocol.version}
              </span>
              {protocol.parentProtocolId == null && (
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
                  Root
                </span>
              )}
            </div>
            {protocol.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {protocol.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 border border-border-subtle text-text-secondary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {protocol.attachedUrls.length > 0 && (
              <div className="mt-3 space-y-1">
                {protocol.attachedUrls.map((u) => (
                  <a
                    key={u}
                    href={u}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block text-xs text-accent hover:underline break-all"
                  >
                    {u}
                  </a>
                ))}
              </div>
            )}
          </div>
          <ProtocolVersionBumpButton source={protocol} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,260px] gap-6">
        <article className="rounded-xl border border-border-subtle bg-surface-2 p-6">
          {protocol.bodyMd ? (
            <div
              className="prose prose-invert max-w-none text-sm"
              data-testid="protocol-detail-body"
            >
              <ReactMarkdown>{protocol.bodyMd}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-text-secondary italic">No body yet.</p>
          )}
        </article>
        <ProtocolVersionHistory protocol={protocol} versions={versions} />
      </div>
    </div>
  );
}
