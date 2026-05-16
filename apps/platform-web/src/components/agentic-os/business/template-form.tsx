/**
 * Business OS Phase 6 — template form (create + edit).
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

'use client';

import { useId, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DOC_TEMPLATE_KINDS } from '@/lib/agentic-os/business/doc-templates';
import type { DocTemplateKind } from '@/lib/agentic-os/business/doc-templates';

interface Props {
  initialValues?: {
    id?: string;
    title?: string;
    kind?: DocTemplateKind;
    bodyMd?: string;
    version?: string;
    tags?: string[];
  };
  onSuccess?: () => void;
  compact?: boolean;
}

export default function TemplateForm({
  initialValues,
  onSuccess,
  compact = false,
}: Props) {
  const router = useRouter();
  const isEdit = !!initialValues?.id;

  const [kind, setKind] = useState<DocTemplateKind>(initialValues?.kind ?? 'sow');
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [bodyMd, setBodyMd] = useState(initialValues?.bodyMd ?? '');
  const [version, setVersion] = useState(initialValues?.version ?? '1.0');
  const [tagsStr, setTagsStr] = useState((initialValues?.tags ?? []).join(', '));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const idBase = useId();
  const fid = (slug: string) => `${idBase}-${slug}`;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      const tags = tagsStr
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const body: Record<string, unknown> = {
        title,
        kind,
        body_md: bodyMd,
        version,
        tags,
      };

      try {
        const url = isEdit
          ? `/api/tiresias/agentic-os/business/templates/${initialValues!.id}`
          : '/api/tiresias/agentic-os/business/templates';
        const method = isEdit ? 'PATCH' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setError(err.error || 'Request failed');
          return;
        }

        onSuccess?.();
        router.refresh();
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    },
    [kind, title, bodyMd, version, tagsStr, isEdit, initialValues, onSuccess, router],
  );

  const inputClass =
    'w-full rounded-lg border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder-text-tertiary focus:border-accent focus:outline-none';
  const selectClass = inputClass;
  const labelClass = 'block text-xs text-text-secondary mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!compact && (
        <h2 className="text-lg font-medium text-white">
          {isEdit ? 'Edit Template' : 'New Template'}
        </h2>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <div className={compact ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
        <div>
          <label htmlFor={fid('kind')} className={labelClass}>Kind</label>
          <select
            id={fid('kind')}
            className={selectClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as DocTemplateKind)}
          >
            {DOC_TEMPLATE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k === '1099' ? '1099' : k.replace('_', ' ').toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={fid('title')} className={labelClass}>Title *</label>
          <input
            id={fid('title')}
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Standard Mutual NDA"
            required
          />
        </div>
        {!compact && (
          <div className="md:col-span-2">
            <label htmlFor={fid('body-md')} className={labelClass}>Body (Markdown)</label>
            <textarea
              id={fid('body-md')}
              className={inputClass}
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              rows={10}
              placeholder="Write your template body in Markdown. Use {{client_name}}, {{project_title}}, {{rate}}, {{total}} for variable substitution."
            />
          </div>
        )}
        <div>
          <label htmlFor={fid('version')} className={labelClass}>Version</label>
          <input
            id={fid('version')}
            className={inputClass}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0"
          />
        </div>
        <div>
          <label htmlFor={fid('tags')} className={labelClass}>Tags</label>
          <input
            id={fid('tags')}
            className={inputClass}
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            placeholder="legal, standard (comma separated)"
          />
        </div>
      </div>

      {compact && (
        <div>
          <label htmlFor={fid('body-md-compact')} className={labelClass}>Body (Markdown)</label>
          <textarea
            id={fid('body-md-compact')}
            className={inputClass}
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            rows={8}
            placeholder="Write your template body in Markdown..."
          />
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-accent hover:bg-accent/90 text-white px-4 py-2 text-sm font-medium"
      >
        {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Template'}
      </button>
    </form>
  );
}
