'use client';

/**
 * CyberSec OS — SigmaDetectionEditor.
 *
 * CodeMirror 6 host for a detection rule's `detection` body. The body is a
 * Sigma-style detection block — `condition`, `selection`, `filter`, etc. —
 * persisted as a JSON object (`DetectionRule.detection: Record<string,
 * unknown>`), so the editor highlights JSON: that is the on-disk format and
 * highlighting anything else would lie about the data.
 *
 * The highlighter is a lightweight CodeMirror decoration plugin (the same
 * pattern Filmmaker's `ScreenplayEditor` uses for Fountain) — NOT an npm
 * language package. It tints:
 *  - Sigma keys (`condition`, `selection`, `filter`, `timeframe`, …) — accent
 *  - other object keys — cyan
 *  - string / number / boolean / null literals — per-type colors
 *  - structural punctuation — dim
 * On-blur it parses the document and reports JSON validity through
 * `onValidityChange`, so the form can keep its existing save-gate.
 *
 * Uses `@uiw/react-codemirror` (already a dependency via ScreenplayEditor) —
 * no new npm package was added for the Sigma highlight.
 *
 * @license MIT — Tiresias CyberSec OS (internal).
 */

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import CodeMirror, {
  type ReactCodeMirrorRef,
  EditorView,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
} from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';

export interface SigmaDetectionEditorHandle {
  getText(): string;
  setText(text: string): void;
}

interface Props {
  /** Initial JSON text of the detection body. */
  initialText: string;
  /** Fires on every edit with the current document text. */
  onChange?: (text: string) => void;
  /** Fires on blur with whether the document parses as a JSON object. */
  onValidityChange?: (valid: boolean) => void;
  readOnly?: boolean;
  className?: string;
  height?: string;
}

/**
 * Sigma's well-known top-level detection keys. Highlighted distinctly so the
 * rule's structure (`condition` + named search-identifiers) reads at a glance.
 * @see https://github.com/SigmaHQ/sigma-specification
 */
const SIGMA_KEYS = new Set([
  'condition',
  'timeframe',
  'fields',
  'selection',
  'filter',
  'keywords',
]);

const sigmaKeyDeco = Decoration.mark({ class: 'cm-sigma-key' });
const objKeyDeco = Decoration.mark({ class: 'cm-sigma-objkey' });
const strDeco = Decoration.mark({ class: 'cm-sigma-string' });
const numDeco = Decoration.mark({ class: 'cm-sigma-number' });
const boolDeco = Decoration.mark({ class: 'cm-sigma-bool' });
const punctDeco = Decoration.mark({ class: 'cm-sigma-punct' });

/** A JSON token span with its decoration. */
interface Span {
  from: number;
  to: number;
  deco: Decoration;
}

/** Decoration-class names, exported so tests can assert token classification. */
export const SIGMA_TOKEN_CLASS = {
  sigmaKey: 'cm-sigma-key',
  objKey: 'cm-sigma-objkey',
  string: 'cm-sigma-string',
  number: 'cm-sigma-number',
  bool: 'cm-sigma-bool',
  punct: 'cm-sigma-punct',
} as const;

const DECO_CLASS = new Map<Decoration, string>([
  [sigmaKeyDeco, SIGMA_TOKEN_CLASS.sigmaKey],
  [objKeyDeco, SIGMA_TOKEN_CLASS.objKey],
  [strDeco, SIGMA_TOKEN_CLASS.string],
  [numDeco, SIGMA_TOKEN_CLASS.number],
  [boolDeco, SIGMA_TOKEN_CLASS.bool],
  [punctDeco, SIGMA_TOKEN_CLASS.punct],
]);

/**
 * Classify a JSON document into `{ text, class }` token spans. Pure + exported
 * for unit testing the Sigma-highlight logic without a CodeMirror host.
 */
export function classifyJsonTokens(
  doc: string,
): { text: string; class: string }[] {
  return tokenizeJson(doc).map((s) => ({
    text: doc.slice(s.from, s.to),
    class: DECO_CLASS.get(s.deco) ?? '',
  }));
}

/**
 * Single-pass JSON tokenizer producing decoration spans. Tolerant of invalid
 * input — it decorates whatever well-formed tokens it can find and stops
 * cleanly at the first malformed byte, so a half-typed document still gets
 * partial highlighting.
 */
