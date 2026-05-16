/**
 * Per-kind CBT log formatters. The detail page switches on
 * `log.kind` and renders the matching component; each formatter pulls
 * its structured fields out of the JSONB `data` blob and renders them
 * as readable cards (never a JSON dump).
 *
 * Formatters are forgiving: if a field is missing they render an em-dash
 * placeholder rather than crashing. The on-write Zod schemas enforce
 * the canonical shape, so this is purely defensive against historical
 * rows from earlier phases.
 */

import type { CbtLog } from '@/lib/agentic-os/health/repo';

interface FormatterProps {
  log: CbtLog;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-wide text-text-secondary mb-1">
        {label}
      </h3>
      <div className="text-sm text-white whitespace-pre-wrap leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function Text({ value }: { value: unknown }) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return <>{value}</>;
  }
  return <span className="text-text-secondary">—</span>;
}

export function ThoughtRecordFormatter({ log }: FormatterProps) {
  const d = log.data as Record<string, unknown>;
  return (
    <div className="space-y-4">
      <Field label="Situation">
        <Text value={d.situation} />
      </Field>
      <Field label="Automatic thought">
        <Text value={d.automatic_thought} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Evidence for">
          <Text value={d.evidence_for} />
        </Field>
        <Field label="Evidence against">
          <Text value={d.evidence_against} />
        </Field>
      </div>
      <Field label="Balanced thought">
        <Text value={d.balanced_thought} />
      </Field>
    </div>
  );
}

export function BehavioralActivationFormatter({ log }: FormatterProps) {
  const d = log.data as Record<string, unknown>;
  return (
    <div className="space-y-4">
      <Field label="Activity">
        <Text value={d.activity} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Scheduled for">
          <Text value={d.scheduled_for} />
        </Field>
        <Field label="Completed">
          {d.completed ? (
            <span className="text-positive">Yes</span>
          ) : (
            <span className="text-text-secondary">Not yet</span>
          )}
        </Field>
      </div>
      <Field label="Reflection">
        <Text value={d.reflection} />
      </Field>
    </div>
  );
}

