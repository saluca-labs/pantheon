import Link from 'next/link';
import { ArrowLeft, Dumbbell } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { getCurrentHealthUser } from '@/lib/agentic-os/health/session';
import {
  getActiveConsent,
  getWorkoutTemplate,
  type WorkoutTemplate,
  type WorkoutTemplateBlock,
} from '@/lib/agentic-os/health/repo';
import {
  WorkoutEditor,
  type WorkoutEditorBlock,
  type WorkoutEditorTemplate,
} from '@/components/agentic-os/health/activity/workout-editor';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}

export default async function WorkoutDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { edit } = await searchParams;
  const user = await getCurrentHealthUser();
  if (!user) redirect('/login');

  const mentalConsent = await getActiveConsent(
    user.userId,
    user.tenantId,
    'mental',
  );
  if (!mentalConsent?.granted) {
    return (
      <div className="max-w-3xl">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-100/90">
          Mental-health consent required.
        </div>
      </div>
    );
  }

  const template = await getWorkoutTemplate(id, user.tenantId, user.userId);
  if (!template) notFound();

  // System templates: read-only, never put the editor up.
  const editable = template.source === 'custom';
  const editMode = editable && (edit === '1' || edit === 'true');

  const editorTemplate: WorkoutEditorTemplate = {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    targetIntensity: template.targetIntensity,
    estDurationMin: template.estDurationMin,
    tags: template.tags,
    blocks: (template.blocks ?? []).map(
      (b): WorkoutEditorBlock => ({
        id: b.id,
        kind: b.kind,
        name: b.name,
        sets: b.sets,
        reps: b.reps,
        durationSec: b.durationSec,
        restSec: b.restSec,
        weightHint: b.weightHint,
        notes: b.notes,
      }),
    ),
  };

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/os/health/workouts"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Workouts
      </Link>

      <div className="flex flex-wrap items-center gap-3 mb-1">
        <Dumbbell className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold text-white">{template.name}</h1>
        <span
          className={`text-[10px] uppercase tracking-wide rounded-full border border-border-subtle px-2 py-0.5 ${
            template.source === 'system' ? 'text-accent' : 'text-text-primary'
          }`}
        >
          {template.source === 'system' ? 'Built-in' : 'Custom'}
        </span>
      </div>

      {!editMode ? (
        <ReadMode template={template} editable={editable} />
      ) : (
        <div className="mt-4">
          <WorkoutEditor initialTemplate={editorTemplate} />
        </div>
      )}
    </div>
  );
}

function ReadMode({
  template,
  editable,
}: {
  template: WorkoutTemplate;
  editable: boolean;
}) {
  return (
    <div className="space-y-5 mt-4">
      <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="text-xs text-text-secondary">
            {template.category} · {template.estDurationMin} min ·{' '}
            <span
              className={
                template.targetIntensity === 'light'
                  ? 'text-emerald-300'
                  : template.targetIntensity === 'vigorous'
                    ? 'text-amber-300'
                    : 'text-accent'
              }
            >
              {template.targetIntensity}
            </span>
          </div>
          {editable && (
            <Link
              href={`/dashboard/os/health/workouts/${template.id}?edit=1`}
              className="rounded-lg border border-border-subtle bg-surface-0 px-3 py-1.5 text-xs text-text-primary hover:border-accent/50 hover:text-white"
            >
              Edit
            </Link>
          )}
        </div>
        {template.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {template.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-border-subtle bg-surface-0 px-2 py-0.5 text-[11px] text-text-primary"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        {template.description && (
          <div className="prose prose-invert prose-sm max-w-none text-text-primary">
            <ReactMarkdown>{template.description}</ReactMarkdown>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-2 p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Blocks</h2>
        {(template.blocks ?? []).length === 0 ? (
          <p className="text-xs text-text-secondary">No blocks yet.</p>
        ) : (
          <ol className="space-y-2">
            {(template.blocks ?? []).map((b, i) => (
              <BlockView key={b.id} block={b} index={i} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function BlockView({
  block,
  index,
}: {
  block: WorkoutTemplateBlock;
  index: number;
}) {
  const meta: string[] = [];
  if (block.sets !== null) meta.push(`${block.sets} sets`);
  if (block.reps) meta.push(`${block.reps} reps`);
  if (block.durationSec !== null) meta.push(`${block.durationSec}s`);
  if (block.restSec !== null) meta.push(`rest ${block.restSec}s`);
  if (block.weightHint) meta.push(block.weightHint);
  return (
    <li className="rounded-lg border border-border-subtle bg-surface-0 p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] text-text-secondary font-mono w-6">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-text-secondary">
          {block.kind}
        </span>
        <span className="text-sm text-white">{block.name}</span>
      </div>
      {meta.length > 0 && (
        <div className="mt-1 ml-8 text-xs text-text-primary">{meta.join(' · ')}</div>
      )}
      {block.notes && (
        <div className="mt-1 ml-8 text-xs text-text-secondary italic">
          {block.notes}
        </div>
      )}
    </li>
  );
}
