'use client';

/**
 * CyberSec OS — Detection rule editor (create + edit).
 *
 * Full editor with lifecycle, severity, tactic + technique, log_source_kind,
 * false-positives + references + tags chip inputs, and — Wave D — a
 * CodeMirror-hosted `SigmaDetectionEditor` for the `detection` body with
 * Sigma-key / JSON syntax highlighting and on-blur JSON.parse validation
 * (replacing the prior plain `<textarea>`).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  DetectionRule,
  DetectionLifecycle,
  DetectionLogSourceKind,
  DetectionSeverity,
} from '@/lib/agentic-os/cyber/detections';
import {
  DETECTION_LIFECYCLES,
  DETECTION_LOG_SOURCE_KIND_VALUES,
  DETECTION_SEVERITIES,
  ATTACK_TACTICS,
} from '@/lib/agentic-os/cyber/detections';
import { SigmaDetectionEditor } from './SigmaDetectionEditor';

const inputCls =
  'w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-white placeholder:text-text-secondary/60 focus:border-accent focus:outline-none';

const API = '/api/tiresias/agentic-os/cyber/detections';

export interface DetectionRuleFormProps {
  rule?: DetectionRule | null;
  onSaved?: (r: DetectionRule) => void;
  onCancel?: () => void;
}

export function DetectionRuleForm({ rule, onSaved, onCancel }: DetectionRuleFormProps) {
  const router = useRouter();
  const isEdit = !!rule;

  const [name, setName] = useState(rule?.name ?? '');
  const [description, setDescription] = useState(rule?.description ?? '');
  const [author, setAuthor] = useState(rule?.author ?? '');
  const [lifecycle, setLifecycle] = useState<DetectionLifecycle>(rule?.lifecycle ?? 'draft');
  const [severity, setSeverity] = useState<DetectionSeverity>(rule?.severity ?? 'medium');
  const [tactic, setTactic] = useState(rule?.tactic ?? '');
  const [technique, setTechnique] = useState(rule?.technique ?? '');
  const [logSourceKind, setLogSourceKind] = useState<DetectionLogSourceKind | ''>(
    rule?.logSourceKind ?? '',
  );
  const [detectionText, setDetectionText] = useState(
    JSON.stringify(rule?.detection ?? {}, null, 2),
  );
  const [detectionJsonError, setDetectionJsonError] = useState<string | null>(null);
  const [falsePositivesText, setFalsePositivesText] = useState(
    (rule?.falsePositives ?? []).join('\n'),
  );
  const [referencesText, setReferencesText] = useState((rule?.references ?? []).join('\n'));
  const [tagsText, setTagsText] = useState((rule?.tags ?? []).join(', '));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseDetection(): Record<string, unknown> | null {
    if (detectionText.trim().length === 0) return {};
    try {
      const parsed = JSON.parse(detectionText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async function save() {
    const detection = parseDetection();
    if (detection === null) {
      setDetectionJsonError('Invalid JSON object');
      return;
    }
    setSaving(true);
    setError(null);
    const falsePositives = falsePositivesText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const references = referencesText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const tags = tagsText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const body = {
      name,
      description: description || null,
      author: author || null,
      lifecycle,
      severity,
      tactic: tactic || null,
      technique: technique || null,
      logSourceKind: logSourceKind === '' ? null : logSourceKind,
      detection,
      falsePositives,
      references,
      tags,
    };
    try {
      const url = isEdit ? `${API}/${rule!.id}` : API;
      const r = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { rule: saved } = await r.json();
      onSaved?.(saved);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-4 rounded-xl border border-border-subtle bg-surface-2 p-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="SSH brute force — multiple failed logins"
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What this rule detects and why it matters…"
            className={inputCls + ' resize-y leading-relaxed'}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Author</span>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="alice@example.com"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Lifecycle</span>
          <select
            value={lifecycle}
            onChange={(e) => setLifecycle(e.target.value as DetectionLifecycle)}
            className={inputCls}
          >
            {DETECTION_LIFECYCLES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Severity</span>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as DetectionSeverity)}
            className={inputCls}
          >
            {DETECTION_SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">Log source kind</span>
          <select
            value={logSourceKind}
            onChange={(e) => setLogSourceKind(e.target.value as DetectionLogSourceKind | '')}
            className={inputCls}
          >
            <option value="">(none)</option>
            {DETECTION_LOG_SOURCE_KIND_VALUES.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">MITRE tactic</span>
          <select
            value={tactic}
            onChange={(e) => setTactic(e.target.value)}
            className={inputCls}
          >
            <option value="">(none)</option>
            {ATTACK_TACTICS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">MITRE technique</span>
          <input
            value={technique}
            onChange={(e) => setTechnique(e.target.value)}
            placeholder="T1110"
            className={inputCls}
          />
        </label>
        <div className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
            Sigma detection body (JSON)
          </span>
          <div className="overflow-hidden rounded-md border border-border-subtle focus-within:border-accent">
            <SigmaDetectionEditor
              initialText={detectionText}
              onChange={setDetectionText}
              onValidityChange={(valid) =>
                setDetectionJsonError(valid ? null : 'Invalid JSON object')
              }
              height="220px"
            />
          </div>
          <p className="mt-1 text-[11px] text-text-secondary">
            Sigma-style detection block — <code>condition</code> +{' '}
            named search identifiers (<code>selection</code>,{' '}
            <code>filter</code>). Stored as JSON; syntax-highlighted on the
            fly.
          </p>
          {detectionJsonError && (
            <span className="block mt-1 text-[11px] text-red-300">{detectionJsonError}</span>
          )}
        </div>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
            False positives (one per line)
          </span>
          <textarea
            value={falsePositivesText}
            onChange={(e) => setFalsePositivesText(e.target.value)}
            rows={3}
            placeholder={'CI runners doing rapid SSH probes\nMisconfigured monitoring agents'}
            className={inputCls + ' resize-y'}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
            References (one URL per line)
          </span>
          <textarea
            value={referencesText}
            onChange={(e) => setReferencesText(e.target.value)}
            rows={2}
            placeholder="https://attack.mitre.org/techniques/T1110/"
            className={inputCls + ' resize-y'}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-text-secondary mb-1.5">
            Tags (comma-separated)
          </span>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="ssh, brute-force, credential-access"
            className={inputCls}
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim() || detectionJsonError !== null}
          className="rounded-lg bg-accent hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create rule'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border-subtle text-text-secondary hover:text-white px-3 py-1.5 text-sm transition"
          >
            Cancel
          </button>
        )}
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </form>
  );
}
