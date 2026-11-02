// A mind map note is a Markdown outline; Ekagra Studio writes it like this:
//   # Central idea
//   ## Branch              (or "- Branch")
//   - Point
//     - Detail
// parseOutline turns it into a tree for MindMap.tsx: the first "#" heading is the centre, later
// headings and list items hang below the heading before them (deeper lists below shallower
// ones), and other lines become points. Pure, tested in outline.test.ts.

export interface OutlineNode {
  label: string
  children: OutlineNode[]
}

const HEADING = /^ {0,3}(#{1,6})\s+(.*)$/
const LIST_ITEM = /^(\s*)(?:[-*+]|\d{1,3}[.)])\s+(.*)$/
const FENCE = /^\s*(```|~~~)/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const QUOTE = /^\s*(>\s?)+/
const CHECKBOX = /^\[[ xX]\]\s+/

/** List items always sit below headings (levels 1–6); their indentation adds to this. */
const LIST_LEVEL = 10

/** A label without Markdown marks: links keep their text; bold, italics and code lose their marks. */
export function plainLabel(text: string): string {
  return text
    .replace(/\s+#+\s*$/, '') // a heading's closing #s
    .replace(CHECKBOX, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/\*(\S(?:.*?\S)?)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function indentWidth(indent: string): number {
  return indent.replace(/\t/g, '    ').length
}

/** The outline as a tree. Its centre is the first "#" heading, or `fallbackTitle` (the note's title). */
export function parseOutline(markdown: string, fallbackTitle: string): OutlineNode {
  const root: OutlineNode = { label: fallbackTitle, children: [] }
  const path: { level: number; node: OutlineNode }[] = [{ level: 0, node: root }]
  let centred = false
  let inCode = false

  for (const line of markdown.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      inCode = !inCode
      continue
    }
    if (inCode || line.trim() === '' || RULE.test(line)) continue

    let level: number
    let text: string
    const heading = HEADING.exec(line)
    const item = heading ? null : LIST_ITEM.exec(line)
    if (heading) {
      level = heading[1]?.length ?? 1
      text = heading[2] ?? ''
      if (level === 1 && !centred && root.children.length === 0) {
        centred = true
        root.label = plainLabel(text) || fallbackTitle
        continue
      }
    } else if (item) {
      level = LIST_LEVEL + indentWidth(item[1] ?? '')
      text = item[2] ?? ''
    } else {
      level = LIST_LEVEL
      text = line.replace(QUOTE, '')
    }

    const label = plainLabel(text)
    if (!label) continue
    while (path.length > 1 && (path.at(-1)?.level ?? 0) >= level) path.pop()
    const node: OutlineNode = { label, children: [] }
    path.at(-1)?.node.children.push(node)
    path.push({ level, node })
  }
  return root
}

/** How many points the tree has below its centre. */
export function countNodes(node: OutlineNode): number {
  return node.children.reduce((total, child) => total + 1 + countNodes(child), 0)
}
