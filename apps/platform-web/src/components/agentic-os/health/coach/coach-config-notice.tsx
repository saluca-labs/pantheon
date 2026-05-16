import { Sparkles } from 'lucide-react';

export function CoachConfigNotice() {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-6 text-sm text-warning/90">
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-warning mt-0.5 shrink-0" />
        <div>
          <h2 className="text-lg font-semibold text-warning mb-1">
            AI coach not yet configured
          </h2>
          <p className="leading-relaxed">
            An administrator needs to set the{' '}
            <code className="rounded bg-warning/15 px-1.5 py-0.5 font-mono text-xs">
              ANTHROPIC_API_KEY
            </code>{' '}
            secret in the deployment environment. Once it's set the coach will
            be available without a redeploy on the next request.
          </p>
        </div>
      </div>
    </div>
  );
}
