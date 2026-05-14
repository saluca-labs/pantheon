import { AlertTriangle, AlertCircle, AlertOctagon, Info } from 'lucide-react';
import type { RiskFlagRow } from '@/lib/agentic-os/health/repo';

const FLAG_LABELS: Record<string, string> = {
  'crisis-language': 'Crisis-language detected',
  'high-stress': 'High stress baseline',
  'poor-sleep': 'Poor sleep quality',
  'no-support': 'No support system',
  'compound-mh-risk': 'Compound mental-health risk',
  'phq9-severe': 'PHQ-9 severe (≥20)',
  'phq9-moderate-severe': 'PHQ-9 moderate-severe (15–19)',
  'phq9-moderate': 'PHQ-9 moderate (10–14)',
  'gad7-severe': 'GAD-7 severe (≥15)',
  'gad7-moderate': 'GAD-7 moderate (10–14)',
};

/**
 * Severity → semantic-token styling. Wave D crisis-banner polish: the badges
 * now read through the `danger` / `attention` / `warning` / `accent` status
 * tokens (tokens.md §4) instead of the raw `red-500` / `orange-500` /
 * `amber-500` / `sky-500` Tailwind palette. `critical` is the only severity
 * that uses the hard `danger` red — everything else steps down calmly so the
 * surface does not read as a wall of alarm. It is a sensitive surface: clear
 * hierarchy, never louder than the situation calls for.
 */
const SEVERITY_STYLES: Record<
  string,
  { wrap: string; icon: typeof AlertTriangle; rank: number }
> = {
  critical: {
    wrap: 'border-danger/40 bg-danger/10 text-danger',
    icon: AlertOctagon,
    rank: 0,
  },
  high: {
    wrap: 'border-attention/40 bg-attention/10 text-attention',
    icon: AlertTriangle,
    rank: 1,
  },
  medium: {
    wrap: 'border-warning/40 bg-warning/10 text-warning',
    icon: AlertCircle,
    rank: 2,
  },
  low: {
    wrap: 'border-accent/30 bg-accent/10 text-text-secondary',
    icon: Info,
    rank: 3,
  },
};

export interface RiskFlagBadgesProps {
  flags: RiskFlagRow[];
}

/**
 * Server-rendered banner for the active risk-flags surface — wired into
 * `DashboardHub`'s `flagBanner` slot from `health/page.tsx`.
 *
 * Wave D polish: calmer, clearer, more accessible visual language. The
 * banner is a sensitive surface, so it leads with a plainspoken heading,
 * sorts the most severe flag first, uses semantic status tokens, and keeps
 * the crisis-resource line visually distinct (a quiet `danger`-tinted
 * footer) without shouting. The dismissal flow lives in a sibling client
 * component; this stays the read-only banner.
 */
export function RiskFlagBadges({ flags }: RiskFlagBadgesProps) {
  if (flags.length === 0) return null;

  // Crisis-language always wins; surface a hotline reference inline.
  const hasCrisis = flags.some((f) => f.kind === 'crisis-language');

  // Most severe first — a calm surface still leads with what matters most.
  const sorted = [...flags].sort((a, b) => {
    const ra = SEVERITY_STYLES[a.severity]?.rank ?? 3;
    const rb = SEVERITY_STYLES[b.severity]?.rank ?? 3;
    return ra - rb;
  });

  return (
    <div
      role="region"
      aria-label="Active risk flags"
      className="rounded-xl border border-border-subtle bg-surface-2 p-4"
    >
      <div className="mb-3 flex items-start gap-2.5">
        <span
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-text-secondary"
          aria-hidden="true"
        >
          <AlertCircle className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">
            {flags.length === 1
              ? 'One thing to review'
              : `${flags.length} things to review`}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
            These flags come from your recent check-ins and screeners. They
            are here so nothing slips past — review them when you have a
            moment.
          </p>
        </div>
      </div>

      <ul className="flex flex-wrap gap-2">
        {sorted.map((flag) => {
          const style =
            SEVERITY_STYLES[flag.severity] ?? SEVERITY_STYLES['low']!;
          const SevIcon = style.icon;
          const label = FLAG_LABELS[flag.kind] ?? flag.kind;
          return (
            <li
              key={flag.id}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${style.wrap}`}
            >
              <SevIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="font-medium">{label}</span>
              <span className="text-2xs uppercase tracking-wide opacity-70">
                {flag.severity}
              </span>
            </li>
          );
        })}
      </ul>

      {hasCrisis && (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5">
          <p className="text-xs leading-relaxed text-text-secondary">
            <span className="font-medium text-text-primary">
              If you are in crisis, you do not have to wait.
            </span>{' '}
            Call or text{' '}
            <a
              href="tel:988"
              className="font-medium text-danger underline underline-offset-2 hover:text-danger/80"
            >
              988
            </a>{' '}
            (US Suicide &amp; Crisis Lifeline) or text{' '}
            <span className="font-medium text-text-primary">HOME</span> to{' '}
            <a
              href="sms:741741"
              className="font-medium text-danger underline underline-offset-2 hover:text-danger/80"
            >
              741741
            </a>
            . You can dismiss flags from the badges above once you have
            reviewed them.
          </p>
        </div>
      )}
    </div>
  );
}
