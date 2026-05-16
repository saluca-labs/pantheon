/**
 * Autobiographer OS — Voice Studio page.
 *
 * Three-panel layout:
 *   1. Sample list (active / archived / all filter) + "Add sample" CTA.
 *   2. "Build profile" CTA + recent profile snapshot.
 *   3. Profile list (versioned, "Activate" toggle, collapsible JSON view).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 3 (internal).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Mic2 } from 'lucide-react';
import { getCurrentAutobiographerUser } from '@/lib/agentic-os/autobiographer/session';
import { listVoiceSamples } from '@/lib/agentic-os/autobiographer/voice-samples-repo';
import { listVoiceProfiles } from '@/lib/agentic-os/autobiographer/voice-profiles-repo';
import { VoiceSampleList } from '@/components/agentic-os/autobiographer/voice-sample-list';
import { VoiceSampleActions } from '@/components/agentic-os/autobiographer/voice-sample-edit-button';
import { VoiceProfileList } from '@/components/agentic-os/autobiographer/voice-profile-list';
import { VoiceBuildProfileButton } from '@/components/agentic-os/autobiographer/voice-build-profile-button';
import { VoiceStudioStats } from '@/components/agentic-os/autobiographer/voice-studio-stats';

export const dynamic = 'force-dynamic';

export default async function VoiceStudioPage() {
  const user = await getCurrentAutobiographerUser();
  if (!user) redirect('/login');

  const [samples, profiles] = await Promise.all([
    listVoiceSamples({ userId: user.userId, limit: 200 }),
    listVoiceProfiles({ userId: user.userId, limit: 50 }),
  ]);

  const sampleCards = samples.map((s) => ({
    id: s.id,
    title: s.title,
    bodyText: s.bodyText,
    wordCount: s.wordCount,
    isArchived: s.isArchived,
    memoryId: s.memoryId,
    updatedAt: s.updatedAt,
  }));

  const profileCards = profiles.map((p) => ({
    id: p.id,
    version: p.version,
    isActive: p.isActive,
    styleSummary: p.styleSummary,
    styleAdjectives: p.styleAdjectives,
    styleRules: p.styleRules,
    exampleOpenings: p.exampleOpenings,
    sampleCount: p.sampleCount,
    sampleWordCount: p.sampleWordCount,
    builder: p.builder,
    builtAt: p.builtAt,
  }));

  const activeSampleCount = samples.filter((s) => !s.isArchived).length;
  const activeSampleWordCount = samples
    .filter((s) => !s.isArchived)
    .reduce((acc, s) => acc + s.wordCount, 0);
  const activeProfileVersion =
    profiles.find((p) => p.isActive)?.version ?? null;

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/dashboard/os/autobiographer"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Autobiographer OS
      </Link>

      <header className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-surface-0 p-2.5 border border-border-subtle">
            <Mic2 className="w-6 h-6 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h1 className="text-xl font-semibold text-white">Voice Studio</h1>
              <VoiceSampleActions />
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Curate the prose that sounds like you, then build a versioned
              voice profile the Phase 7 chapter drafter will consume. Samples
              can be backed by an existing memory or freshly typed.
            </p>
            <p className="text-xs text-text-tertiary mt-2">
              {samples.length}{' '}
              {samples.length === 1 ? 'sample' : 'samples'} on file
              {' • '}
              {activeSampleCount} active{' '}
              ({activeSampleWordCount.toLocaleString()} words)
              {' • '}
              {profiles.length}{' '}
              {profiles.length === 1 ? 'profile version' : 'profile versions'}
            </p>
          </div>
        </div>
      </header>

      <VoiceStudioStats
        totalSamples={samples.length}
        activeSampleCount={activeSampleCount}
        activeSampleWordCount={activeSampleWordCount}
        profileCount={profiles.length}
        activeProfileVersion={activeProfileVersion}
      />

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Voice samples</h2>
        </div>
        <VoiceSampleList initial={sampleCards} />
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-2 p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-white">Voice profile</h2>
          <VoiceBuildProfileButton activeSampleCount={activeSampleCount} />
        </div>
        <p className="text-xs text-text-tertiary">
          Building a profile runs a two-stage analysis over every active
          sample. Stage 1 extracts per-sample style markers; stage 2 merges
          them into a versioned profile (style_summary + style_rules +
          style_adjectives + example_openings). Existing profiles are
          retained; only the new row is marked active.
        </p>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Profile versions</h2>
          <span className="text-xs text-text-secondary">
            {profiles.length}{' '}
            {profiles.length === 1 ? 'version' : 'versions'}
          </span>
        </div>
        <VoiceProfileList initial={profileCards} />
      </section>
    </div>
  );
}
