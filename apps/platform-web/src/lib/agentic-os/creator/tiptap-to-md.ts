/**
 * TipTap JSON to Markdown converter.
 *
 * Walks a TipTap JSON document AST recursively and produces a plain-text
 * Markdown string. Supports the node and mark types used by the shared
 * TipTapEditor component (StarterKit + TaskList + TaskItem + Underline +
 * Link + Image).
 *
 * Used by the book export pipeline to feed Pandoc.
 *
 * @license MIT — Tiresias Creator OS Phase 3 (internal).
 */

type Mark = {
  type: string;
  attrs?: Record<string, unknown>;
};

type TipTapNode = {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, unknown>;
};

function renderMarks(text: string, marks?: Mark[]): string {
  if (!marks || marks.length === 0) return text;

  let result = text;
  // Apply marks in a fixed order so nesting is consistent
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `**${result}**`;
        break;
      case 'italic':
        result = `*${result}*`;
        break;
      case 'code':
        result = `\`${result}\``;
        break;
      case 'strikethrough':
        result = `~~${result}~~`;
        break;
      case 'underline':
        // Markdown has no underline; keep text as-is
        break;
      case 'link': {
        const href = (mark.attrs?.href as string) ?? '';
        result = `[${result}](${href})`;
        break;
      }
      default:
        break;
    }
  }
  return result;
}

function walkInline(node: TipTapNode): string {
  if (node.type === 'text') {
    return renderMarks(node.text ?? '', node.marks);
  }
  if (node.type === 'hardBreak') {
    return '\n';
  }
  if (node.type === 'image') {
    const src = (node.attrs?.src as string) ?? '';
    const alt = (node.attrs?.alt as string) ?? '';
    return `![${alt}](${src})`;
  }
  // Recurse into children for inline content
  return walkChildren(node.content ?? []);
}

function walkChildren(children: TipTapNode[]): string {
  return children.map(walkNode).join('');
}

function walkBlockChildren(children: TipTapNode[]): string {
  return children.map(walkBlockNode).join('');
}

function wrapBlock(tag: { open: string; close: string }, content: string): string {
  if (!content.trim()) return '';
  return `${tag.open}${content}${tag.close}`;
}

function walkBlockNode(node: TipTapNode): string {
  // Handle block-level nodes that contain inline content
  switch (node.type) {
    case 'paragraph':
      return walkInline(node) + '\n\n';
    case 'heading': {
      const level = Number(node.attrs?.level) || 1;
      const text = walkInline(node);
      if (!text.trim()) return '';
      return `${'#'.repeat(Math.min(level, 3))} ${text.trim()}\n\n`;
    }
    case 'blockquote': {
      const content = walkBlockChildren(node.content ?? []);
      if (!content.trim()) return '';
      // Prefix each non-empty line with '> '
      return content
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => `> ${l}`)
        .join('\n') + '\n\n';
    }
    case 'codeBlock': {
      const language = (node.attrs?.language as string) ?? '';
      const text = walkInline(node);
      return `\`\`\`${language}\n${text}\n\`\`\`\n\n`;
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return walkBlockChildren(node.content ?? []) + '\n';
    case 'listItem': {
      const content = walkBlockChildren(node.content ?? []);
      // Remove trailing newlines from inner content for cleaner list items
      const trimmed = content.replace(/\n+$/, '');
      return `- ${trimmed}\n`;
    }
    case 'taskItem': {
      const checked = node.attrs?.checked === true;
      const content = walkBlockChildren(node.content ?? []);
      const trimmed = content.replace(/\n+$/, '');
      return `- [${checked ? 'x' : ' '}] ${trimmed}\n`;
    }
    case 'horizontalRule':
      return '---\n\n';
    default:
      // Unknown block node — try inline rendering
      return walkInline(node) + '\n\n';
  }
}

function walkNode(node: TipTapNode): string {
  switch (node.type) {
    case 'doc':
      return walkBlockChildren(node.content ?? []).trimEnd() + '\n';
    case 'paragraph':
      return walkInline(node);
    default:
      return walkInline(node);
  }
}

/**
 * Convert a TipTap JSON AST to a Markdown string.
 */
export function tiptapJsonToMarkdown(json: Record<string, unknown>): string {
  try {
    const doc = json as unknown as TipTapNode;
    if (!doc || doc.type !== 'doc') {
      return '';
    }
    return walkBlockChildren(doc.content ?? []).trimEnd() + '\n';
  } catch {
    return '';
  }
}
