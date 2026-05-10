'use client';

/**
 * Filmmaker OS — StoryDocumentEditor.
 *
 * Wraps TipTap (StarterKit + Placeholder + CharacterCount + Link) with
 * a debounced autosave that PATCHes back to the document API every
 * 1500 ms after typing stops. Snapshot/version writes are explicit and
 * handled by the parent page — autosave never spams the version table.
 *
 * @license MIT — Tiresias Filmmaker OS (internal).
 */

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import Link from '@tiptap/extension-link';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  Quote,
  Code,
} from 'lucide-react';
import type { StoryDocument, ProseMirrorJson } from '@/lib/agentic-os/filmmaker/story-documents';

const AUTOSAVE_DEBOUNCE_MS = 1500;

export interface StoryDocumentEditorHandle {
  getCurrentJson(): ProseMirrorJson;
  getWordCount(): number;
  getEditor(): Editor | null;
}

interface Props {
  documentId: string;
  initialContentJson: ProseMirrorJson;
  initialTitle: string;
  placeholder?: string;
  onSaved?: (saved: StoryDocument) => void;
  onError?: (error: Error) => void;
  onTitleChange?: (next: string) => void;
}

export const StoryDocumentEditor = forwardRef<StoryDocumentEditorHandle, Props>(
  function StoryDocumentEditor(props, ref) {
    const {
      documentId,
      initialContentJson,
      initialTitle,
      placeholder,
      onSaved,
      onError,
      onTitleChange,
    } = props;

    const [title, setTitle] = useState(initialTitle);
    const [wordCount, setWordCount] = useState(0);
    const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingRef = useRef<{ contentJson?: ProseMirrorJson; title?: string }>({});

    const editor = useEditor({
      // Avoid SSR hydration mismatch — render only on the client.
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: placeholder ?? 'Start writing…',
        }),
        CharacterCount.configure({}),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { class: 'text-[#4361EE] underline underline-offset-2' },
        }),
      ],
      content: initialContentJson as any,
      editorProps: {
        attributes: {
          class:
            'tiptap-story-doc prose prose-invert max-w-none min-h-[24rem] focus:outline-none ' +
            'text-white/95 leading-relaxed',
        },
      },
      onUpdate: ({ editor }) => {
        const json = editor.getJSON() as ProseMirrorJson;
        const text = editor.getText();
        setWordCount(countWordsClient(text));
        pendingRef.current = { ...pendingRef.current, contentJson: json };
        scheduleSave();
      },
    });

    useImperativeHandle(
      ref,
      () => ({
        getCurrentJson: () => (editor ? (editor.getJSON() as ProseMirrorJson) : initialContentJson),
        getWordCount: () => wordCount,
        getEditor: () => editor,
      }),
      [editor, wordCount, initialContentJson],
    );

    // Seed initial word count on mount.
    useEffect(() => {
      if (!editor) return;
      setWordCount(countWordsClient(editor.getText()));
    }, [editor]);

    const flushSave = useCallback(async () => {
      const body = pendingRef.current;
      if (Object.keys(body).length === 0) return;
      pendingRef.current = {};
      setSavingState('saving');
      try {
        const r = await fetch(
          `/api/tiresias/agentic-os/filmmaker/story-documents/${documentId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? `Save failed (${r.status})`);
        }
        const data = (await r.json()) as { document: StoryDocument };
        setSavingState('saved');
        setErrorMsg(null);
        onSaved?.(data.document);
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Save failed');
        setSavingState('error');
        setErrorMsg(e.message);
        onError?.(e);
      }
    }, [documentId, onSaved, onError]);

    const scheduleSave = useCallback(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        flushSave();
      }, AUTOSAVE_DEBOUNCE_MS);
    }, [flushSave]);

    useEffect(
      () => () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      },
      [],
    );

    function handleTitleChange(value: string) {
      setTitle(value);
      onTitleChange?.(value);
      pendingRef.current = { ...pendingRef.current, title: value };
      scheduleSave();
    }

    return (
      <div className="space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="w-full bg-transparent border-b border-[#2a2d3e] focus:border-[#4361EE] outline-none text-2xl font-semibold text-white py-2"
          placeholder="Document title"
        />

        {editor && <Toolbar editor={editor} />}

        <div className="rounded-xl border border-[#2a2d3e] bg-[#1a1d27] p-5">
          <EditorContent editor={editor} />
        </div>

        <div className="flex items-center justify-between text-xs text-[#94a3b8]">
          <span>{wordCount.toLocaleString()} words</span>
          <span>
            {savingState === 'saving' && 'Saving…'}
            {savingState === 'saved' && 'Saved'}
            {savingState === 'idle' && ' '}
            {savingState === 'error' && (
              <span className="text-red-300">Save failed: {errorMsg}</span>
            )}
          </span>
        </div>
      </div>
    );
  },
);

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: Editor }) {
  const btn =
    'inline-flex items-center justify-center w-8 h-8 rounded border border-[#2a2d3e] ' +
    'bg-[#0f1117] text-[#cbd5e1] hover:text-white hover:border-[#4361EE]/60 transition ' +
    'data-[active=true]:bg-[#4361EE]/20 data-[active=true]:text-white data-[active=true]:border-[#4361EE]/60';

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] p-2">
      <button
        type="button"
        className={btn}
        data-active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="Bold"
      >
        <Bold className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={btn}
        data-active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Italic"
      >
        <Italic className="w-4 h-4" />
      </button>
      <div className="w-px h-5 bg-[#2a2d3e] mx-1" />
      <button
        type="button"
        className={btn}
        data-active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        aria-label="Heading 1"
      >
        <Heading1 className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={btn}
        data-active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        aria-label="Heading 2"
      >
        <Heading2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={btn}
        data-active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        aria-label="Heading 3"
      >
        <Heading3 className="w-4 h-4" />
      </button>
      <div className="w-px h-5 bg-[#2a2d3e] mx-1" />
      <button
        type="button"
        className={btn}
        data-active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-label="Bullet list"
      >
        <List className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={btn}
        data-active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        aria-label="Ordered list"
      >
        <ListOrdered className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={btn}
        data-active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        aria-label="Blockquote"
      >
        <Quote className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={btn}
        data-active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        aria-label="Code block"
      >
        <Code className="w-4 h-4" />
      </button>
      <div className="w-px h-5 bg-[#2a2d3e] mx-1" />
      <button
        type="button"
        className={btn}
        data-active={editor.isActive('link')}
        onClick={() => {
          const previous = editor.getAttributes('link').href as string | undefined;
          const url = window.prompt('Link URL (empty to remove)', previous ?? '');
          if (url === null) return;
          if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }}
        aria-label="Link"
      >
        <LinkIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Client-side helpers ─────────────────────────────────────────────────────

function countWordsClient(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).filter((t) => t.length > 0).length;
}