function tokenizeJson(doc: string): Span[] {
  const spans: Span[] = [];
  let i = 0;
  const n = doc.length;

  while (i < n) {
    const ch = doc[i];

    // Whitespace.
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // String literal — also detect "is this a key?" by scanning past it.
    if (ch === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (doc[i] === '\\') {
          i += 2;
          continue;
        }
        if (doc[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      const end = i;
      // Look ahead past whitespace for a ':' → this string is an object key.
      let j = end;
      while (j < n && /\s/.test(doc[j])) j++;
      const isKey = doc[j] === ':';
      if (isKey) {
        const raw = doc.slice(start + 1, end - 1);
        spans.push({
          from: start,
          to: end,
          deco: SIGMA_KEYS.has(raw) ? sigmaKeyDeco : objKeyDeco,
        });
      } else {
        spans.push({ from: start, to: end, deco: strDeco });
      }
      continue;
    }

    // Number literal.
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      const start = i;
      i++;
      while (i < n && /[0-9.eE+-]/.test(doc[i])) i++;
      spans.push({ from: start, to: i, deco: numDeco });
      continue;
    }

    // Keyword literals: true / false / null.
    if (doc.startsWith('true', i)) {
      spans.push({ from: i, to: i + 4, deco: boolDeco });
      i += 4;
      continue;
    }
    if (doc.startsWith('false', i)) {
      spans.push({ from: i, to: i + 5, deco: boolDeco });
      i += 5;
      continue;
    }
    if (doc.startsWith('null', i)) {
      spans.push({ from: i, to: i + 4, deco: boolDeco });
      i += 4;
      continue;
    }

    // Structural punctuation.
    if (
      ch === '{' ||
      ch === '}' ||
      ch === '[' ||
      ch === ']' ||
      ch === ':' ||
      ch === ','
    ) {
      spans.push({ from: i, to: i + 1, deco: punctDeco });
      i++;
      continue;
    }

    // Anything else — skip one byte so a malformed document still progresses.
    i++;
  }

  return spans;
}

function buildDecorations(view: EditorView): DecorationSet {
  const spans = tokenizeJson(view.state.doc.toString());
  return Decoration.set(
    spans.map((s) => s.deco.range(s.from, s.to)),
    true,
  );
}

const sigmaHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// Colors map to design tokens via CSS vars (CodeMirror v6 accepts var() in
// theme strings). Sigma syntax mapping: key/objkey → accent shades for
// structure, string → positive, number → warning, bool → creator accent,
// punct → tertiary text.
const sigmaTheme = EditorView.theme({
  '.cm-sigma-key': { color: 'var(--accent-base)', fontWeight: '700' },
  '.cm-sigma-objkey': { color: 'var(--os-research)' },
  '.cm-sigma-string': { color: 'var(--positive)' },
  '.cm-sigma-number': { color: 'var(--warning)' },
  '.cm-sigma-bool': { color: 'var(--os-creator)', fontWeight: '600' },
  '.cm-sigma-punct': { color: 'var(--text-tertiary)' },
  '&': { fontSize: '12px' },
  '.cm-content': {
    fontFamily: '"JetBrains Mono", "Courier New", monospace',
    lineHeight: '1.55',
  },
});

export const SigmaDetectionEditor = forwardRef<
  SigmaDetectionEditorHandle,
  Props
>(function SigmaDetectionEditor(
  {
    initialText,
    onChange,
    onValidityChange,
    readOnly = false,
    className,
    height = '220px',
  },
  ref,
) {
  const cmRef = useRef<ReactCodeMirrorRef | null>(null);

  const extensions = useMemo(
    () => [sigmaHighlightPlugin, sigmaTheme, EditorView.lineWrapping],
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      getText() {
        return cmRef.current?.view?.state.doc.toString() ?? '';
      },
      setText(text: string) {
        const view = cmRef.current?.view;
        if (!view) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
        });
      },
    }),
    [],
  );

  function reportValidity() {
    if (!onValidityChange) return;
    const text = cmRef.current?.view?.state.doc.toString() ?? '';
    if (text.trim().length === 0) {
      onValidityChange(true);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      onValidityChange(
        typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed),
      );
    } catch {
      onValidityChange(false);
    }
  }

  return (
    <div
      className={className}
      data-testid="sigma-detection-editor"
      onBlur={reportValidity}
    >
      <CodeMirror
        ref={cmRef}
        value={initialText}
        height={height}
        theme={oneDark}
        extensions={extensions}
        editable={!readOnly}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          foldGutter: true,
          highlightActiveLine: true,
          bracketMatching: true,
          closeBrackets: true,
        }}
        onChange={(value) => onChange?.(value)}
      />
    </div>
  );
});
