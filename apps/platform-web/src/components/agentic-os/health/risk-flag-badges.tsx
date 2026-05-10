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

const SEVERITY_STYLES: Record<
  string,
  { wrap: string; icon: typeof AlertTriangle }
> = {
  critical: {
    wrap: 'border-red-500/50 bg-red-500/10 text-red-200',
    icon: AlertOctagon,
  },
  high: {
    wrap: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
    icon: AlertTriangle,
  },
  medium: {
    wrap: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    icon: AlertCircle,
  },
  low: {
    wrap: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
    icon: Info,
  },
};

export interface RiskFlagBadgesProps {
  flags: RiskFlagRow[];
}

/**
 * Server-rendered badge list for the active risk flags surface. The
 * dismissal flow lives in a sibling client component (added in Phase 2);
 * Phase 1 ships the read-only banner so the foundation is in place.
 */
export function RiskFlagBadges({ flags }: RiskFlagBadgesProps) {
  if (flags.length === 0) return null;

  // Crisis-language always wins; surface a hotline reference inline.
  const hasCrisis = flags.some((f) => f.kind === 'crisis-language');

  return (
    <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">
          {flags.length === 1 ? 'Active risk flag' : `Active risk flags (${flags.length})`}
        </h3>
      </div>
      <ul className="flex flex-wrap gap-2">
        {flags.map((flag) => {
          const style = SEVERITY_STYLES[flag.severity] ?? SEVERITY_STYLES['low']!;
          const SevIcon = style.icon;
          const label = FLAG_LABELS[flag.kind] ?? flag.kind;
          return (
            <li
              key={flag.id}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${style.wrap}`}
            >
              <SevIcon className="w-3.5 h-3.5" />
              <span className="font-medium">{label}</span>
              <span className="opacity-70 uppercase tracking-wide">{flag.severity}</span>
            </li>
          );
        })}
      </ul>
      {hasCrisis && (
        <p className="text-xs text-red-200/90 mt-3 leading-relaxed">
          If you are in crisis, please call or text{' '}
          <a
            href="tel:988"
            className="underline font-medium hover:text-red-100"
          >
            988
          </a>{' '}
          (US Suicide & Crisis Lifeline) or text{' '}
          <span className="font-medium">HOME</span> to{' '}
          <a
            href="sms:741741"
            className="underline font-medium hover:text-red-100"
          >
            741741
          </a>
          . You can dismiss flags from the badges above once you have reviewed them.
        </p>
      )}
    </div>
  );
}
