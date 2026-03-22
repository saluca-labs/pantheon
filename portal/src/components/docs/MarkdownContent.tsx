import { marked } from "marked";

interface MarkdownContentProps {
  content: string;
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  const html = marked.parse(content, { gfm: true, breaks: false }) as string;

  return (
    <article
      className="docs-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
