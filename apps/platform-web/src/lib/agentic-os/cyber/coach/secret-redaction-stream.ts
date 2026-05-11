/**
 * Streaming wrapper around `redactSecrets`.
 *
 * The LLM streams text token-by-token; a naive redactor would miss a
 * pattern that straddles a chunk boundary (e.g. `AKIA` arriving in one
 * chunk and the rest of the access-key id in the next).
 *
 * Strategy: maintain a `tail` buffer of the last MAX_PATTERN_LENGTH
 * characters and only flush the safe-to-finalize prefix on each tick.
 * On stream end, flush the tail.
 *
 * This is non-blocking — chunks are emitted as soon as they're past the
 * lookback window. The UI sees a slight (~200 char) extra delay versus
 * the raw stream, which is invisible at human-typing speeds.
 */

import {
  MAX_PATTERN_LENGTH,
  redactSecrets,
  type RedactionMatch,
} from './secret-redaction';

export type RedactionMatchCallback = (matches: RedactionMatch[]) => void;

/**
 * Wrap a text stream so each yielded chunk is redacted. The match
 * callback fires once on stream end with the accumulated counts across
 * the full stream.
 */
export async function* wrapStreamWithRedaction(
  textStream: AsyncIterable<string>,
  onMatch?: RedactionMatchCallback,
): AsyncIterable<string> {
  const aggregate = new Map<string, number>();
  let buffer = '';

  function mergeMatches(matches: RedactionMatch[]): void {
    for (const m of matches) {
      aggregate.set(m.type, (aggregate.get(m.type) ?? 0) + m.count);
    }
  }

  for await (const chunk of textStream) {
    buffer += chunk;
    if (buffer.length <= MAX_PATTERN_LENGTH) {
      // Not enough yet to safely flush anything.
      continue;
    }
    const safeLen = buffer.length - MAX_PATTERN_LENGTH;
    const safe = buffer.slice(0, safeLen);
    buffer = buffer.slice(safeLen);
    const { redacted, matches } = redactSecrets(safe);
    mergeMatches(matches);
    if (redacted.length > 0) {
      yield redacted;
    }
  }

  if (buffer.length > 0) {
    const { redacted, matches } = redactSecrets(buffer);
    mergeMatches(matches);
    if (redacted.length > 0) {
      yield redacted;
    }
  }

  if (onMatch) {
    const finalMatches: RedactionMatch[] = Array.from(aggregate.entries()).map(
      ([type, count]) => ({ type, count }),
    );
    onMatch(finalMatches);
  }
}
