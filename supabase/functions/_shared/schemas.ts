import { z } from 'zod'

// The shapes of AI requests and answers, in one place. The Edge Functions use them to check what
// comes in and what the model returns; the app uses them to check what comes back.
// This file may only import zod: it is bundled for Deno and for the app.

/** The biggest file the app sends to the AI (a scanned PDF or a photo). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_TEXT_LENGTH = 60_000

export const SourceFileSchema = z.object({
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  base64: z
    .string()
    .min(1)
    .max(Math.ceil(MAX_FILE_BYTES / 3) * 4),
})
export type SourceFile = z.infer<typeof SourceFileSchema>

const hasSource = (request: { text?: string; file?: SourceFile }) =>
  Boolean(request.text?.trim()) || request.file !== undefined
const NO_SOURCE = { message: 'Send the text or a file', path: ['text'] }

// ---------------------------------------------------------------------------
// Syllabus → topic tree (ai-syllabus)
// ---------------------------------------------------------------------------

export const SyllabusRequestSchema = z
  .object({
    subjectName: z.string().trim().min(1).max(120),
    program: z.string().max(120).nullable().optional(),
    year: z.number().int().min(1).max(8).nullable().optional(),
    examDate: z.iso.date().nullable().optional(),
    text: z.string().max(MAX_TEXT_LENGTH).optional(),
    file: SourceFileSchema.optional(),
  })
  .refine(hasSource, NO_SOURCE)
export type SyllabusRequest = z.infer<typeof SyllabusRequestSchema>

export const TreeTopicSchema = z.object({
  key: z.string().min(1).max(40).describe('Short unique id, e.g. "u1t3". Used in prerequisites.'),
  title: z.string().min(1).max(200),
  track: z.enum(['exam', 'skill']).describe('"exam" for syllabus topics, "skill" for optional practical topics'),
  estMinutes: z.number().int().min(15).max(240).describe('Minutes a typical student needs to learn it'),
  difficulty: z.number().int().min(1).max(5).describe('1 = easy … 5 = hard'),
  examWeight: z.number().min(0).max(1).describe('How important it is for the exam, 0–1'),
  prerequisites: z.array(z.string()).describe('Keys of topics that must be learned first'),
})
export type TreeTopic = z.infer<typeof TreeTopicSchema>

export const TopicTreeSchema = z.object({
  units: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        topics: z.array(TreeTopicSchema).min(1).max(40),
      }),
    )
    .min(1)
    .max(30),
})
export type TopicTree = z.infer<typeof TopicTreeSchema>

// ---------------------------------------------------------------------------
// Past paper → questions matched to topics (ai-papers)
// ---------------------------------------------------------------------------

export const PaperRequestSchema = z
  .object({
    subjectName: z.string().trim().min(1).max(120),
    /** The subject's topics with short keys (t1, t2, …), so the AI can name the topic a question tests. */
    topics: z
      .array(z.object({ key: z.string().min(1).max(40), title: z.string().min(1).max(200) }))
      .min(1)
      .max(400),
    year: z.number().int().min(1990).max(2100).nullable().optional(),
    text: z.string().max(MAX_TEXT_LENGTH).optional(),
    file: SourceFileSchema.optional(),
  })
  .refine(hasSource, NO_SOURCE)
export type PaperRequest = z.infer<typeof PaperRequestSchema>

export const QUESTION_TYPES = ['mcq', 'short', 'numerical', 'code', 'long'] as const

export const PaperAnalysisSchema = z.object({
  year: z.number().int().min(1990).max(2100).nullable().describe('Year of the exam, or null if the paper does not show it'),
  examType: z.string().max(60).nullable().describe('e.g. "End semester" or "Mid term", or null'),
  questions: z
    .array(
      z.object({
        text: z.string().min(1).max(600).describe('The question, shortened to its essential part'),
        marks: z.number().min(0).max(100).nullable(),
        type: z.enum(QUESTION_TYPES),
        topicKey: z.string().nullable().describe('Key of the listed topic this question tests most, or null if none fits'),
      }),
    )
    .max(150),
})
export type PaperAnalysis = z.infer<typeof PaperAnalysisSchema>

/** What ai-papers returns: the analysis plus the prompt version (saved in questions.prompt_version). */
export const PaperAnswerSchema = PaperAnalysisSchema.extend({ promptVersion: z.string() })
export type PaperAnswer = z.infer<typeof PaperAnswerSchema>
