import { GradeResponseSchema, type GradeItem, type GradeRequest } from '@shared/schemas.ts'
import { callAiFunction } from '@/features/ai/aiClient'
import type { DataSource } from '@/lib/dataSource'

// Marking written answers (short and long answers of a mock test). Signed in, ai-grade marks them
// like an examiner. Demo Mode (and when the AI can't be reached) compares the answer's words with
// the key points or the model answer on the device: a rough check, so the student can change it.

export interface Grade {
  key: string
  /** Marks given; null = nothing to compare with, the student marks it. */
  awarded: number | null
  feedback: string
  missing: string[]
  modelAnswer: string | null
  by: 'ai' | 'device'
}

const STOP_WORDS = new Set(
  'the and for with that this from are was were which what when where into than then they them have has had not but can its your their there been also each such more most other some only will would should could about between over under using used use one two how why who all any may must per via'.split(' '),
)

/** The words that carry meaning ("Normalisation removes redundancy" → normalisation, removes, redundancy). */
export function keyWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? []
  // "rows" and "row" count as the same word ("class" stays "class").
  return new Set(
    words.filter((word) => word.length >= 3 && !STOP_WORDS.has(word)).map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word)),
  )
}

/** The share (0–1) of a text's key words that the answer uses. */
function covered(text: string, answer: Set<string>): number {
  const words = [...keyWords(text)]
  return words.length === 0 ? 0 : words.filter((word) => answer.has(word)).length / words.length
}

const toHalf = (value: number) => Math.round(value * 2) / 2

/** A rough mark on the device, from the key points or else the model answer. */
export function gradeOnDevice(item: GradeItem): Grade {
  const base = { key: item.key, modelAnswer: item.modelAnswer ?? null, by: 'device' as const }
  const answer = keyWords(item.answer)
  const points = item.keyPoints ?? []
  if (answer.size === 0) return { ...base, awarded: 0, feedback: 'No answer, so no marks.', missing: points }
  if (points.length > 0) {
    const missing = points.filter((point) => covered(point, answer) < 0.5)
    const found = points.length - missing.length
    return {
      ...base,
      awarded: toHalf((item.marks * found) / points.length),
      feedback: `Covers ${found} of ${points.length} key points. This is a rough check on your device (matching words), so look at it yourself too.`,
      missing,
    }
  }
  if (item.modelAnswer) {
    const share = covered(item.modelAnswer, answer)
    return {
      ...base,
      awarded: toHalf(item.marks * Math.min(1, share * 1.25)),
      feedback: `About ${Math.round(share * 100)}% of the model answer's key words are in yours. This is a rough check on your device, so compare them yourself too.`,
      missing: [],
    }
  }
  return { ...base, awarded: null, feedback: 'There is no model answer to compare with: mark it yourself.', missing: [] }
}

/** Marks the written answers. Throws (in plain words) when the AI can't, so the screen can offer marking on the device. */
export async function gradeAnswers(source: DataSource, request: GradeRequest): Promise<Grade[]> {
  if (source.kind === 'demo') return request.items.map(gradeOnDevice)
  const answer = await callAiFunction('ai-grade', request, GradeResponseSchema, source.client)
  return answer.grades.map((grade) => ({ key: grade.key, awarded: grade.awarded, feedback: grade.feedback, missing: grade.missing, modelAnswer: grade.modelAnswer, by: 'ai' }))
}
