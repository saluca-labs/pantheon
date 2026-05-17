/**
 * Business OS Phase 6 — single template detail page.
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GitBranch } from 'lucide-react';
import { getCurrentBusinessUser } from '@/lib/agentic-os/business/session';
import { getTemplate, listTemplates } from '@/lib/agentic-os/business/doc-templates-repo';
import type { DocTemplate } from '@/lib/agentic-os/business/doc-templates';
import TemplateForm from '@/components/agentic-os/business/template-form';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

function BumpVersionButton({ id }: { id: string }) {
  return (
    <Link
      href={`/api/tiresias/agentic-os/business/templates/${id}/versions`}
      className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-white text-sm font-medium px-4 py-2 transition-colors"
    >
      <GitBranch className="w-4 h-4" />
      Bump version
    </Link>
  );
}

export default async function TemplateDetailPage({ params }: Props) {
  const user = await getCurrentBusinessUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const template = await getTemplate(id, user.userId);
  if (!template) notFound();

  // Find version history: other templates with this one as parent or siblings
  const [children, siblings] = await Promise.all([
    listTemplates(user.userId, { limit: 100 }),
    Promise.resolve([] as DocTemplate[]),
  ]);

  const versionHistory = children.filter(
    (t) => t.parentTemplateId === id || t.id === template.parentTemplateId,
  );

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/business/templates"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Templates
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">{template.title}</h1>
        <div className="flex items-center gap-2">
          <form
            action={async () => {
              'use server';
              const { bumpVersion } = await import(
                '@/lib/agentic-os/business/doc-templates-repo'
              );
              await bumpVersion(id, user.userId);
            }}
          >
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-white text-sm font-medium px-4 py-2 transition-colors"
            >
              <GitBranch className="w-4 h-4" />
              Bump version
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border-subtle bg-surface-2 p-6">
            <TemplateForm
              initialValues={{
                id: template.id,
                title: template.title,
                kind: template.kind,
                bodyMd: template.bodyMd,
                version: template.version,
                tags: template.tags,
              }}
            />
          </div>
        </div>

        {/* Version history sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
              Version History
            </h3>
            {versionHistory.length > 0 ? (
              <div className="space-y-2">
                {versionHistory.map((v) => (
                  <Link
                    key={v.id}
                    href={`/dashboard/os/business/templates/${v.id}`}
                    className={`block rounded-lg border px-3 py-2 text-xs transition-colors ${
                      v.id === id
                        ? 'border-accent bg-accent/10'
                        : 'border-border-subtle bg-surface-0 hover:border-accent/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium">v{v.version}</span>
                      <span className="text-text-tertiary font-mono">
                        {v.updatedAt.slice(0, 10)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-tertiary">
                This is the only version. Bump to create a new version.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
