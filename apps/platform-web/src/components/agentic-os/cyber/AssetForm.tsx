'use client';

/**
 * CyberSec OS — Asset editor (create + edit).
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Asset, AssetCriticality, AssetKind } from '@/lib/agentic-os/cyber/assets';
import { ASSET_KINDS, ASSET_CRITICALITIES } from '@/lib/agentic-os/cyber/assets';

const inputCls =
  'w-full rounded-md border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-[#94a3b8]/60 focus:border-[#4361EE] focus:outline-none';

const API = '/api/tiresias/agentic-os/cyber/assets';

export interface AssetFormProps {
  asset?: Asset | null;
  onSaved?: (asset: Asset) => void;
  onCancel?: () => void;
}

export function AssetForm({ asset, onSaved, onCancel }: AssetFormProps) {
  const router = useRouter();
  const [name, setName] = useState(asset?.name ?? '');
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? 'host');
  const [criticality, setCriticality] = useState<AssetCriticality>(
    asset?.criticality ?? 'medium',
  );
  const [environment, setEnvironment] = useState(asset?.environment ?? '');
  const [hostname, setHostname] = useState(asset?.hostname ?? '');
  const [ipAddress, setIpAddress] = useState(asset?.ipAddress ?? '');
  const [osFamily, setOsFamily] = useState(asset?.osFamily ?? '');
  const [osVersion, setOsVersion] = useState(asset?.osVersion ?? '');
  const [ownerEmail, setOwnerEmail] = useState(asset?.ownerEmail ?? '');
  const [tagsText, setTagsText] = useState((asset?.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!asset;

  async function save() {
    setSaving(true);
    setError(null);
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const body = {
      name,
      kind,
      criticality,
      environment: environment || null,
      hostname: hostname || null,
      ipAddress: ipAddress || null,
      osFamily: osFamily || null,
      osVersion: osVersion || null,
      ownerEmail: ownerEmail || null,
      tags,
    };
    try {
      const url = isEdit ? `${API}/${asset!.id}` : API;
      const r = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      const { asset: saved } = await r.json();
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
      className="space-y-4 rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="prod-web-01"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as AssetKind)}
            className={inputCls}
          >
            {ASSET_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Criticality</span>
          <select
            value={criticality}
            onChange={(e) => setCriticality(e.target.value as AssetCriticality)}
            className={inputCls}
          >
            {ASSET_CRITICALITIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Environment</span>
          <input
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            placeholder="prod / staging / dev"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Hostname</span>
          <input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="prod-web-01.example.com"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">IP address</span>
          <input
            value={ipAddress}
            onChange={(e) => setIpAddress(e.target.value)}
            placeholder="10.0.0.42"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">OS family</span>
          <input
            value={osFamily}
            onChange={(e) => setOsFamily(e.target.value)}
            placeholder="linux / windows / macos"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">OS version</span>
          <input
            value={osVersion}
            onChange={(e) => setOsVersion(e.target.value)}
            placeholder="22.04"
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Technical owner email</span>
          <input
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            placeholder="devops@example.com"
            className={inputCls}
            type="email"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs uppercase tracking-wide text-[#94a3b8] mb-1.5">Tags (comma-separated)</span>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="pci, customer-data, public-facing"
            className={inputCls}
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-lg bg-[#4361EE] hover:bg-[#3a56d4] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 text-sm transition"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create asset'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[#2a2d3e] text-[#94a3b8] hover:text-white px-3 py-1.5 text-sm transition"
          >
            Cancel
          </button>
        )}
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </form>
  );
}
