import { isValidElement, type ReactNode } from 'react'
import 'katex/dist/katex.min.css'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import ReactMarkdown, { type Components } from 'react-markdown'
import { linkifyCitationsInMarkdown } from '@/features/notes/citations'
import { headingSlug, sanitizeLatex } from '@/features/notes/notes'
import { cn } from '@/lib/utils'

// AI answers are Markdown. react-markdown never runs HTML from the text, so an answer can't
// inject anything into the page. External links stay plain text: the AI must never invent URLs.
// Internal citation links (`cite:page/N` and `cite:time/SEC`) render as interactive jump buttons
// when navigation handlers are provided.
// Formulas are LaTeX: $…$ in a sentence, $$…$$ on its own line. A broken formula renders gracefully
// without crashing the whole note; display formulas scroll sideways on a phone.

function findKatexAnnotation(node: ReactNode): string | null {
  if (!isValidElement<{ children?: ReactNode; encoding?: string }>(node)) return null
  if (node.type === 'annotation') return nodeText(node.props.children)
  if (Array.isArray(node.props.children)) {
    for (const child of node.props.children) {
      const found = findKatexAnnotation(child)
      if (found !== null) return found
    }
  } else if (node.props.children) {
    return findKatexAnnotation(node.props.children)
  }
  return null
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (isValidElement<{ children?: ReactNode; className?: string }>(node)) {
    const className = typeof node.props.className === 'string' ? node.props.className : ''
    if (className.includes('katex-html')) return ''
    if (className.includes('katex-mathml') || className.includes('katex')) {
      const tex = findKatexAnnotation(node)
      if (tex !== null) return `$${tex}$`
    }
    return nodeText(node.props.children)
  }
  return ''
}

function safeMarkdownUrl(url: string): string {
  if (url.startsWith('cite:page/') || url.startsWith('cite:time/')) return url
  return ''
}

export function Markdown({
  children,
  className,
  inline = false,
  onCitePage,
  onCiteTimestamp,
}: {
  children: string
  className?: string
  inline?: boolean
  onCitePage?: (pageNumber: number) => void
  onCiteTimestamp?: (seconds: number) => void
}) {
  const sanitized = sanitizeLatex(children)
  const prepared =
    onCitePage || onCiteTimestamp
      ? linkifyCitationsInMarkdown(sanitized, { enablePage: Boolean(onCitePage), enableTime: Boolean(onCiteTimestamp) })
      : sanitized

  const components: Components = {
    ...(inline ? { p: ({ children: pChildren }) => <>{pChildren}</> } : {}),
    a: ({ href, children: linkChildren }) => {
      if (href?.startsWith('cite:page/') && onCitePage) {
        const page = Number(href.slice('cite:page/'.length))
        if (Number.isInteger(page) && page >= 1) {
          return (
            <button
              type="button"
              onClick={() => onCitePage(page)}
              className="mx-0.5 inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[0.8em] font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:bg-primary/20"
            >
              {linkChildren}
            </button>
          )
        }
      }
      if (href?.startsWith('cite:time/') && onCiteTimestamp) {
        const sec = Number(href.slice('cite:time/'.length))
        if (Number.isInteger(sec) && sec >= 0) {
          return (
            <button
              type="button"
              onClick={() => onCiteTimestamp(sec)}
              className="mx-0.5 inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[0.8em] font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:bg-primary/20"
            >
              {linkChildren}
            </button>
          )
        }
      }
      return <span className="underline decoration-dotted">{linkChildren}</span>
    },
    h2: ({ children: headingChildren }) => (
      <h2 id={headingSlug(nodeText(headingChildren))} className="scroll-mt-20">
        {headingChildren}
      </h2>
    ),
  }

  if (inline) {
    return (
      <span className={cn('inline break-words [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_.katex]:text-[1em]', className)}>
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
          urlTransform={safeMarkdownUrl}
          components={components}
        >
          {prepared}
        </ReactMarkdown>
      </span>
    )
  }

  return (
    <div
      className={cn(
        'text-sm leading-relaxed break-words',
        '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
        '[&_h1]:mt-3 [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-medium [&_strong]:font-semibold',
        '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
        '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1 [&_.katex]:text-[1.05em]',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        urlTransform={safeMarkdownUrl}
        components={components}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  )
}
