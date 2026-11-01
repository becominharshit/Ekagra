import type {
  CheckQuestion,
  GenerateRequest,
  GenerateResponse,
  PaperAnswer,
  PaperRequest,
  SyllabusRequest,
  TopicTree,
  TreeTopic,
  TutorRequest,
  TutorResponse,
} from '@shared/schemas.ts'
import { minutesLabel } from '@/features/academics/labels'

// Demo Mode has no server and therefore no AI. Its "AI" answers are samples made on this device
// from the text the student gives, good enough to try every screen. They are always labelled.

export const DEMO_AI_NOTE = 'Demo Mode has no AI: this is a sample made on your device from your text. Sign in for real AI answers.'

const NEEDS_TEXT = "Demo Mode can't read photos or scanned PDFs (that needs the AI). Paste the text instead, or sign in."

const UNIT_LINE = /^(unit|module|chapter|part|section)\b\s*[-–:.]?\s*(\d+|[ivxlcdm]+\b)?\s*[-–:.)]?\s*(.*)$/i
const BULLET = /^[\s\-–—•*·▪●◦]+/
const NUMBERING = /^\(?(\d+(\.\d+)*|[a-z])[.)]\s+/i
const HOURS = /\(?\b\d+\s*(hours?|hrs?|lectures?|periods?)\b\)?\.?\s*$/i

function tidy(text: string): string {
  const cleaned = text.replace(BULLET, '').replace(NUMBERING, '').replace(HOURS, '').trim().replace(/[.:;,]+$/, '').trim()
  return (cleaned.charAt(0).toUpperCase() + cleaned.slice(1)).slice(0, 200)
}

/** "ER model, relational algebra; SQL" → three topics. */
function topicsInLine(line: string): string[] {
  const parts = /[,;]/.test(line) ? line.split(/[,;]/) : [line]
  return parts.map(tidy).filter((part) => part.length >= 3)
}

/**
 * A sample roadmap from syllabus text: lines starting with "Unit", "Module", … start a unit;
 * other lines (or their comma-separated parts) are topics. Each topic comes after the one before it.
 */
export function demoSyllabus(request: SyllabusRequest): TopicTree {
  const text = request.text?.trim()
  if (!text) throw new Error(NEEDS_TEXT)

  const units: { title: string; topics: string[] }[] = []
  let sawUnitLine = false
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const unit = UNIT_LINE.exec(line)
    if (unit) {
      sawUnitLine = true
      const label = [unit[1], unit[2]].filter(Boolean).join(' ')
      const rest = unit[3]?.trim() ?? ''
      // "Unit 1: ER model, SQL" names the topics right away; "Unit 1: Data models" is the unit's name.
      if (/[,;]/.test(rest)) units.push({ title: label, topics: topicsInLine(rest) })
      else units.push({ title: tidy(line) || label, topics: [] })
      continue
    }
    if (units.length === 0) units.push({ title: 'Topics', topics: [] })
    units[units.length - 1]?.topics.push(...topicsInLine(line))
  }

  let filled = units.filter((unit) => unit.topics.length > 0)
  // A plain list without units: split it into parts of 6 topics.
  if (!sawUnitLine && filled.length === 1 && (filled[0]?.topics.length ?? 0) > 8) {
    const all = filled[0]?.topics ?? []
    filled = Array.from({ length: Math.ceil(all.length / 6) }, (_, index) => ({
      title: `Part ${index + 1}`,
      topics: all.slice(index * 6, index * 6 + 6),
    }))
  }
  if (filled.length === 0) throw new Error("Couldn't find any topics in that text. Put each topic on its own line.")

  const tree: TopicTree = {
    units: filled.slice(0, 29).map((unit, unitIndex) => ({
      title: unit.title,
      topics: unit.topics.slice(0, 40).map((title, topicIndex): TreeTopic => ({
        key: `u${unitIndex + 1}t${topicIndex + 1}`,
        title,
        track: 'exam',
        estMinutes: title.length > 60 ? 90 : 60,
        difficulty: 3,
        examWeight: 0.5,
        prerequisites: topicIndex > 0 ? [`u${unitIndex + 1}t${topicIndex}`] : [],
      })),
    })),
  }
  tree.units.push({
    title: 'Skill track',
    topics: [
      {
        key: 'skill1',
        title: `Use ${request.subjectName} in a small project`,
        track: 'skill',
        estMinutes: 120,
        difficulty: 3,
        examWeight: 0,
        prerequisites: [],
      },
    ],
  })
  return tree
}

