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
            <h2 className="text-xl font-semibold text-white mt-8 mb-3 border-b border-[#2a2d3e] pb-2" {...props} />
          ),
          h3: (props) => (
            <h3 className="text-lg font-semibold text-white mt-6 mb-2" {...props} />
          ),
          h4: (props) => (
            <h4 className="text-base font-semibold text-white mt-4 mb-2" {...props} />
          ),
          p: (props) => <p className="text-[#cbd5e1] leading-relaxed mb-4" {...props} />,
          ul: (props) => <ul className="list-disc list-outside ml-6 mb-4 text-[#cbd5e1] space-y-1" {...props} />,
          ol: (props) => <ol className="list-decimal list-outside ml-6 mb-4 text-[#cbd5e1] space-y-1" {...props} />,
          li: (props) => <li className="leading-relaxed" {...props} />,
          a: (props) => (
            <a
              className="text-[#4361EE] hover:underline"
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
                  className="px-1.5 py-0.5 rounded bg-[#0f1117] text-[#fbbf24] text-[0.85em] border border-[#2a2d3e]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className="block text-[#cbd5e1] text-sm font-mono" {...props}>
                {children}
              </code>
            );
          },
          pre: (props) => (
            <pre
              className="rounded-lg bg-[#0f1117] border border-[#2a2d3e] p-4 mb-4 overflow-x-auto"
              {...props}
            />
          ),
          blockquote: (props) => (
            <blockquote
              className="border-l-4 border-[#4361EE]/60 pl-4 italic text-[#94a3b8] mb-4"
              {...props}
            />
          ),
          table: (props) => (
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full border-collapse border border-[#2a2d3e] text-sm" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="border border-[#2a2d3e] bg-[#0f1117] px-3 py-2 text-left text-white font-semibold"
              {...props}
            />
          ),
          td: (props) => (
            <td className="border border-[#2a2d3e] px-3 py-2 text-[#cbd5e1] align-top" {...props} />
          ),
          hr: () => <hr className="my-6 border-[#2a2d3e]" />,
          strong: (props) => <strong className="text-white font-semibold" {...props} />,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
