import type { OutlineNode } from './outline'

/** A mind map from its outline: the centre on top, each main branch a card with its points nested inside. */
export function MindMap({ root }: { root: OutlineNode }) {
  const branches = root.children
  // Branches without points of their own read better as a row of chips than as many small cards.
  const flat = branches.every((branch) => branch.children.length === 0)

  return (
    <figure className="grid gap-4">
      <figcaption className="justify-self-start rounded-full bg-mode-study/10 px-4 py-1.5 font-heading text-base font-semibold text-mode-study">
        {root.label}
      </figcaption>
      {branches.length === 0 ? (
        <p className="text-sm text-muted-foreground">This mind map has no points yet.</p>
      ) : flat ? (
        <ul className="flex flex-wrap gap-2">
          {branches.map((branch, index) => (
            <li key={index} className="rounded-full px-3 py-1 text-sm ring-1 ring-foreground/15">
              {branch.label}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="gap-3 sm:columns-2">
          {branches.map((branch, index) => (
            <li key={index} className="mb-3 break-inside-avoid rounded-xl border-l-4 border-mode-study/60 bg-card p-3 ring-1 ring-foreground/10">
              <p className="font-medium">{branch.label}</p>
              {branch.children.length > 0 && <Points nodes={branch.children} />}
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}

function Points({ nodes }: { nodes: OutlineNode[] }) {
  return (
    <ul className="mt-1.5 grid gap-1 border-l border-border pl-3 text-sm">
      {nodes.map((node, index) => (
        <li key={index}>
          {node.label}
          {node.children.length > 0 && <Points nodes={node.children} />}
        </li>
      ))}
    </ul>
  )
}
