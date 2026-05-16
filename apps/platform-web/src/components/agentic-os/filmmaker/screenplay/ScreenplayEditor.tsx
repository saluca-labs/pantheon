'use client';

/**
 * Filmmaker OS — ScreenplayEditor.
 *
 * CodeMirror 6 host with lightweight Fountain decoration. This is NOT a
 * real Fountain language definition — it's a line-decoration heuristic
 * that highlights scene headings, character cues, parentheticals, and
 * transitions. Full syntax mode lives in a follow-up phase.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
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

export interface ScreenplayEditorHandle {
  scrollToLine(lineNumber: number): void;
  getText(): string;
  setText(text: string): void;
}

interface Props {
  initialText: string;
  onChange?: (text: string) => void;
  readOnly?: boolean;
  className?: string;
  height?: string;
}

const SCENE_HEADING_RE =
  /^\s*(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\/EXT|EXT\/INT|I\/E\.?|INT\.?|EXT\.?|EST\.?)\b/i;
const TRANSITION_RE = /^\s*(>|.*TO:\s*$)/;
const PARENTHETICAL_RE = /^\s*\(.*\)\s*$/;

function isUppercaseCue(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return false;
  if (/[a-z]/.test(trimmed)) return false;
  // Allow letters, digits, spaces, punctuation, parenthetical V.O.s.
  return /[A-Z]/.test(trimmed);
}

const sceneHeadingDeco = Decoration.line({
  attributes: { class: 'cm-fountain-scene' },
});
const characterCueDeco = Decoration.line({
  attributes: { class: 'cm-fountain-character' },
});
const parentheticalDeco = Decoration.line({
  attributes: { class: 'cm-fountain-parenthetical' },
});
const transitionDeco = Decoration.line({
  attributes: { class: 'cm-fountain-transition' },
});

function buildDecorations(view: EditorView): DecorationSet {
  const builder: { from: number; deco: Decoration }[] = [];
  const doc = view.state.doc;
  let prevBlank = true;
  let prevSceneHeading = false;
  let prevTransition = false;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    if (text.trim().length === 0) {
      prevBlank = true;
      prevSceneHeading = false;
      prevTransition = false;
      continue;
    }
    if (SCENE_HEADING_RE.test(text)) {
      builder.push({ from: line.from, deco: sceneHeadingDeco });
      prevBlank = false;
      prevSceneHeading = true;
      prevTransition = false;
      continue;
    }
    if (text.trimStart().startsWith('>') || /TO:\s*$/.test(text.trimEnd())) {
      builder.push({ from: line.from, deco: transitionDeco });
      prevBlank = false;
      prevTransition = true;
      prevSceneHeading = false;
      continue;
    }
    if (PARENTHETICAL_RE.test(text)) {
      builder.push({ from: line.from, deco: parentheticalDeco });
      prevBlank = false;
      prevSceneHeading = false;
      prevTransition = false;
      continue;
    }
    if (
      isUppercaseCue(text) &&
      (prevBlank || prevSceneHeading || prevTransition)
    ) {
      builder.push({ from: line.from, deco: characterCueDeco });
      prevBlank = false;
      prevSceneHeading = false;
      prevTransition = false;
      continue;
    }
    prevBlank = false;
    prevSceneHeading = false;
    prevTransition = false;
  }
  return Decoration.set(builder.map((b) => b.deco.range(b.from)));
}

const fountainHighlightPlugin = ViewPlugin.fromClass(
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
// theme strings). Fountain syntax mapping: scene → warning (amber heading),
// character → os-research (cyan name), parenthetical → text-secondary,
// transition → os-creator (pink). The scene backgroundColor stays as an rgba
// literal because there's no token for an alpha-modulated warning fill.
const fountainTheme = EditorView.theme({
  '.cm-fountain-scene': {
    fontWeight: '700',
    fontSize: '1.05em',
    color: 'var(--warning)',
    backgroundColor: 'rgba(251,191,36,0.05)',
  },
  '.cm-fountain-character': {
    fontWeight: '700',
    color: 'var(--os-research)',
    paddingLeft: '4em',
  },
  '.cm-fountain-parenthetical': {
    fontStyle: 'italic',
    color: 'var(--text-secondary)',
    paddingLeft: '3em',
  },
  '.cm-fountain-transition': {
    fontWeight: '600',
    color: 'var(--os-creator)',
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  '&': { fontSize: '14px' },
  '.cm-content': {
    fontFamily: '"Courier Prime", "Courier New", monospace',
    lineHeight: '1.5',
  },
});

export const ScreenplayEditor = forwardRef<ScreenplayEditorHandle, Props>(
  function ScreenplayEditor(
    { initialText, onChange, readOnly = false, className, height = '600px' },
    ref,
  ) {
    const cmRef = useRef<ReactCodeMirrorRef | null>(null);

    const extensions = useMemo(
      () => [fountainHighlightPlugin, fountainTheme, EditorView.lineWrapping],
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        scrollToLine(lineNumber: number) {
          const view = cmRef.current?.view;
          if (!view) return;
          if (lineNumber < 1 || lineNumber > view.state.doc.lines) return;
          const line = view.state.doc.line(lineNumber);
          view.dispatch({
            selection: { anchor: line.from },
            effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
          });
          view.focus();
        },
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

    return (
      <div className={className}>
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
            foldGutter: false,
            highlightActiveLine: true,
          }}
          onChange={(value) => onChange?.(value)}
        />
      </div>
    );
  },
);
