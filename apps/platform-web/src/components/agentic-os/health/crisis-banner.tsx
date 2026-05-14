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
 * block. Used both as a standalone interception page and as an inline
 * banner above plan / screener responses.
 *
 * Wave D crisis-banner polish: migrated off the raw `red-*` Tailwind palette
 * onto the semantic `danger` status token (tokens.md §4) so the surface
 * stays coherent with the rest of the visual language. It is intentionally
 * the loudest surface in Health OS — high contrast, clear hierarchy — but
 * the copy stays calm and plainspoken (decision 5.9: no wit in Health).
 * `role="alert"` is preserved so assistive tech announces it immediately.
 */
export function CrisisBanner({ headline, body, compact = false }: Props) {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-danger/50 bg-danger/10 ${
        compact ? 'p-4' : 'p-6'
      }`}
    >
      <div className="mb-3 flex items-start gap-3">
        <span
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-danger"
          aria-hidden="true"
        >
          <LifeBuoy className="h-5 w-5" />
        </span>
        <div>
          <h2
            className={`font-semibold text-text-primary ${
              compact ? 'text-base' : 'text-lg'
            }`}
          >
            {headline ?? 'You don’t have to face this alone.'}
          </h2>
          {body && (
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              {body}
            </p>
          )}
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Health OS is not a crisis service and cannot provide emergency
            care. If you’re in immediate danger, please reach a trained
            counselor right now using one of the resources below.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <a
          href={`tel:${CRISIS_RESOURCES.hotlineNumber}`}
          className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 transition hover:bg-danger/20"
        >
          <Phone className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <div>
            <div className="text-sm font-semibold text-text-primary">
              Call {CRISIS_RESOURCES.hotlineNumber}
            </div>
            <div className="text-xs text-text-secondary">
              {CRISIS_RESOURCES.hotlineLabel}
            </div>
          </div>
        </a>
        <a
          href={`sms:${CRISIS_RESOURCES.textShortcode}&body=${CRISIS_RESOURCES.textKeyword}`}
          className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 transition hover:bg-danger/20"
        >
          <MessageSquare
            className="h-4 w-4 shrink-0 text-danger"
            aria-hidden="true"
          />
          <div>
            <div className="text-sm font-semibold text-text-primary">
              Text {CRISIS_RESOURCES.textKeyword} to{' '}
              {CRISIS_RESOURCES.textShortcode}
            </div>
            <div className="text-xs text-text-secondary">Crisis Text Line</div>
          </div>
        </a>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-text-tertiary">
        Free, confidential, available 24/7 in the US. International users:
        please contact your local emergency services or the{' '}
        <a
          href="https://findahelpline.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-text-secondary"
        >
          Find A Helpline
        </a>{' '}
        directory.
      </p>
    </div>
  );
}
