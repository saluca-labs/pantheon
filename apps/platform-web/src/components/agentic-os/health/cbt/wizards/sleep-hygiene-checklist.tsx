'use client';

import { useState } from 'react';
import { Checklist, type ChecklistState } from '@/components/agentic-os/_shared/checklist';
import { SubmitBar, useCbtSubmit } from './_shared';

interface Props {
  exerciseId?: string;
}

const ITEMS = [
  {
    id: 'consistent-bedtime',
    label: 'Consistent bedtime and wake time',
    hint: 'Within ~30 minutes, even on weekends.',
  },
  {
    id: 'no-screens-1h',
    label: 'No bright screens in the last hour before bed',
    hint: 'Or at least dimmed / night-shift mode.',
  },
  {
    id: 'no-caffeine-pm',
    label: 'No caffeine after early afternoon',
    hint: 'Cutoff around 2pm works for most people.',
  },
  {
    id: 'cool-dark-quiet',
    label: 'Cool, dark, quiet bedroom',
    hint: 'Curtains, fan, white noise — whatever it takes.',
  },
  {
    id: 'no-alcohol-late',
    label: 'No alcohol close to bedtime',
    hint: 'It fragments the second half of the night.',
  },
  {
    id: 'wind-down-routine',
    label: 'Wind-down routine in the evening',
    hint: 'Reading, breathwork, light stretches — same cues each night.',
  },
  {
    id: 'bed-for-sleep',
    label: 'Bed reserved for sleep (and intimacy)',
    hint: 'No working / scrolling in bed.',
  },
  {
    id: 'morning-light',
    label: 'Bright light exposure within 30 min of waking',
    hint: 'Sunlight or a SAD lamp; helps anchor the circadian clock.',
  },
];

export function SleepHygieneChecklist({ exerciseId }: Props) {
  const { submit, submitting, error } = useCbtSubmit();
  const [state, setState] = useState<ChecklistState>({
    met: Object.fromEntries(ITEMS.map((i) => [i.id, false])),
    array: ITEMS.map((i) => ({ item: i.label, met: false })),
    notes: '',
  });

  function onSubmit() {
    void submit({
      kind: 'sleep-hygiene',
      exerciseId: exerciseId ?? null,
      data: {
        checklist: state.array,
        notes: state.notes,
      },
    });
  }

  return (
    <div className="space-y-4">
      <Checklist
        items={ITEMS}
        title="Tick what you're already doing"
        withNotes
        onChange={setState}
      />
      <SubmitBar
        submitting={submitting}
        error={error}
        onClick={onSubmit}
      />
    </div>
  );
}
