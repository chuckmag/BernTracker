import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownDescriptionProps {
  source: string
}

export default function MarkdownDescription({ source }: MarkdownDescriptionProps) {
  return (
    <div
      className="markdown-description text-sm text-slate-700 dark:text-gray-300"
      data-testid="markdown-description"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          h1: ({ children }) => <h1 className="text-lg font-semibold text-slate-950 dark:text-white mt-2 first:mt-0 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-slate-950 dark:text-white mt-2 first:mt-0 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-slate-950 dark:text-white mt-2 first:mt-0 mb-1">{children}</h3>,
          strong: ({ children }) => <strong className="font-semibold text-slate-950 dark:text-white">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-indigo-600 dark:text-indigo-400 underline">
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-200 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-200 p-3 rounded text-xs font-mono overflow-x-auto mb-2 last:mb-0">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-slate-300 dark:border-gray-700 pl-3 text-slate-500 dark:text-gray-400 italic mb-2 last:mb-0">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-slate-200 dark:border-gray-800 my-3" />,
          table: ({ children }) => (
            <div className="overflow-x-auto mb-2 last:mb-0">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-100 dark:bg-gray-800/50">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-slate-200 dark:border-gray-800">{children}</tr>,
          th: ({ children }) => <th className="px-2 py-1.5 text-left font-semibold text-slate-800 dark:text-gray-200 border border-slate-200 dark:border-gray-800">{children}</th>,
          td: ({ children }) => <td className="px-2 py-1.5 text-slate-700 dark:text-gray-300 border border-slate-200 dark:border-gray-800">{children}</td>,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
