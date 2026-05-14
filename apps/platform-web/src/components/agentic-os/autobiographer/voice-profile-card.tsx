'use client';

/**
 * Autobiographer OS — VoiceProfileCard.
 *
 * One row in the Voice Studio profile list. Shows version, built_at,
 * sample_count + sample_word_count, builder attribution, an "Activate"
 * CTA (when not currently active), a "Delete" affordance, and the
 * collapsible JSON view (style_summary + style_rules + style_adjectives
 * + example_openings).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Power, Trash2 } from 'lucide-react';
import { VoiceProfileJsonView } from './voice-profile-json-view';

export interface VoiceProfileCardData {
  id: string;
  version: number;
  isActive: boolean;
  styleSummary: string;
  styleAdjectives: string[];
  styleRules: string[];
  exampleOpenings: string[];
  sampleCount: number;
  sampleWordCount: number;
  builder: string;
  builtAt: string;
}

export interface VoiceProfileCardProps {
  profile: VoiceProfileCardData;
}

export function VoiceProfileCard({ profile }: VoiceProfileCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<'activate' | 'delete' | null>(null);

  async function activate() {
    setBusy('activate');
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/voice-profiles/${profile.id}/activate`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `${res.status} ${res.statusText}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (
      !confirm(
        `Delete voice profile v${profile.version}? This cannot be undone; previously built profiles will still exist.`,
      )
    ) {
      return;
    }
    setBusy('delete');
    try {
      const res = await fetch(
        `/api/tiresias/agentic-os/autobiographer/voice-profiles/${profile.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `${res.status} ${res.statusText}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <article
      className={`rounded-xl border bg-surface-2 p-4 space-y-3 ${
        profile.isActive
          ? 'border-emerald-500/40 ring-1 ring-emerald-500/20'
          : 'border-border-subtle'
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">
              Version {profile.version}
            </h3>
            {profile.isActive && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" />
                Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-text-secondary">
            <span>{new Date(profile.builtAt).toLocaleString()}</span>
            <span>•</span>
            <span>{profile.sampleCount} samples</span>
            <span>•</span>
            <span>{profile.sampleWordCount.toLocaleString()} words</span>
            <span>•</span>
            <span className="font-mono text-[10px] text-[#64748b] truncate max-w-[12rem]">
              {profile.builder}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!profile.isActive && (
            <button
              type="button"
              onClick={activate}
              disabled={busy !== null}
              className="text-xs px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:text-white hover:bg-emerald-500/20 disabled:opacity-50 inline-flex items-center gap-1.5 transition"
            >
              <Power className="w-3.5 h-3.5" />
              {busy === 'activate' ? 'Activating…' : 'Activate'}
            </button>
          )}
          <button
            type="button"
            onClick={remove}
            disabled={busy !== null}
            className="text-xs px-2 py-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:text-white hover:bg-rose-500/20 disabled:opacity-50 inline-flex items-center gap-1.5 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {busy === 'delete' ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </header>

      <p className="text-sm text-text-primary leading-relaxed line-clamp-3 whitespace-pre-wrap">
        {profile.styleSummary}
      </p>

      <VoiceProfileJsonView
        styleSummary={profile.styleSummary}
        styleAdjectives={profile.styleAdjectives}
        styleRules={profile.styleRules}
        exampleOpenings={profile.exampleOpenings}
      />
    </article>
  );
}
