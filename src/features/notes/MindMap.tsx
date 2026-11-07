import { Markdown } from '@/components/Markdown'
import { cn } from '@/lib/utils'
import type { OutlineNode } from './outline'

// A mind map drawn as a flowchart: the centre on the left, main branches in a column, and each
// branch's points in a column of their own, joined by elbow connectors. It reads top to bottom and
// left to right, and scrolls sideways on a phone rather than squeezing the boxes.
// Labels go through Markdown, so a formula between $…$ (studio-notes-v4) is drawn by KaTeX.

const LINE = ['border-mode-study/40', 'border-mode-study/30', 'border-border'] as const

function lineClass(depth: number): string {
  return LINE[Math.min(depth, LINE.length) - 1] ?? 'border-border'
}

function labelClass(depth: number): string {
  if (depth === 0) return 'w-48 rounded-2xl bg-mode-study px-4 py-3 text-center font-heading text-base font-semibold text-white shadow-sm'
  if (depth === 1) return 'w-44 rounded-xl border-l-4 border-mode-study bg-card px-3 py-2 text-sm font-medium shadow-sm ring-1 ring-foreground/10'
  if (depth === 2) return 'w-44 rounded-lg bg-mode-study/5 px-3 py-2 text-sm ring-1 ring-mode-study/15'
  return 'w-44 rounded-lg bg-muted px-3 py-2 text-sm'
}

function Box({ label, depth }: { label: string; depth: number }) {
  return (
    <div className={cn('shrink-0', labelClass(depth))}>
      <Markdown className="[&_p]:my-0 [&_p]:leading-snug [&_.katex]:text-[1em]">{label}</Markdown>
    </div>
  )
}

/** A column of nodes joined to the box on their left by one vertical trunk and an elbow each. */
function Branches({ nodes, depth }: { nodes: OutlineNode[]; depth: number }) {
  const line = lineClass(depth)
  return (
    <ul className="relative flex flex-col gap-3 pl-7">
      <span aria-hidden className={cn('absolute inset-y-3 left-0 border-l-2', line)} />
      {nodes.map((node, index) => (
        <li key={index} className="relative flex items-center">
          <span aria-hidden className={cn('absolute -left-7 top-1/2 w-7 border-t-2', line)} />
          <Box label={node.label} depth={depth} />
          {node.children.length > 0 && (
            <>
              <span aria-hidden className="h-0.5 w-7 shrink-0 bg-mode-study/40" />
              <Branches nodes={node.children} depth={depth + 1} />
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

/** A mind map from its outline: the centre, its branches, and every point below them as a flowchart. */
export function MindMap({ root }: { root: OutlineNode }) {
  return (
    <figure className="grid gap-3">
      <figcaption className="sr-only">Mind map: {root.label}</figcaption>
      {root.children.length === 0 ? (
        <p className="text-sm text-muted-foreground">This mind map has no points yet.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground sm:hidden">Scroll sideways to see the whole map.</p>
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max items-center">
              <Box label={root.label} depth={0} />
              <span aria-hidden className="h-0.5 w-7 shrink-0 bg-mode-study/40" />
              <Branches nodes={root.children} depth={1} />
            </div>
          </div>
        </>
      )}
    </figure>
  )
}
