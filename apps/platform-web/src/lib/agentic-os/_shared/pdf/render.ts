/**
 * Agentic OS — shared PDF render primitive.
 *
 * Single server-side entry point that turns a React element built from
 * the primitives in `./primitives.tsx` into a Buffer ready to stream
 * out of a Next.js Route Handler as `application/pdf`.
 *
 * Every OS-specific PDF template ultimately funnels through here.
 *
 * @license MIT — Tiresias Agentic OS shared primitive.
 */

import 'server-only';
import * as React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';

/**
 * Render a React element (a `<Document>` from `@react-pdf/renderer`) into
 * a Buffer. Call from a Node-runtime Route Handler.
 */
export async function renderPdfToBuffer(
  element: React.ReactElement,
): Promise<Buffer> {
  // `@react-pdf/renderer` types accept `ReactElement<DocumentProps>`. We
  // intentionally widen the input to plain `ReactElement` so callers can
  // pass any composed Document tree without import gymnastics; the
  // runtime check happens inside the library.
  return renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
}
