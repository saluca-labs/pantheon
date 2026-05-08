/**
 * Filmmaker OS — Shot List domain logic.
 *
 * A shot list is the canonical pre-production document that maps each scene
 * to individual camera set-ups. Industry convention (used by DPs and ADs) is
 * to label shots with a scene number, shot number, and optional take counter.
 *
 * Shot types follow the American Cinematographer Manual taxonomy:
 *   EWS / WS / MS / MCU / CU / ECU (Extreme Wide → Extreme Close)
 *
 * @license MIT — original work for Tiresias platform
 * @see https://www.ascmag.com/articles/shot-types-and-camera-angles
 *   ASC (American Society of Cinematographers) — shot taxonomy reference
 * @see https://www.studiobinder.com/blog/ultimate-guide-to-shot-list/
 *   StudioBinder "Ultimate Guide to Shot Lists" — industry workflow reference
 */

/** Standard shot-size categories from the ASC shot-type taxonomy. */
export const SHOT_TYPES = [
  'EWS', // Extreme Wide Shot
  'WS',  // Wide Shot
  'FS',  // Full Shot
  'MS',  // Medium Shot
  'MCU', // Medium Close-Up
  'CU',  // Close-Up
  'ECU', // Extreme Close-Up
  'OTS', // Over-the-Shoulder
  'POV', // Point of View
  'INSERT', // Insert / cutaway
] as const;

export type ShotType = (typeof SHOT_TYPES)[number];

/** Standard camera-movement labels. */
export const CAMERA_MOVES = [
  'STATIC',
  'PAN',
  'TILT',
  'DOLLY_IN',
  'DOLLY_OUT',
  'TRUCK',
  'PEDESTAL',
  'HANDHELD',
  'STEADICAM',
  'CRANE',
  'DRONE',
  'ZOOM_IN',
  'ZOOM_OUT',
] as const;

export type CameraMove = (typeof CAMERA_MOVES)[number];

export interface ShotListEntry {
  id: string;
  projectId: string;
  sceneNumber: string;
  shotNumber: string;
  shotType: ShotType;
  cameraMove: CameraMove;
  subject: string;
  description: string;
  estimatedSeconds: number | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Build a human-readable shot label, e.g. "3A — CU DOLLY_IN".
 * Follows the standard production-board notation where scene number is
 * followed by an alpha designator for the shot.
 *
 * Reference: StudioBinder shot-list conventions
 * https://www.studiobinder.com/blog/ultimate-guide-to-shot-list/
 */
export function formatShotLabel(entry: Pick<ShotListEntry, 'sceneNumber' | 'shotNumber' | 'shotType' | 'cameraMove'>): string {
  return `${entry.sceneNumber}${entry.shotNumber} — ${entry.shotType} ${entry.cameraMove}`;
}

/**
 * Estimate page count from the number of shots. Industry rule-of-thumb:
 * one page of screenplay ≈ one minute of screen time; a scene of ~1 minute
 * typically has 4–8 shots. We approximate 6 shots per page.
 *
 * Source: Edward Dmytryk, "On Screen Directing" (public domain excerpt
 * republished at https://www.filmindependent.org) — "a minute a page" rule.
 */
export function estimatePageCount(shotCount: number): number {
  return Math.max(1, Math.round(shotCount / 6));
}

/**
 * Validate a shot entry before writing to DB.
 * Returns a list of human-readable error strings (empty = valid).
 */
export function validateShot(entry: Partial<ShotListEntry>): string[] {
  const errors: string[] = [];
  if (!entry.sceneNumber || entry.sceneNumber.trim() === '') {
    errors.push('Scene number is required.');
  }
  if (!entry.shotNumber || entry.shotNumber.trim() === '') {
    errors.push('Shot number is required.');
  }
  if (entry.shotType && !(SHOT_TYPES as readonly string[]).includes(entry.shotType)) {
    errors.push(`Shot type "${entry.shotType}" is not in the standard taxonomy.`);
  }
  if (entry.cameraMove && !(CAMERA_MOVES as readonly string[]).includes(entry.cameraMove)) {
    errors.push(`Camera move "${entry.cameraMove}" is not recognised.`);
  }
  if (entry.estimatedSeconds != null && (entry.estimatedSeconds < 0 || entry.estimatedSeconds > 3600)) {
    errors.push('Estimated duration must be between 0 and 3600 seconds.');
  }
  return errors;
}
