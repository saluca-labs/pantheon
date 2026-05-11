import { Sparkles } from 'lucide-react';

export function CoachConfigNotice() {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-100/90">
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
        <div>
          <h2 className="text-lg font-semibold text-amber-50 mb-1">
            AI coach not yet configured
          </h2>
          <p className="leading-relaxed">
            An administrator needs to set the{' '}
            <code className="rounded bg-amber-900/40 px-1.5 py-0.5 font-mono text-xs">
              ANTHROPIC_API_KEY
            </code>{' '}
            secret in the deployment environment. Once it&apos;s set the coach
            will be available without a redeploy on the next request.
          </p>
        </div>
      </div>
    </div>
  );
}
