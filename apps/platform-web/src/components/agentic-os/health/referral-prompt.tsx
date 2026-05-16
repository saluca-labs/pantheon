import { ExternalLink, LifeBuoy } from 'lucide-react';
import type { ReferralPrompt as ReferralPromptData } from '@/lib/agentic-os/health/risk-flags';

interface Props {
  data: ReferralPromptData;
  /** Compact variant uses smaller padding (e.g. inline within a screener result). */
  compact?: boolean;
}

/**
 * Renders the referral resource block when `data.shouldSurface` is true.
 * Always non-blocking — surfaces SAMHSA, Psychology Today, and 988 with
 * the standard "Reaching out is a strong move." nudge. Returns null
 * when `shouldSurface` is false so callers can wrap it without conditional
 * logic.
 */
export function ReferralPrompt({ data, compact = false }: Props) {
  if (!data.shouldSurface) return null;
  return (
    <div
      role="note"
      className={`rounded-xl border border-warning/30 bg-warning/5 ${
        compact ? 'p-4' : 'p-5'
      }`}
    >
      <div className="flex items-start gap-2.5 mb-3">
        <LifeBuoy
          className={`text-warning mt-0.5 shrink-0 ${
            compact ? 'w-4 h-4' : 'w-5 h-5'
          }`}
        />
        <div>
          <h3
            className={`font-semibold text-warning ${
              compact ? 'text-sm' : 'text-base'
            }`}
          >
            {data.headline}
          </h3>
          <p className="text-sm text-warning/90 mt-1 italic">
            {data.nudge}
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {data.resources.map((r) => (
          <li key={r.url}>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 hover:bg-warning/10 transition p-3"
            >
              <ExternalLink className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-warning">
                  {r.label}
                </div>
                {r.detail && (
                  <p className="text-xs text-warning/80 leading-relaxed mt-0.5">
                    {r.detail}
                  </p>
                )}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
