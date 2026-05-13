/**
 * Business OS Phase 6 — document form (create + edit).
 *
 * @license MIT — Tiresias Business OS Phase 6 (internal).
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { DocTemplate } from '@/lib/agentic-os/business/doc-templates';

interface ContactOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface DealOption {
  id: string;
  title: string;
}

interface ProjectOption {
  id: string;
  title: string;
}

interface Props {
  templates?: DocTemplate[];
  contacts?: ContactOption[];
  deals?: DealOption[];
  projects?: ProjectOption[];
  initialValues?: {
    id?: string;
    title?: string;
    templateId?: string | null;
    contactId?: string | null;
    projectId?: string | null;
    dealId?: string | null;
    bodyMd?: string;
  };
  onSuccess?: () => void;
}

export default function DocumentForm({
  templates = [],
  contacts = [],
  deals = [],
  projects = [],
  initialValues,
  onSuccess,
}: Props) {
  const router = useRouter();
  const isEdit = !!initialValues?.id;

  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [templateId, setTemplateId] = useState(initialValues?.templateId ?? '');
  const [contactId, setContactId] = useState(initialValues?.contactId ?? '');
  const [projectId, setProjectId] = useState(initialValues?.projectId ?? '');
  const [dealId, setDealId] = useState(initialValues?.dealId ?? '');
  const [bodyMd, setBodyMd] = useState(initialValues?.bodyMd ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTemplateChange = useCallback(
    (selectedId: string) => {
      setTemplateId(selectedId);
      if (selectedId) {
        const tpl = templates.find((t) => t.id === selectedId);
        if (tpl && !bodyMd) {
          setBodyMd(tpl.bodyMd);
        }
      }
    },
    [templates, bodyMd],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      const body: Record<string, unknown> = {
        title,
        template_id: templateId || null,
        contact_id: contactId || null,
        project_id: projectId || null,
        deal_id: dealId || null,
        body_md: bodyMd,
      };

      try {
        const url = isEdit
          ? `/api/tiresias/agentic-os/business/documents/${initialValues!.id}`
          : '/api/tiresias/agentic-os/business/documents';
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
    [title, templateId, contactId, projectId, dealId, bodyMd, isEdit, initialValues, onSuccess, router],
  );

  const inputClass =
    'w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#4361EE] focus:outline-none';
  const selectClass = inputClass;
  const labelClass = 'block text-xs text-[#94a3b8] mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-medium text-white">
        {isEdit ? 'Edit Document' : 'New Document'}
      </h2>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Title *</label>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="SOW — Q2 Security Assessment"
            required
          />
        </div>
        <div>
          <label className={labelClass}>Template</label>
          <select
            className={selectClass}
            value={templateId}
            onChange={(e) => handleTemplateChange(e.target.value)}
          >
            <option value="">-- None (blank) --</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} (v{t.version})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Contact</label>
          <select
            className={selectClass}
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
          >
            <option value="">-- None --</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Project</label>
          <select
            className={selectClass}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">-- None --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Deal</label>
          <select
            className={selectClass}
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
          >
            <option value="">-- None --</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>
        <div />
        <div className="md:col-span-2">
          <label className={labelClass}>Body (Markdown)</label>
          <textarea
            className={inputClass}
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            rows={12}
            placeholder="Document body in Markdown..."
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] text-white px-4 py-2 text-sm font-medium"
      >
        {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Document'}
      </button>
    </form>
  );
}
