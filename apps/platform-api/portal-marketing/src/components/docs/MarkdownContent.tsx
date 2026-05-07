import { marked, Renderer } from "marked";

/**
 * Server-side Markdown renderer using `marked`.
 * @security Uses dangerouslySetInnerHTML -- content must be trusted or pre-sanitized.
 */

interface MarkdownContentProps {
  content: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  const renderer = new Renderer();
  renderer.heading = ({ text, depth }: { text: string; depth: number }) => {
    const id = slugify(text);
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };

  const html = marked.parse(content, { gfm: true, breaks: false, renderer }) as string;

  return (
    <article
      className="docs-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