export function WorryTimeFormatter({ log }: FormatterProps) {
  const d = log.data as Record<string, unknown>;
  const worries = Array.isArray(d.worries) ? (d.worries as unknown[]) : [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Scheduled at">
          <Text value={d.scheduled_at} />
        </Field>
        <Field label="Duration">
          {typeof d.duration_min === 'number'
            ? `${d.duration_min} min`
            : '—'}
        </Field>
      </div>
      <Field label="Worries">
        {worries.length === 0 ? (
          <span className="text-text-secondary">—</span>
        ) : (
          <ul className="list-disc pl-5 space-y-1">
            {worries.map((w, i) => (
              <li key={i}>
                {typeof w === 'string' ? (
                  w
                ) : (
                  <span className="text-text-secondary">(unreadable)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Field>
      <Field label="Reflection">
        <Text value={d.reflection} />
      </Field>
    </div>
  );
}

export function GroundingFormatter({ log }: FormatterProps) {
  const d = log.data as Record<string, unknown>;
  const sections: { label: string; key: string }[] = [
    { label: '5 things you can see', key: 'five_see' },
    { label: '4 things you can feel', key: 'four_feel' },
    { label: '3 things you can hear', key: 'three_hear' },
    { label: '2 things you can smell', key: 'two_smell' },
    { label: '1 thing you can taste', key: 'one_taste' },
  ];
  return (
    <div className="space-y-4">
      {sections.map(({ label, key }) => {
        const items = Array.isArray(d[key]) ? (d[key] as unknown[]) : [];
        return (
          <Field key={key} label={label}>
            {items.length === 0 ? (
              <span className="text-text-secondary">—</span>
            ) : (
              <ul className="list-disc pl-5 space-y-1">
                {items.map((it, i) => (
                  <li key={i}>
                    {typeof it === 'string' ? (
                      it
                    ) : (
                      <span className="text-text-secondary">(unreadable)</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Field>
        );
      })}
    </div>
  );
}

export function GratitudeFormatter({ log }: FormatterProps) {
  const d = log.data as Record<string, unknown>;
  const entries = Array.isArray(d.entries) ? (d.entries as unknown[]) : [];
  return (
    <Field label="Three good things">
      {entries.length === 0 ? (
        <span className="text-text-secondary">—</span>
      ) : (
        <ol className="list-decimal pl-5 space-y-1">
          {entries.map((e, i) => (
            <li key={i}>
              {typeof e === 'string' ? (
                e
              ) : (
                <span className="text-text-secondary">(unreadable)</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Field>
  );
}

export function ValuesFormatter({ log }: FormatterProps) {
  const d = log.data as Record<string, unknown>;
  const values = Array.isArray(d.values) ? (d.values as unknown[]) : [];
  return (
    <div className="space-y-3">
      <h3 className="text-[10px] uppercase tracking-wide text-text-secondary">
        Values
      </h3>
      {values.length === 0 ? (
        <span className="text-sm text-text-secondary">—</span>
      ) : (
        <ul className="space-y-3">
          {values.map((v, i) => {
            if (!v || typeof v !== 'object') return null;
            const row = v as Record<string, unknown>;
            return (
              <li
                key={i}
                className="rounded-lg border border-border-subtle bg-surface-0 p-3"
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-white">
                    {typeof row.domain === 'string' ? row.domain : '—'}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-text-secondary">
                    importance {String(row.importance ?? '—')} ·
                    alignment {String(row.current_alignment ?? '—')}
                  </span>
                </div>
                <p className="text-xs text-text-primary leading-relaxed">
                  {typeof row.action === 'string' && row.action.trim().length > 0
                    ? row.action
                    : '—'}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function SleepHygieneFormatter({ log }: FormatterProps) {
  const d = log.data as Record<string, unknown>;
  const items = Array.isArray(d.checklist) ? (d.checklist as unknown[]) : [];
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[10px] uppercase tracking-wide text-text-secondary mb-1.5">
          Checklist
        </h3>
        {items.length === 0 ? (
          <span className="text-sm text-text-secondary">—</span>
        ) : (
          <ul className="space-y-1">
            {items.map((it, i) => {
              if (!it || typeof it !== 'object') return null;
              const row = it as Record<string, unknown>;
              const met = !!row.met;
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 text-sm text-white"
                >
                  <span
                    className={`inline-block w-3.5 h-3.5 rounded-sm border ${
                      met
                        ? 'bg-positive/40 border-positive/60'
                        : 'bg-transparent border-border-subtle'
                    }`}
                    aria-hidden="true"
                  />
                  <span className={met ? '' : 'text-text-secondary'}>
                    {typeof row.item === 'string' ? row.item : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {typeof d.notes === 'string' && d.notes.trim().length > 0 && (
        <Field label="Notes">{d.notes}</Field>
      )}
    </div>
  );
}

/** Dispatch table keyed by `log.kind`. */
export function CbtLogFormatter({ log }: FormatterProps) {
  switch (log.kind) {
    case 'thought-record':
      return <ThoughtRecordFormatter log={log} />;
    case 'behavioral-activation':
      return <BehavioralActivationFormatter log={log} />;
    case 'worry-time':
      return <WorryTimeFormatter log={log} />;
    case 'grounding-54321':
      return <GroundingFormatter log={log} />;
    case 'gratitude':
      return <GratitudeFormatter log={log} />;
    case 'values-clarification':
      return <ValuesFormatter log={log} />;
    case 'sleep-hygiene':
      return <SleepHygieneFormatter log={log} />;
    default:
      return (
        <p className="text-sm text-text-secondary">
          No formatter for kind <code>{log.kind}</code>.
        </p>
      );
  }
}
