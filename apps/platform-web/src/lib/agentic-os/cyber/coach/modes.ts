/**
 * Cyber coach mode taxonomy. Shared by the migration enum, the repo,
 * the system-prompt builder, and the UI mode-picker chip group.
 */

export const COACH_MODE_VALUES = [
  'triage_analyst',
  'threat_hunter',
  'responder',
  'detection_engineer',
  'general',
] as const;

export type CoachMode = (typeof COACH_MODE_VALUES)[number];

export const COACH_MODE_LABELS: Record<CoachMode, string> = {
  triage_analyst: 'Triage analyst',
  threat_hunter: 'Threat hunter',
  responder: 'Responder',
  detection_engineer: 'Detection engineer',
  general: 'General',
};

export const COACH_MODE_DESCRIPTIONS: Record<CoachMode, string> = {
  triage_analyst:
    'Sift through open alerts, propose case escalations, identify duplicates.',
  threat_hunter:
    'Pivot through assets, IOCs, recent alerts. Surface what hunters would investigate next.',
  responder:
    'Walk a case through containment / eradication / recovery. Reference playbooks.',
  detection_engineer:
    'Propose new detection rules from observed patterns. Critique existing rules.',
  general: 'Default mode — broad SOC support.',
};

export const COACH_MODE_STARTERS: Record<CoachMode, string[]> = {
  triage_analyst: [
    'What are the highest-severity open alerts I should look at first?',
    'Are any of the open alerts likely duplicates?',
    'Which alerts have no asset linkage yet?',
    'Suggest a case to escalate from the current open alerts.',
  ],
  threat_hunter: [
    'Walk me through the active IOCs and where I would pivot first.',
    'Which assets are most exposed right now?',
    'Have we seen any of the recent alerts cluster on the same asset?',
    'What MITRE techniques show up most in the last 24h?',
  ],
  responder: [
    'Talk me through containment for the current case.',
    'What playbook steps remain on the active run?',
    'Draft the next case note for the investigation timeline.',
    'What evidence am I missing before I can move to eradication?',
  ],
  detection_engineer: [
    'Propose a draft detection rule from the recent alert pattern.',
    'Critique the highest-severity active detection rule.',
    'What false-positive guardrails should I add to the SSH brute-force rule?',
    'Suggest a starter detection for our cloud_audit log source.',
  ],
  general: [
    'Where should I focus my SOC time right now?',
    'Summarize the state of cyber.',
    'What case is most at risk of going stale?',
    'Are there any open vulnerabilities I should triage first?',
  ],
};

export function isCoachMode(value: unknown): value is CoachMode {
  return (
    typeof value === 'string' &&
    (COACH_MODE_VALUES as readonly string[]).includes(value)
  );
}
