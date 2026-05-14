/**
 * Autobiographer coach — recent sessions sidebar list.
 *
 * Pure presentational. The parent passes a pre-filtered list of
 * sessions (mode / book scope applied server-side via the listSessions
 * repo helper).
 *
 * @license MIT — Tiresias Autobiographer OS Phase 7 (internal).
 */

import {
  CoachSessionCard,
  type CoachSessionCardProps,
} from './coach-session-card';

interface Props {
  sessions: CoachSessionCardProps[];
}

export function CoachSessionList({ sessions }: Props) {
  if (sessions.length === 0) {
    return (
      <p className="text-xs text-text-secondary">
        No sessions yet. Pick a mode and start one.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {sessions.map((s) => (
        <li key={s.id}>
          <CoachSessionCard {...s} />
        </li>
      ))}
    </ul>
  );
}
