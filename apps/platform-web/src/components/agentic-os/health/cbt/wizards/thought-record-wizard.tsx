'use client';

import { useState } from 'react';
import { WizardForm } from '@/components/agentic-os/_shared/wizard-form';
import {
  MoodScale,
  SubmitBar,
  TextInput,
  useCbtSubmit,
} from './_shared';

interface Props {
  exerciseId?: string;
  step?: string;
}

export function ThoughtRecordWizard({ exerciseId, step }: Props) {
  const { submit, submitting, error } = useCbtSubmit();
  const [situation, setSituation] = useState('');
  const [thought, setThought] = useState('');
  const [evFor, setEvFor] = useState('');
  const [evAgainst, setEvAgainst] = useState('');
  const [balanced, setBalanced] = useState('');
  const [moodBefore, setMoodBefore] = useState<number | null>(null);
  const [moodAfter, setMoodAfter] = useState<number | null>(null);

  function onSubmit() {
    void submit({
      kind: 'thought-record',
      exerciseId: exerciseId ?? null,
      moodBefore,
      moodAfter,
      data: {
        situation,
        automatic_thought: thought,
        evidence_for: evFor,
        evidence_against: evAgainst,
        balanced_thought: balanced,
        mood_before: moodBefore ?? undefined,
        mood_after: moodAfter ?? undefined,
      },
    });
  }

  const canSubmit =
    situation.trim().length > 0 &&
    thought.trim().length > 0 &&
    balanced.trim().length > 0;

  return (
    <WizardForm
      basePath="/dashboard/os/health/cbt/thought-record/new"
      currentStep={step}
      steps={[
        {
          id: 'situation',
          label: 'Situation',
          content: (
            <div className="space-y-3">
              <TextInput
                label="What happened?"
                value={situation}
                onChange={setSituation}
                multiline
                rows={4}
                placeholder="Where were you, who else was there, what were you doing? Stick to observable facts."
              />
              <MoodScale
                label="Mood right now (1 worst, 10 best)"
                value={moodBefore}
                onChange={setMoodBefore}
              />
            </div>
          ),
        },
        {
          id: 'thought',
          label: 'Automatic thought',
          content: (
            <TextInput
              label="What went through your mind?"
              value={thought}
              onChange={setThought}
              multiline
              rows={4}
              placeholder='Begin with "I thought…" and write a single clear sentence.'
            />
          ),
        },
        {
          id: 'evidence',
          label: 'Evidence',
          content: (
            <div className="space-y-3">
              <TextInput
                label="Evidence FOR the thought"
                value={evFor}
                onChange={setEvFor}
                multiline
                rows={3}
                placeholder="Concrete observations only — not feelings."
              />
              <TextInput
                label="Evidence AGAINST the thought"
                value={evAgainst}
                onChange={setEvAgainst}
                multiline
                rows={3}
                placeholder="Times the opposite was true, alternative explanations."
              />
            </div>
          ),
        },
        {
          id: 'balanced',
          label: 'Balanced thought',
          content: (
            <TextInput
              label="Rewrite the thought to fit both sides of the evidence"
              value={balanced}
              onChange={setBalanced}
              multiline
              rows={4}
              placeholder="A more accurate sentence — usually less catastrophic, less absolute."
            />
          ),
        },
        {
          id: 'mood',
          label: 'Mood after',
          content: (
            <div className="space-y-4">
              <MoodScale
                label="Mood after working through it"
                value={moodAfter}
                onChange={setMoodAfter}
              />
              <SubmitBar
                submitting={submitting}
                disabled={!canSubmit}
                error={error}
                onClick={onSubmit}
              />
            </div>
          ),
        },
      ]}
    />
  );
}
