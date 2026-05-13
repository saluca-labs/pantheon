'use client';

/**
 * Shared TipTap rich-text editor component.
 *
 * Wraps @tiptap/react with StarterKit, Placeholder, TaskList, TaskItem,
 * Underline, Link, and Image extensions. Styled for the Pantheon dark theme.
 *
 * Content is stored and emitted as TipTap JSON (Record<string, unknown>),
 * matching the JSONB columns in the agos_creator_* tables.
 *
 * @license MIT — Tiresias platform (internal).
 */

import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';

interface TipTapEditorProps {
  content: Record<string, unknown>;
  onChange: (json: Record<string, unknown>) => void;
  placeholder?: string;
  editable?: boolean;
}

export function TipTapEditor({
  content,
  onChange,
  placeholder = 'Start writing…',
  editable = true,
}: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Underline,
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          class: 'text-[#4361EE] underline cursor-pointer hover:text-[#5a7bff]',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg max-w-full',
        },
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON() as Record<string, unknown>);
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-invert max-w-none focus:outline-none min-h-[300px] px-4 py-3',
      },
    },
  });

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // Re-initialize content when the content prop changes externally
  useEffect(() => {
    if (editor) {
      const currentJson = JSON.stringify(editor.getJSON());
      const propJson = JSON.stringify(content);
      if (currentJson !== propJson) {
        editor.commands.setContent(content);
      }
    }
  }, [editor, content]);

  if (!editor) {
    return (
      <div className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] min-h-[300px] flex items-center justify-center">
        <p className="text-sm text-[#94a3b8]">Loading editor…</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#2a2d3e] bg-[#0f1117] overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-[#2a2d3e] bg-[#1a1d27]">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          label="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          label="Italic"
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          label="Underline"
        >
          <u>U</u>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          label="Strikethrough"
        >
          <s>S</s>
        </ToolbarButton>

        <div className="w-px h-5 bg-[#2a2d3e] mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          label="Heading 1"
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          label="Heading 2"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          label="Heading 3"
        >
          H3
        </ToolbarButton>

        <div className="w-px h-5 bg-[#2a2d3e] mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          label="Bullet list"
        >
          &bull; List
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          label="Ordered list"
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive('taskList')}
          label="Task list"
        >
          &#x2611; Tasks
        </ToolbarButton>

        <div className="w-px h-5 bg-[#2a2d3e] mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          label="Blockquote"
        >
          &ldquo;Quote
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive('codeBlock')}
          label="Code block"
        >
          &lt;/&gt; Code
        </ToolbarButton>

        <div className="w-px h-5 bg-[#2a2d3e] mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          label="Divider"
        >
          &mdash;
        </ToolbarButton>
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`px-2 py-1 rounded text-xs font-medium transition ${
        active
          ? 'bg-[#4361EE]/20 text-[#4361EE]'
          : 'text-[#94a3b8] hover:text-white hover:bg-[#2a2d3e]'
      }`}
    >
      {children}
    </button>
  );
}
