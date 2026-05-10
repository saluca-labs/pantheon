'use client';

import { useState } from 'react';
import {
  MoodScale,
  SubmitBar,
  TextInput,
  useCbtSubmit,
} from './_shared';

interface Props {
  exerciseId?: string;
}

export function BehavioralActivationForm({ exerciseId }: Props) {
  const { submit, submitting, error } = useCbtSubmit();
  const [activity, setActivity] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [completed, setCompleted] = useState(false);
  const [moodBefore, setMoodBefore] = useState<number | null>(null);
  const [moodAfter, setMoodAfter] = useState<number | null>(null);
  const [reflection, setReflection] = useState('');

  function onSubmit() {
    void submit({
      kind: 'behavioral-activation',
      exerciseId: exerciseId ?? null,
      moodBefore,
      moodAfter,
      data: {
        activity,
        scheduled_for: scheduledFor,
        completed,
        mood_before: moodBefore ?? undefined,
        mood_after: moodAfter ?? undefined,
        reflection,
      },
    });
  }

  const canSubmit = activity.trim().length > 0 && scheduledFor.trim().length > 0;

  return (
    <div className="space-y-4">
      <TextInput
        label="Pick one activity"
        value={activity}
        onChange={setActivity}
        placeholder="Something that gives pleasure, mastery, or connection — the smaller the better."
      />
      <TextInput
        label="When will you do it?"
        value={scheduledFor}
        onChange={setScheduledFor}
        placeholder="e.g. Tuesday 7pm, after work, tomorrow morning"
      />
      <label className="flex items-center gap-2 rounded-lg border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-sm text-white cursor-pointer">
        <input
          type="checkbox"
          checked={completed}
          onChange={(e) => setCompleted(e.target.checked)}
          className="h-4 w-4 accent-[#4361EE]"
        />
        Already done it
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MoodScale label="Mood before" value={moodBefore} onChange={setMoodBefore} />
        <MoodScale label="Mood after" value={moodAfter} onChange={setMoodAfter} />
      </div>
      <TextInput
        label="Reflection (optional)"
        value={reflection}
        onChange={setReflection}
        multiline
        rows={3}
        placeholder="How did it land? What was the gap between expected and actual?"
      />
      <SubmitBar
        submitting={submitting}
        disabled={!canSubmit}
        error={error}
        onClick={onSubmit}
      />
    </div>
  );
}