const QUESTION_START = /^\s*(?:q(?:uestion)?\s*\.?\s*\d+[a-z]?|\d+\s*[.)]|\(?[a-h]\)|\(?[ivx]+\))\s*[.:)-]?\s*/i
const MARKS = /\(\s*(\d+(?:\.\d+)?)\s*(?:marks?|m)\s*\)|\[\s*(\d+(?:\.\d+)?)\s*(?:marks?|m)?\s*\]|\b(\d+(?:\.\d+)?)\s*marks?\b/i
const STOP_WORDS = new Set(
  'the and for with what explain write give define describe discuss using between example short note notes marks following answer any two three all from its are how why which this that into your their briefly detail suitable diagram'.split(
    ' ',
  ),
)

function words(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z][a-z0-9+#]{2,}/g) ?? []).filter((word) => !STOP_WORDS.has(word)))
}

function questionType(text: string, marks: number | null): PaperAnswer['questions'][number]['type'] {
  if (/\(a\).*\(b\).*\(c\)|\bchoose the correct\b|\bwhich of the following\b/i.test(text)) return 'mcq'
  if (/\b(program|code|write an? (python|c|java)|sql|quer(y|ies)|function to)\b/i.test(text)) return 'code'
  if (/\b(calculate|compute|find the value|solve)\b/i.test(text)) return 'numerical'
  return marks !== null && marks >= 10 ? 'long' : 'short'
}

/**
 * A sample reading of a past paper: numbered lines (Q1, 1., (a)) start questions, "(5 marks)" gives
 * the marks, and each question goes to the topic it shares the most words with.
 */
export function demoPaper(request: PaperRequest): PaperAnswer {
  const text = request.text?.trim()
  if (!text) throw new Error(NEEDS_TEXT)

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !/^or$/i.test(line))
  const numbered = lines.some((line) => QUESTION_START.test(line))
  // With numbered questions, a line continues the question above it, and lines before Q1 are the
  // paper's heading. Without numbers, every line is a question.
  const blocks: string[] = []
  for (const line of lines) {
    if (!numbered) blocks.push(line)
    else if (QUESTION_START.test(line)) blocks.push(line.replace(QUESTION_START, ''))
    else if (blocks.length > 0) blocks[blocks.length - 1] += ` ${line}`
  }

  const topics = request.topics.map((topic) => ({ key: topic.key, words: words(topic.title) }))
  const questions = blocks
    .map((block) => {
      const found = MARKS.exec(block)
      const marks = found ? Number(found[1] ?? found[2] ?? found[3]) : null
      const questionText = block.replace(MARKS, '').replace(/\s+/g, ' ').trim()
      const own = words(questionText)
      let best: { key: string; score: number } | null = null
      for (const topic of topics) {
        const shared = [...topic.words].filter((word) => own.has(word)).length
        const score = shared / Math.max(1, topic.words.size)
        if (shared > 0 && score >= 0.34 && (!best || score > best.score)) best = { key: topic.key, score }
      }
      return { text: questionText.slice(0, 300), marks, type: questionType(questionText, marks), topicKey: best?.key ?? null }
    })
    .filter((question) => /[a-z]{3}/i.test(question.text))
    .slice(0, 150)

  const year = request.year ?? Number(/\b(199\d|20\d{2})\b/.exec(text)?.[1] ?? Number.NaN)
  return {
    year: Number.isFinite(year) ? year : null,
    examType: /end[\s-]*sem/i.test(text) ? 'End semester' : /mid[\s-]*(term|sem)/i.test(text) ? 'Mid term' : null,
    questions,
    promptVersion: 'demo-sample',
  }
}

