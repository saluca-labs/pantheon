'use client';

import { useState } from 'react';
import { WizardForm } from '@/components/agentic-os/_shared/wizard-form';
import { SubmitBar, useCbtSubmit } from './_shared';

interface Props {
  exerciseId?: string;
  step?: string;
}

const SLOTS: {
  field: 'five_see' | 'four_feel' | 'three_hear' | 'two_smell' | 'one_taste';
  count: number;
  label: string;
  hint: string;
}[] = [
  { field: 'five_see', count: 5, label: '5 things you see', hint: 'Eyes open. Name what is actually in front of you.' },
  { field: 'four_feel', count: 4, label: '4 things you feel', hint: 'Texture, temperature, pressure — anything physical.' },
  { field: 'three_hear', count: 3, label: '3 things you hear', hint: 'Quiet things count — your breath, a hum, a distant sound.' },
  { field: 'two_smell', count: 2, label: '2 things you smell', hint: 'If nothing immediately, what would you smell if you went looking?' },
  { field: 'one_taste', count: 1, label: '1 thing you taste', hint: 'Mouth-feel counts. Or take a sip of something.' },
];

type DataState = {
  five_see: string[];
  four_feel: string[];
  three_hear: string[];
  two_smell: string[];
  one_taste: string[];
};

function emptyState(): DataState {
  return {
    five_see: ['', '', '', '', ''],
    four_feel: ['', '', '', ''],
    three_hear: ['', '', ''],
    two_smell: ['', ''],
    one_taste: [''],
  };
}

export function Grounding54321({ exerciseId, step }: Props) {
  const { submit, submitting, error } = useCbtSubmit();
  const [data, setData] = useState<DataState>(emptyState());

  function setSlot(field: keyof DataState, idx: number, value: string) {
    setData((d) => ({
      ...d,
      [field]: d[field].map((v, i) => (i === idx ? value : v)),
    }));
  }

  function isFilled(): boolean {
    return SLOTS.every((s) =>
      data[s.field].every((v) => typeof v === 'string' && v.trim().length > 0),
    );
  }

  function onSubmit() {
    void submit({
      kind: 'grounding-54321',
      exerciseId: exerciseId ?? null,
      data,
    });
  }

  return (
    <WizardForm
      basePath="/dashboard/os/health/cbt/grounding-54321/new"
      currentStep={step}
      steps={SLOTS.map((slot, idx) => ({
        id: slot.field,
        label: slot.label,
        content: (
          <div className="space-y-3">
            <p className="text-xs text-text-secondary leading-relaxed">{slot.hint}</p>
            <ul className="space-y-2">
              {Array.from({ length: slot.count }).map((_, i) => (
                <li key={i}>
                  <input
                    type="text"
                    value={data[slot.field][i] ?? ''}
                    onChange={(e) => setSlot(slot.field, i, e.target.value)}
                    placeholder={`#${i + 1}`}
                    className="w-full rounded-lg border border-border-subtle bg-surface-0 text-sm text-white placeholder:text-text-secondary px-3 py-2"
                  />
                </li>
              ))}
            </ul>
            {idx === SLOTS.length - 1 && (
              <SubmitBar
                submitting={submitting}
                disabled={!isFilled()}
                error={error}
                onClick={onSubmit}
              />
            )}
          </div>
        ),
      }))}
    />
  );
}
