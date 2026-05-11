/**
 * Maker OS — Build-log domain types and pure helpers.
 *
 * A build-log entry is a timestamped note attached to a project, optionally
 * scoped to a build step. Entries may carry an array of `attached_urls`
 * (photo / video / link / file) — the storage layer is URL-only per the
 * locked decision in `docs/architecture/mcp-storage-transfer.md`.
 *
 * The `AttachedUrl` shape is the canonical contract between the route
 * handlers, the DB column, and the build-log feed component. All three layers
 * round-trip the same JSON.
 *
 * No database calls here — those live in `repo.ts`.
 *
 * @license MIT — Tiresias Maker OS Phase 3 (internal).
 */

// ─── Attached URL kinds ────────────────────────────────────────────────────

export const ATTACHED_URL_KINDS = ['photo', 'video', 'link', 'file'] as const;

export type AttachedUrlKind = (typeof ATTACHED_URL_KINDS)[number];

export const ATTACHED_URL_KIND_LABELS: Record<AttachedUrlKind, string> = {
  photo: 'Photo',
  video: 'Video',
  link: 'Link',
  file: 'File',
};

export interface AttachedUrl {
  url: string;
  kind: AttachedUrlKind;
  label?: string;
}

// ─── Build-log entry entity ────────────────────────────────────────────────

export interface BuildLogEntry {
  id: string;
  projectId: string;
  stepId: string | null;
  body: string;
  attachedUrls: AttachedUrl[];
  authorId: string | null;
  createdAt: string;
}

export interface BuildLogEntryUpsert {
  body: string;
  stepId?: string | null;
  attachedUrls?: AttachedUrl[];
}

export type BuildLogEntryPatch = {
  body?: string;
  attachedUrls?: AttachedUrl[];
};

// Hub-level joined view used by the recent-activity widget.
export interface RecentLogEntry extends BuildLogEntry {
  projectName: string;
}

// ─── Validators ───────────────────────────────────────────────────────────

/**
 * Validate the body of a log entry — non-empty, max 4000 chars.
 */
export function validateLogBody(value: unknown): string | null {
  if (typeof value !== 'string') return 'body must be a string.';
  const trimmed = value.trim();
  if (!trimmed) return 'body is required.';
  if (trimmed.length > 4000) return 'body must be at most 4000 characters.';
  return null;
}

/**
 * Validate an attached-URL kind against the locked enum.
 */
export function validateAttachedUrlKind(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !(ATTACHED_URL_KINDS as readonly string[]).includes(value)
  ) {
    return `kind must be one of: ${ATTACHED_URL_KINDS.join(', ')}.`;
  }
  return null;
}

/**
 * Lightweight URL-shape check — must be a non-empty string starting with
 * http://, https://, or a relative `/`-rooted path. We don't run the full
 * WHATWG URL parser here so that the helper stays pure and side-effect-free.
 */
export function validateUrlString(value: unknown): string | null {
  if (typeof value !== 'string') return 'url must be a string.';
  const trimmed = value.trim();
  if (!trimmed) return 'url is required.';
  if (trimmed.length > 2000) return 'url must be at most 2000 characters.';
  if (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('/')
  ) {
    return 'url must be http://, https://, or a /-rooted path.';
  }
  return null;
}

/**
 * Validate a single AttachedUrl object. Returns the first error or null.
 */
export function validateAttachedUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'attached_url must be an object.';
  const v = value as Record<string, unknown>;
  const urlErr = validateUrlString(v.url);
  if (urlErr) return urlErr;
  const kindErr = validateAttachedUrlKind(v.kind);
  if (kindErr) return kindErr;
  if (v.label !== undefined && v.label !== null) {
    if (typeof v.label !== 'string') return 'label must be a string when provided.';
    if (v.label.length > 200) return 'label must be at most 200 characters.';
  }
  return null;
}

/**
 * Validate the full attached_urls array — every entry must pass
 * validateAttachedUrl. Returns the first error, or null when the whole list
 * is valid. Empty / undefined arrays are valid (no attachments).
 */
export function validateAttachedUrls(value: unknown): string | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return 'attached_urls must be an array.';
  if (value.length > 25) return 'attached_urls must have at most 25 entries.';
  for (const entry of value) {
    const err = validateAttachedUrl(entry);
    if (err) return err;
  }
  return null;
}

// ─── Pure helpers ──────────────────────────────────────────────────────────

/**
 * Coerce an unknown value into a canonical `AttachedUrl[]`. Drops entries
 * that fail validation rather than throwing — the route handlers should
 * validate at the boundary, this is for defensive read paths (e.g. reading
 * raw rows out of the JSONB column).
 */
export function coerceAttachedUrls(value: unknown): AttachedUrl[] {
  if (!Array.isArray(value)) return [];
  const out: AttachedUrl[] = [];
  for (const entry of value) {
    if (validateAttachedUrl(entry)) continue;
    const e = entry as AttachedUrl;
    out.push({
      url: e.url,
      kind: e.kind,
      ...(typeof e.label === 'string' ? { label: e.label } : {}),
    });
  }
  return out;
}

/**
 * Parse the comma-separated URL input used by the build-log compose form
 * into an `AttachedUrl[]`. Each entry is either:
 *
 *   - `https://...`             — kind inferred from extension or defaulted to `link`
 *   - `https://...|photo`       — explicit kind suffix
 *   - `https://...|photo|Label` — explicit kind + label
 *
 * Whitespace is trimmed. Invalid entries are dropped. The helper is pure so
 * the component can preview-validate before POST.
 */
export function parseUrlInput(raw: string): AttachedUrl[] {
  const out: AttachedUrl[] = [];
  for (const piece of raw.split(/[\n,]/)) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const segments = trimmed.split('|').map((s) => s.trim());
    const url = segments[0]!;
    if (validateUrlString(url)) continue;
    const explicitKind = segments[1];
    let kind: AttachedUrlKind;
    if (explicitKind && (ATTACHED_URL_KINDS as readonly string[]).includes(explicitKind)) {
      kind = explicitKind as AttachedUrlKind;
    } else {
      kind = inferKindFromUrl(url);
    }
    const label = segments[2];
    out.push({
      url,
      kind,
      ...(label ? { label } : {}),
    });
  }
  return out;
}

/**
 * Best-effort kind inference from the URL extension or known host prefixes.
 * Used by parseUrlInput when no explicit kind is given. The default fallback
 * is `link`.
 */
export function inferKindFromUrl(url: string): AttachedUrlKind {
  const lower = url.toLowerCase();
  if (
    /\.(png|jpe?g|gif|webp|bmp|avif|heic|svg)(\?|#|$)/.test(lower) ||
    /(^|\/)photo|image|imgur\.com|i\.redd\.it/.test(lower)
  ) {
    return 'photo';
  }
  if (
    /\.(mp4|mov|webm|mkv|avi|m4v)(\?|#|$)/.test(lower) ||
    /(youtube\.com|youtu\.be|vimeo\.com|loom\.com)/.test(lower)
  ) {
    return 'video';
  }
  if (/\.(pdf|stl|step|stp|dxf|svg|3mf|gcode|zip|tar|gz)(\?|#|$)/.test(lower)) {
    return 'file';
  }
  return 'link';
}