const SAMPLE = '**Sample answer (Demo Mode has no AI).**'

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 15)
}

/** The page's sentences that share the most words with `about`, in page order. */
function relevantSentences(pageText: string, about: string, count = 3): string[] {
  const wanted = words(about)
  const scored = sentences(pageText).map((sentence, index) => ({
    sentence,
    index,
    score: [...words(sentence)].filter((word) => wanted.has(word)).length,
  }))
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence)
}

/** "Fill in the blank" cards: the longest word of each sentence becomes the answer. */
function clozeCards(text: string): TutorResponse['flashcards'] {
  return sentences(text)
    .slice(0, 5)
    .flatMap((sentence) => {
      const key = [...words(sentence)].filter((word) => word.length >= 5).sort((a, b) => b.length - a.length)[0]
      if (!key) return []
      const blanked = sentence.replace(new RegExp(`\\b${key}\\b`, 'i'), '_____')
      return blanked === sentence ? [] : [{ front: blanked.slice(0, 300), back: key }]
    })
}

const quote = (lines: string[]) => lines.map((line) => `> ${line}`).join('\n>\n')

/**
 * A sample tutor answer made from the page itself: the sentences that match the selection or the
 * question, the selection split into short points, or "fill in the blank" flashcards.
 */
export function demoTutor(request: TutorRequest): TutorResponse {
  const selected = request.selectedText?.trim() ?? ''
  const page = `p. ${request.pageNumber}`
  let answerMd: string
  let flashcards: TutorResponse['flashcards'] = []

  switch (request.action) {
    case 'explain': {
      const related = relevantSentences(request.pageText, selected)
      answerMd = related.length > 0 ? `${SAMPLE} What ${page} says around your selection:\n\n${quote(related)}` : `${SAMPLE} ${page} says:\n\n${quote([selected])}`
      break
    }
    case 'simplify': {
      const parts = selected.split(/[,;:]|\band\b/).map((part) => part.trim()).filter((part) => part.length > 2)
      answerMd = `${SAMPLE} Your selection in shorter pieces:\n\n${parts.map((part) => `- ${part}`).join('\n')}`
      break
    }
    case 'example':
      answerMd = `${SAMPLE} Make your own example: apply “${selected.slice(0, 120)}” to a small case you know, then check it against ${page}.`
      break
    case 'flashcards':
      flashcards = clozeCards(selected)
      answerMd =
        flashcards.length > 0
          ? `${SAMPLE} ${flashcards.length} "fill in the blank" card${flashcards.length === 1 ? '' : 's'} from your selection.`
          : `${SAMPLE} Select a full sentence or two to make cards.`
      break
    case 'ask': {
      const related = relevantSentences(request.pageText, request.question ?? '')
      answerMd = related.length > 0 ? `${SAMPLE} The parts of ${page} that match your question:\n\n${quote(related)}` : `${SAMPLE} ${page} doesn't seem to mention that.`
      break
    }
  }
  return { answerMd, flashcards, model: 'demo', promptVersion: 'demo-sample' }
}

/** What Demo Mode knows about a topic besides the request: facts from the student's roadmap. */
export interface DemoTopicFacts {
  otherUnits: string[]
  otherTopics: string[]
  pyqCount: number
  marksShare: number
}

/** An mcq whose right answer sits at a position that depends on the text (so it isn't always first). */
function mcq(prompt: string, right: string, wrong: string[], explanation: string): CheckQuestion {
  const options = wrong.slice(0, 3)
  const position = prompt.length % (options.length + 1)
  options.splice(position, 0, right)
  return { type: 'mcq', prompt, options, correctOption: position, answer: right, tolerance: null, keyPoints: [], explanation, difficulty: 1 }
}

/**
 * A sample lesson, check quiz and flashcards made from the student's own roadmap (which unit,
 * what comes before, how often it was asked, the planned time). It shows how studying a topic
 * works; the content itself needs the real AI.
 */
