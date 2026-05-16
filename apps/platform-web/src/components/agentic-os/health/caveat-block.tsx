import { Info } from 'lucide-react';

/**
 * The "not medical advice" caveat block. Health OS rule #4 requires this
 * to appear on every plan, recommendation, and AI response.
 */
export function CaveatBlock() {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 flex items-start gap-3">
      <Info className="w-4 h-4 text-warning mt-0.5 shrink-0" />
      <p className="text-xs text-warning/90 leading-relaxed">
        These suggestions are based on public guidelines for generally
        healthy adults and your profile; they are{' '}
        <strong className="text-warning">not medical advice</strong>.
        Please review with your doctor, licensed therapist, or clinician
        before making changes. Health OS does not diagnose, treat, or
        prescribe. PHQ-9, GAD-7, and similar scores are for self-awareness
        tracking only.
      </p>
    </div>
  );
}
