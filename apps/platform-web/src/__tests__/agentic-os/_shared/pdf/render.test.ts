/**
 * `_shared/pdf/render` — primitive smoke test.
 *
 * Verifies the render entry point produces a valid PDF buffer from
 * a minimal Document/Page/Text tree.
 *
 * @license MIT — Tiresias Agentic OS shared primitive.
 */

import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderPdfToBuffer } from '@/lib/agentic-os/_shared/pdf/render';
import {
  Document,
  Page,
  Text,
} from '@/lib/agentic-os/_shared/pdf/primitives';

describe('renderPdfToBuffer', () => {
  it('produces a Buffer with the %PDF- magic header', async () => {
    const element = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: 'LETTER' },
        React.createElement(Text, null, 'hi'),
      ),
    );
    const buffer = await renderPdfToBuffer(element);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(100);
    const header = buffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  }, 30_000);
});
