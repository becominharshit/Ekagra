export type DialogueSpeaker = 'Alex' | 'Maya'

export interface DialogueTurn {
  id: string
  speaker: DialogueSpeaker
  heading?: string
  text: string
}

/** Converts Markdown + LaTeX snippets into natural spoken prose suitable for Web Speech Synthesis. */
export function stripToSpokenText(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' (worked code example) ')
    .replace(/\[(.*?)\]\([^)]+\)/g, '$1')
    .replace(/\[(?:p\.\s*\d+|\d{1,2}:\d{2}(?::\d{2})?)\]/gi, '')
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, expr: string) => ` ${speakMath(expr)} `)
    .replace(/\$([^$\n]+)\$/g, (_, expr: string) => ` ${speakMath(expr)} `)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_`~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function speakMath(expr: string): string {
  return expr
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 over $2')
    .replace(/\\mur\b/g, 'mu r')
    .replace(/\\times/g, ' times ')
    .replace(/\\cdot/g, ' dot ')
    .replace(/\\le\b/g, ' less than or equal to ')
    .replace(/\\ge\b/g, ' greater than or equal to ')
    .replace(/\\approx/g, ' approximately ')
    .replace(/\\to|\\rightarrow/g, ' to ')
    .replace(/\\([a-zA-Z]+)/g, '$1 ')
    .replace(/\^2\b/g, ' squared')
    .replace(/\^3\b/g, ' cubed')
    .replace(/[{}_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface ParsedSection {
  heading: string
  points: string[]
}

function parseNoteSections(markdown: string): { overview: string[]; sections: ParsedSection[] } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const overview: string[] = []
  const sections: ParsedSection[] = []
  let current: ParsedSection | null = null
  let inFence = false

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const headingMatch = line.match(/^#{1,3}\s+(.+)$/)
    if (headingMatch) {
      const heading = stripToSpokenText(headingMatch[1] ?? '')
      if (heading) {
        current = { heading, points: [] }
        sections.push(current)
      }
      continue
    }

    const cleaned = stripToSpokenText(line)
    if (!cleaned || cleaned.length < 4) continue
    if (current) current.points.push(cleaned)
    else overview.push(cleaned)
  }

  return { overview, sections }
}

/**
 * Builds an alternating two-host study podcast script ("Alex" & "Maya") from Markdown study notes.
 * Pure, deterministic, and offline-ready so Demo Mode and mobile WebView work identically.
 */
export function buildTwoHostDialogue(title: string, markdown: string): DialogueTurn[] {
  const cleanTitle = stripToSpokenText(title) || 'these study notes'
  const { overview, sections } = parseNoteSections(markdown)
  const nonEmptySections = sections.filter((section) => section.points.length > 0).slice(0, 8)
  const turns: DialogueTurn[] = []

  const introLead =
    nonEmptySections.length > 0
      ? `Welcome back to your Ekagra audio recap. Today Maya and I are breaking down "${cleanTitle}" across ${nonEmptySections.length} key sections.`
      : `Welcome back to your Ekagra audio recap. Today Maya and I are walking through "${cleanTitle}".`

  turns.push({ id: 'turn-intro-alex', speaker: 'Alex', heading: 'Intro', text: introLead })

  const teaser = overview.slice(0, 2).join(' ')
  turns.push({
    id: 'turn-intro-maya',
    speaker: 'Maya',
    heading: 'Big Picture',
    text:
      teaser ||
      `Let's keep this crisp and exam-focused so you can hear how every idea in ${cleanTitle} connects together.`,
  })

  if (nonEmptySections.length > 0) {
    nonEmptySections.forEach((section, index) => {
      const firstHalf = section.points.slice(0, 2).join(' ')
      const secondHalf = section.points.slice(2, 4).join(' ')
      const primarySpeaker: DialogueSpeaker = index % 2 === 0 ? 'Alex' : 'Maya'
      const followSpeaker: DialogueSpeaker = primarySpeaker === 'Alex' ? 'Maya' : 'Alex'

      turns.push({
        id: `turn-sec-${index}-a`,
        speaker: primarySpeaker,
        heading: section.heading,
        text: `Let's look at ${section.heading}. ${firstHalf}`,
      })

      if (secondHalf) {
        turns.push({
          id: `turn-sec-${index}-b`,
          speaker: followSpeaker,
          heading: section.heading,
          text: `And one key detail to lock in under ${section.heading}: ${secondHalf}`,
        })
      }
    })
  } else if (overview.length > 2) {
    const rest = overview.slice(2, 6)
    rest.forEach((line, index) => {
      turns.push({
        id: `turn-ov-${index}`,
        speaker: index % 2 === 0 ? 'Alex' : 'Maya',
        text: line,
      })
    })
  }

  const lastTopicList = nonEmptySections
    .slice(0, 3)
    .map((s) => s.heading)
    .join(', ')

  turns.push({
    id: 'turn-outro-alex',
    speaker: 'Alex',
    heading: 'Quick Recap',
    text: lastTopicList
      ? `To wrap up ${cleanTitle}, make sure you can explain ${lastTopicList} in your own words without peeking at the page.`
      : `That wraps up our quick walkthrough of ${cleanTitle}.`,
  })

  turns.push({
    id: 'turn-outro-maya',
    speaker: 'Maya',
    text: 'Try generating flashcards or a quick quiz next while these connections are fresh!',
  })

  return turns
}

export function formatDialogueTranscript(title: string, turns: DialogueTurn[]): string {
  const header = `${stripToSpokenText(title) || 'Study Notes'} — 2-Host Audio Summary\n`
  const body = turns
    .map((turn) => {
      const label = turn.heading ? `${turn.speaker} (${turn.heading})` : turn.speaker
      return `${label}: ${turn.text}`
    })
    .join('\n\n')
  return `${header}\n${body}\n`
}
