'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

interface Props {
  markdown: string;
}

/**
 * Renders an Agentic OS execution plan markdown file with the platform's
 * dark theme. Sanitized via rehype-sanitize — no inline scripts or raw HTML.
 */
export function PlanViewer({ markdown }: Props) {
  return (
    <div className="agentic-os-plan max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: (props) => (
            <h1 className="text-2xl font-semibold text-white mt-8 mb-4 first:mt-0" {...props} />
          ),
          h2: (props) => (
            <h2 className="text-xl font-semibold text-white mt-8 mb-3 border-b border-border-subtle pb-2" {...props} />
          ),
          h3: (props) => (
            <h3 className="text-lg font-semibold text-white mt-6 mb-2" {...props} />
          ),
          h4: (props) => (
            <h4 className="text-base font-semibold text-white mt-4 mb-2" {...props} />
          ),
          p: (props) => <p className="text-text-primary leading-relaxed mb-4" {...props} />,
          ul: (props) => <ul className="list-disc list-outside ml-6 mb-4 text-text-primary space-y-1" {...props} />,
          ol: (props) => <ol className="list-decimal list-outside ml-6 mb-4 text-text-primary space-y-1" {...props} />,
          li: (props) => <li className="leading-relaxed" {...props} />,
          a: (props) => (
            <a
              className="text-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          code: ({ children, ...props }) => {
            const isInline = !String(children).includes('\n');
            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-surface-0 text-[#fbbf24] text-[0.85em] border border-border-subtle"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className="block text-text-primary text-sm font-mono" {...props}>
                {children}
              </code>
            );
          },
          pre: (props) => (
            <pre
              className="rounded-lg bg-surface-0 border border-border-subtle p-4 mb-4 overflow-x-auto"
              {...props}
            />
          ),
          blockquote: (props) => (
            <blockquote
              className="border-l-4 border-accent/60 pl-4 italic text-text-secondary mb-4"
              {...props}
            />
          ),
          table: (props) => (
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full border-collapse border border-border-subtle text-sm" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="border border-border-subtle bg-surface-0 px-3 py-2 text-left text-white font-semibold"
              {...props}
            />
          ),
          td: (props) => (
            <td className="border border-border-subtle px-3 py-2 text-text-primary align-top" {...props} />
          ),
          hr: () => <hr className="my-6 border-border-subtle" />,
          strong: (props) => <strong className="text-white font-semibold" {...props} />,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
