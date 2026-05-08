import { LifeBuoy, Phone, MessageSquare } from 'lucide-react';
import { CRISIS_RESOURCES } from '@/lib/agentic-os/health/screeners';

interface Props {
  /** Optional headline override. */
  headline?: string;
  /** Optional supplemental text shown above the resources. */
  body?: string;
  /** Compact variant uses smaller padding (e.g. inline within a card). */
  compact?: boolean;
}

/**
 * The crisis-safety wall. Renders 988 + Crisis Text Line in a high-contrast
 * red block. Used both as a standalone interception page and as an inline
 * banner above plan/screener responses.
 */
export function CrisisBanner({ headline, body, compact = false }: Props) {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-red-500/50 bg-red-950/40 ${
        compact ? 'p-4' : 'p-6'
      }`}
    >
      <div className="flex items-start gap-3 mb-3">
        <LifeBuoy className="w-5 h-5 text-red-300 mt-0.5 shrink-0" />
        <div>
          <h2 className={`font-semibold text-red-100 ${compact ? 'text-base' : 'text-lg'}`}>
            {headline ?? 'You don’t have to face this alone.'}
          </h2>
          {body && (
            <p className="text-sm text-red-100/90 mt-1 leading-relaxed">{body}</p>
          )}
          <p className="text-sm text-red-100/90 mt-2 leading-relaxed">
            Health OS is not a crisis service and cannot provide emergency
            care. If you’re in immediate danger, please reach a trained
            counselor right now using one of the resources below.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
        <a
          href={`tel:${CRISIS_RESOURCES.hotlineNumber}`}
          className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-900/40 hover:bg-red-900/60 transition p-3"
        >
          <Phone className="w-4 h-4 text-red-200" />
          <div>
            <div className="text-sm font-semibold text-red-50">
              Call {CRISIS_RESOURCES.hotlineNumber}
            </div>
            <div className="text-xs text-red-200/80">
              {CRISIS_RESOURCES.hotlineLabel}
            </div>
          </div>
        </a>
        <a
          href={`sms:${CRISIS_RESOURCES.textShortcode}&body=${CRISIS_RESOURCES.textKeyword}`}
          className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-900/40 hover:bg-red-900/60 transition p-3"
        >
          <MessageSquare className="w-4 h-4 text-red-200" />
          <div>
            <div className="text-sm font-semibold text-red-50">
              Text {CRISIS_RESOURCES.textKeyword} to {CRISIS_RESOURCES.textShortcode}
            </div>
            <div className="text-xs text-red-200/80">
              Crisis Text Line
            </div>
          </div>
        </a>
      </div>

      <p className="text-xs text-red-200/70 mt-3">
        Free, confidential, available 24/7 in the US. International users:
        please contact your local emergency services or the{' '}
        <a
          href="https://findahelpline.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-red-100"
        >
          Find A Helpline
        </a>{' '}
        directory.
      </p>
    </div>
  );
}
