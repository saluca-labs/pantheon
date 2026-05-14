/**
 * Business OS Phase 6 — single document detail page.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, XCircle, Download } from 'lucide-react';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { getDocument } from '@/lib/agentic-os/business/documents-repo';
import { getTemplate } from '@/lib/agentic-os/business/doc-templates-repo';
import { getPerson } from '@/lib/agentic-os/business/people-repo';
import { listSignatures } from '@/lib/agentic-os/business/signatures-repo';
import SignaturePanel from '@/components/agentic-os/business/signature-panel';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

const statusColors: Record<string, string> = {
  draft: 'bg-slate-900/40 text-slate-300 border-slate-800',
  sent: 'bg-blue-900/40 text-blue-300 border-blue-800',
  signed: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  declined: 'bg-red-900/40 text-red-300 border-red-800',
  expired: 'bg-amber-900/40 text-amber-300 border-amber-800',
};

async function sendDocumentAction(id: string, userId: string) {
  'use server';
  const { sendDocument } = await import(
    '@/lib/agentic-os/business/documents-repo'
  );
  await sendDocument(id, userId);
}

async function declineDocumentAction(id: string, userId: string) {
  'use server';
  const { declineDocument } = await import(
    '@/lib/agentic-os/business/documents-repo'
  );
  await declineDocument(id, userId);
}

export default async function DocumentDetailPage({ params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const document = await getDocument(id, user.userId);
  if (!document) notFound();

  const [template, contact, signatures] = await Promise.all([
    document.templateId ? getTemplate(document.templateId, user.userId) : null,
    document.contactId ? getPerson(document.contactId, user.userId) : null,
    listSignatures(id, user.userId),
  ]);

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/business/documents"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Documents
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">{document.title}</h1>
          <span
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${
              statusColors[document.status] ?? statusColors.draft
            }`}
          >
            {document.status.charAt(0).toUpperCase() + document.status.slice(1)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {document.status === 'draft' && (
            <form action={sendDocumentAction.bind(null, id, user.userId)}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-[#3a56d4] text-white text-sm font-medium px-4 py-2"
              >
                <Send className="w-4 h-4" />
                Send to Counterparty
              </button>
            </form>
          )}
          {document.status === 'sent' && (
            <form action={declineDocumentAction.bind(null, id, user.userId)}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/20 hover:bg-red-900/30 text-red-400 text-sm font-medium px-4 py-2"
              >
                <XCircle className="w-4 h-4" />
                Decline
              </button>
            </form>
          )}
          {(document.status === 'signed' || document.status === 'sent') && (
            <a
              href={`/api/tiresias/agentic-os/business/documents/${id}/export.pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 hover:bg-[#252836] text-text-secondary hover:text-white text-sm font-medium px-4 py-2"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </a>
          )}
        </div>
      </div>

      {/* Meta card */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-5 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] text-[#64748b] uppercase mb-1">Template</p>
            <p className="text-xs text-text-secondary">
              {template ? `${template.title} (v${template.version})` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#64748b] uppercase mb-1">Contact</p>
            <p className="text-xs text-text-secondary">
              {contact ? `${contact.firstName} ${contact.lastName}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#64748b] uppercase mb-1">Sent</p>
            <p className="text-xs text-text-secondary font-mono">
              {document.sentAt ? document.sentAt.slice(0, 10) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#64748b] uppercase mb-1">Signed</p>
            <p className="text-xs text-text-secondary font-mono">
              {document.signedAt ? document.signedAt.slice(0, 10) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6 mb-6">
        <h3 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-3">
          Document Body
        </h3>
        <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
          {document.bodyMd || 'No content.'}
        </div>
      </div>

      {/* Signature panel */}
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-6 mb-6">
        <SignaturePanel document={document} />
      </div>

      {/* Existing signatures */}
      {signatures && signatures.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-surface-2 p-6">
          <h3 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-3">
            Captured Signatures
          </h3>
          <div className="space-y-3">
            {signatures.map((sig) => (
              <div
                key={sig.id}
                className="rounded-lg border border-border-subtle bg-surface-0 px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm text-white">{sig.signerName}</p>
                  <p className="text-xs text-[#64748b]">
                    {sig.signerRole} — {sig.signedAt.slice(0, 10)}
                  </p>
                </div>
                <img
                  src={sig.signatureImageUrl}
                  alt={`Signature of ${sig.signerName}`}
                  className="h-10 max-w-[160px] object-contain opacity-80"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