export function demoTopic(request: GenerateRequest, facts: DemoTopicFacts): GenerateResponse {
  const topic = `“${request.topicTitle}”`
  const unit = request.unitTitle ?? request.subjectName
  const minutes = request.estMinutes ?? 60
  const before = request.prerequisites ?? []
  const past = request.pastQuestions ?? []
  const asked = facts.pyqCount === 0 ? 'Not in your past papers yet' : `${facts.pyqCount} time${facts.pyqCount === 1 ? '' : 's'} (${Math.round(facts.marksShare * 100)}% of the marks)`

  const lessonMd = [
    '**Sample lesson (Demo Mode has no AI).** Sign in to get a real lesson written for this topic.',
    `## What this topic is\n${topic} is part of ${unit} in ${request.subjectName}. Your roadmap plans ${minutesLabel(minutes)} for it.`,
    `## Before you start\n${before.length > 0 ? `You learned ${before.join(', ')} first. Skim it again if it feels rusty.` : "It doesn't need another topic first."}`,
    `## How it was asked\n${past.length > 0 ? past.map((question) => `- ${question.text}${question.marks !== null ? ` (${question.marks} marks)` : ''}`).join('\n') : 'Not in your past papers yet.'}`,
    `## How to study it\n1. Read your notes or the textbook section on ${topic} once, without stopping.\n2. Close them and write the key ideas from memory.\n3. Take the check quiz below, then review the flashcards over the next days.`,
  ].join('\n\n')

  const questions: CheckQuestion[] = []
  if (request.unitTitle && facts.otherUnits.length >= 2) {
    questions.push(mcq(`Which unit of ${request.subjectName} is ${topic} in?`, request.unitTitle, facts.otherUnits, `Your roadmap puts it in ${request.unitTitle}.`))
  }
  const notBefore = facts.otherTopics.filter((title) => !before.includes(title))
  if (before[0] && notBefore.length >= 2) {
    questions.push(mcq(`Which topic should you learn before ${topic}?`, before[0], notBefore, `Your roadmap lists ${before.join(', ')} before it.`))
  }
  questions.push(
    mcq(
      `How much time does your roadmap plan for ${topic}?`,
      minutesLabel(minutes),
      [minutesLabel(Math.max(15, Math.round(minutes / 2))), minutesLabel(minutes * 2), minutesLabel(minutes + 30)],
      'You can change it with Edit roadmap.',
    ),
    {
      type: 'numerical',
      prompt: `In how many past exam questions was ${topic} asked?`,
      options: [],
      correctOption: null,
      answer: String(facts.pyqCount),
      tolerance: 0,
      keyPoints: [],
      explanation: `Your past papers: ${asked}.`,
      difficulty: 1,
    },
    {
      type: 'short',
      prompt: `Explain ${topic} in 2–3 sentences, as you would at the start of an exam answer.`,
      options: [],
      correctOption: null,
      answer: `Start with a one-line definition of ${request.topicTitle}, give one small example, and say where it is used or why it matters.`,
      tolerance: null,
      keyPoints: ['A one-line definition', 'One small example', 'Why it matters or where it is used'],
      explanation: 'This shape works for most short exam answers.',
      difficulty: 2,
    },
  )

  const flashcards = [
    { front: `Which unit is ${topic} in?`, back: unit },
    { front: `How much time does your plan give ${topic}?`, back: minutesLabel(minutes) },
    { front: `How often was ${topic} asked in past papers?`, back: asked },
    { front: `What should you learn before ${topic}?`, back: before.length > 0 ? before.join(', ') : "Nothing: it's a starting topic" },
    { front: `What are the 3 parts of a good short answer on ${topic}?`, back: 'A definition, an example, and why it matters' },
    ...past.slice(0, 3).map((question) => ({ front: question.text.slice(0, 300), back: 'Answer it in your own words: definition, example, why it matters. Then check your notes.' })),
  ]

  return { lessonMd, checkQuestions: questions.slice(-5), flashcards, model: 'demo', promptVersion: 'demo-sample' }
}
