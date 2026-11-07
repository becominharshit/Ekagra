import 'katex/dist/katex.min.css'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import ReactMarkdown, { type Components } from 'react-markdown'
import { cn } from '@/lib/utils'

// AI answers are Markdown. react-markdown never runs HTML from the text, so an answer can't
// inject anything into the page. Links are shown as plain text: the AI must never invent URLs.
// Formulas are LaTeX: $…$ in a sentence, $$…$$ on its own line. A broken formula shows in red
// instead of failing the whole note; display formulas scroll sideways on a phone.

const COMPONENTS: Components = {
  a: ({ children }) => <span className="underline decoration-dotted">{children}</span>,
}

export function Markdown({ children, className }: { children: string; className?: string }) {
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
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
