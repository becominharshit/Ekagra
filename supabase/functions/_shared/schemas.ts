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

// ---------------------------------------------------------------------------
// 1-click AI Anchors and the page tutor in the PDF viewer (ai-tutor)
// ---------------------------------------------------------------------------

/** The ai_anchors.action values. "ask" is the page tutor ("Ask about this page"). */
export const ANCHOR_ACTIONS = ['explain', 'simplify', 'example', 'flashcards', 'ask'] as const
export type AnchorAction = (typeof ANCHOR_ACTIONS)[number]

export const TutorRequestSchema = z
  .object({
    action: z.enum(ANCHOR_ACTIONS),
    /** What the student selected on the page (not needed to ask about the whole page). */
    selectedText: z.string().max(4000).nullable().optional(),
    /** The student's question (only for "ask"). */
    question: z.string().max(1000).nullable().optional(),
    /** The page's text, read on the device: the tutor answers from it. */
    pageText: z.string().max(20_000),
    pageNumber: z.number().int().min(1),
    materialTitle: z.string().min(1).max(200),
    subjectName: z.string().max(120).nullable().optional(),
    program: z.string().max(120).nullable().optional(),
    year: z.number().int().min(1).max(8).nullable().optional(),
    mentorTone: z.enum(['strict', 'balanced', 'friendly']).optional(),
  })
  .refine((request) => (request.action === 'ask' ? Boolean(request.question?.trim()) : Boolean(request.selectedText?.trim())), {
    message: '"ask" needs a question; the other actions need selected text',
    path: ['action'],
  })
export type TutorRequest = z.infer<typeof TutorRequestSchema>

export const TutorAnswerSchema = z.object({
  answerMd: z.string().min(1).max(6000).describe('The answer, in Markdown'),
  flashcards: z
    .array(z.object({ front: z.string().min(1).max(300), back: z.string().min(1).max(600) }))
    .max(8)
    .describe('Only for the "flashcards" action; otherwise an empty list'),
})

/** What ai-tutor returns (model and prompt version are saved with the anchor). */
export const TutorResponseSchema = TutorAnswerSchema.extend({ model: z.string(), promptVersion: z.string() })
export type TutorResponse = z.infer<typeof TutorResponseSchema>

// ---------------------------------------------------------------------------
// Code problems (Coding Lab): questions with type "code"
// ---------------------------------------------------------------------------

/** One test of a code problem (saved in questions.tests). The app runs it with Python on the device. */
export const CodeTestSchema = z.object({
  call: z.string().min(1).max(300).describe('A Python expression that uses the solution, e.g. "factorial(5)"'),
  expected: z.string().min(1).max(500).describe('A Python literal with the right result, e.g. "120"'),
})
export type CodeTest = z.infer<typeof CodeTestSchema>
export const CodeTestsSchema = z.array(CodeTestSchema).min(1).max(12)

/** questions.answer of a code problem: the code the student starts from, and a model solution. */
export const CodeAnswerSchema = z.object({
  starter: z.string().max(4000).describe('The function header the student starts from, with a comment where to write'),
  solution: z.string().min(1).max(8000).describe('A correct, simple solution that passes every test'),
})
export type CodeAnswer = z.infer<typeof CodeAnswerSchema>

// ---------------------------------------------------------------------------
// Lesson, check quiz and flashcards for one topic (ai-generate)
// ---------------------------------------------------------------------------

export const GenerateRequestSchema = z.object({
  subjectName: z.string().trim().min(1).max(120),
  unitTitle: z.string().max(200).nullable().optional(),
  topicTitle: z.string().trim().min(1).max(200),
  track: z.enum(['exam', 'skill']),
  difficulty: z.number().int().min(1).max(5).nullable().optional(),
  estMinutes: z.number().int().min(5).max(600).nullable().optional(),
  /** Topics the student learned before this one. */
  prerequisites: z.array(z.string().max(200)).max(10).optional(),
  /** Past exam questions on this topic, so the lesson and questions match the exam. */
  pastQuestions: z
    .array(z.object({ text: z.string().max(600), marks: z.number().nullable(), year: z.number().int().nullable() }))
    .max(8)
    .optional(),
  program: z.string().max(120).nullable().optional(),
  year: z.number().int().min(1).max(8).nullable().optional(),
  mentorTone: z.enum(['strict', 'balanced', 'friendly']).optional(),
})
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>

export const CheckQuestionSchema = z
  .object({
    type: z.enum(['mcq', 'numerical', 'short']),
    prompt: z.string().min(5).max(800),
    options: z.array(z.string().min(1).max(300)).max(5).describe('mcq: 4 options; numerical and short: an empty list'),
    correctOption: z.number().int().min(0).max(4).nullable().describe('mcq: the index of the one right option; otherwise null'),
    answer: z.string().min(1).max(1500).describe('mcq: the right option; numerical: only the number; short: a model answer'),
    tolerance: z.number().min(0).nullable().describe('numerical: how far an answer may be off (for rounding); otherwise null'),
    keyPoints: z.array(z.string().min(1).max(200)).max(5).describe('short: 2–4 points a good answer contains; otherwise an empty list'),
    explanation: z.string().min(1).max(1500).describe('Why the answer is right, and why a tempting wrong answer is wrong'),
    difficulty: z.number().int().min(1).max(5),
  })
  .superRefine((question, context) => {
    if (question.type === 'mcq') {
      const right = question.correctOption
      if (question.options.length < 3 || right === null || right >= question.options.length) {
        context.addIssue({ code: 'custom', message: 'An mcq needs 3–5 options and the index of the right one', path: ['correctOption'] })
      }
    }
    if (question.type === 'numerical' && !Number.isFinite(Number(question.answer.replace(',', '.')))) {
      context.addIssue({ code: 'custom', message: 'A numerical answer must be a number', path: ['answer'] })
    }
  })
export type CheckQuestion = z.infer<typeof CheckQuestionSchema>

export const GeneratedTopicSchema = z.object({
  lessonMd: z.string().min(200).max(15_000).describe('The lesson in Markdown'),
  checkQuestions: z.array(CheckQuestionSchema).min(3).max(5),
  flashcards: z.array(z.object({ front: z.string().min(1).max(300), back: z.string().min(1).max(600) })).min(5).max(15),
})
export type GeneratedTopic = z.infer<typeof GeneratedTopicSchema>

/** What ai-generate returns (model and prompt version are saved with the lesson and questions). */
export const GenerateResponseSchema = GeneratedTopicSchema.extend({ model: z.string(), promptVersion: z.string() })
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>

// ---------------------------------------------------------------------------
// Task capture: plain text or a screenshot → tasks to confirm (ai-capture)
// ---------------------------------------------------------------------------

export const TASK_AREAS = ['academics', 'hustle', 'life', 'personal'] as const
export const CAPTURE_FIELDS = ['title', 'dueAt', 'subject', 'estMinutes', 'area', 'hustle'] as const

export const CaptureRequestSchema = z
  .object({
    text: z.string().max(8000).optional(),
    file: SourceFileSchema.optional(),
    /** The student's current date and time with their UTC offset, e.g. 2026-11-02T14:30:00+05:30. */
    now: z.string().min(16).max(40),
    timezone: z.string().min(1).max(64),
    /** The student's subjects with short keys (s1, s2, …). */
    subjects: z
      .array(z.object({ key: z.string().min(1).max(10), name: z.string().min(1).max(120), code: z.string().max(40).nullable() }))
      .max(40),
    /** The student's hustles with short keys (h1, h2, …). */
    hustles: z
      .array(z.object({ key: z.string().min(1).max(10), name: z.string().min(1).max(80), type: z.string().max(20) }))
      .max(20)
      .optional(),
  })
  .refine(hasSource, NO_SOURCE)
export type CaptureRequest = z.infer<typeof CaptureRequestSchema>

export const CapturedTaskSchema = z
  .object({
    title: z.string().min(1).max(200).describe('Short and clear, e.g. "DBMS assignment 2"'),
    area: z.enum(TASK_AREAS).describe('academics = college work, hustle = side business or freelancing, life/personal = everything else'),
    subjectKey: z.string().nullable().describe('Key of the subject it belongs to, or null'),
    hustleKey: z.string().nullable().describe('Key of the hustle it belongs to, or null'),
    lead: z.boolean().describe('true for a new lead, inquiry or order for a hustle (someone who may pay), false for a to-do'),
    dueAt: z
      .string()
      .nullable()
      .describe('When it is due, ISO 8601 with the student\'s UTC offset, e.g. "2026-11-06T17:00:00+05:30"; 23:59 when only a day is given; null when no date is given'),
    estMinutes: z.number().int().min(5).max(1200).nullable().describe('Minutes of work it probably needs, or null'),
    priority: z.number().int().min(1).max(4).describe('1 = urgent or important … 4 = whenever'),
    unsure: z.array(z.enum(CAPTURE_FIELDS)).describe('Fields you guessed or that are unclear, so the student checks them'),
  })
  .superRefine((task, context) => {
    if (task.dueAt !== null && Number.isNaN(Date.parse(task.dueAt))) {
      context.addIssue({ code: 'custom', message: 'dueAt must be an ISO 8601 date and time', path: ['dueAt'] })
    }
  })
export type CapturedTask = z.infer<typeof CapturedTaskSchema>

export const CaptureAnswerSchema = z.object({ tasks: z.array(CapturedTaskSchema).max(20) })

/** What ai-capture returns. Nothing is saved until the student confirms. */
export const CaptureResponseSchema = CaptureAnswerSchema.extend({ model: z.string(), promptVersion: z.string() })
export type CaptureResponse = z.infer<typeof CaptureResponseSchema>

// ---------------------------------------------------------------------------
// Morning brief: today's plan, deadlines and last check-in → 3 short lines (ai-brief)
// ---------------------------------------------------------------------------

const CLOCK = /^\d{2}:\d{2}$/

export const BriefRequestSchema = z.object({
  /** The student's day, e.g. "Monday, 2 November". */
  day: z.string().min(1).max(40),
  mentorTone: z.enum(['strict', 'balanced', 'friendly']).optional(),
  /** Today's plan blocks, earliest first (local times). */
  blocks: z
    .array(
      z.object({
        start: z.string().regex(CLOCK),
        end: z.string().regex(CLOCK),
        mode: z.enum(['study', 'hustle', 'life']),
        kind: z.string().min(1).max(20),
        title: z.string().min(1).max(200),
        subject: z.string().max(120).nullable(),
        status: z.string().min(1).max(20),
      }),
    )
    .max(40),
  /** Open tasks due in the next days, e.g. due "Due Fri 5:00 PM". */
  deadlines: z.array(z.object({ title: z.string().min(1).max(200), due: z.string().min(1).max(40), subject: z.string().max(120).nullable() })).max(10),
  exams: z.array(z.object({ subject: z.string().min(1).max(120), inDays: z.number().int().min(0).max(366) })).max(10),
  reviews: z.object({ flashcards: z.number().int().min(0).max(10_000), mistakes: z.number().int().min(0).max(10_000) }),
  lastCheckIn: z
    .object({
      daysAgo: z.number().int().min(0).max(31),
      energy: z.number().int().min(1).max(5),
      mood: z.number().int().min(1).max(5),
      topDistraction: z.string().max(120).nullable(),
    })
    .nullable(),
  minimumDay: z.boolean(),
  burnoutGuard: z.boolean(),
})
export type BriefRequest = z.infer<typeof BriefRequestSchema>

export const BriefAnswerSchema = z.object({
  lines: z.array(z.string().trim().min(1).max(160)).length(3).describe('Exactly 3 short lines'),
})

/** What ai-brief returns. */
export const BriefResponseSchema = BriefAnswerSchema.extend({ model: z.string(), promptVersion: z.string() })
export type BriefResponse = z.infer<typeof BriefResponseSchema>

// ---------------------------------------------------------------------------
// Custom hustle: the student's own idea → phases, steps and board columns (ai-hustle)
// ---------------------------------------------------------------------------

export const HustlePlanRequestSchema = z.object({
  description: z.string().trim().min(10, 'Describe your idea in a sentence or two').max(2000),
  /** The skill it needs most, if the student named one. */
  skill: z.string().trim().max(80).optional(),
  goal: z.string().trim().max(160).optional(),
})
export type HustlePlanRequest = z.infer<typeof HustlePlanRequestSchema>

export const HustlePlanAnswerSchema = z
  .object({
    name: z.string().trim().min(1).max(80).describe('A short name for the hustle'),
    phases: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(80),
          steps: z
            .array(
              z.object({
                title: z.string().trim().min(1).max(160).describe('One concrete action a student can tick off in a day or two'),
                skill: z.string().trim().min(1).max(60).nullable().describe('The learnable skill this step is about (e.g. "Video editing"), or null'),
              }),
            )
            .min(1)
            .max(6),
        }),
      )
      .min(3)
      .max(8),
    stages: z.array(z.string().trim().min(1).max(30)).min(3).max(6).describe("The pipeline board's columns, in order"),
  })
  .superRefine((plan, context) => {
    const names = plan.stages.map((stage) => stage.toLowerCase())
    if (new Set(names).size !== names.length) context.addIssue({ code: 'custom', message: 'Board columns must all be different', path: ['stages'] })
  })
export type HustlePlanAnswer = z.infer<typeof HustlePlanAnswerSchema>

/** What ai-hustle returns. Nothing is saved until the student starts the hustle. */
export const HustlePlanResponseSchema = HustlePlanAnswerSchema.safeExtend({ model: z.string(), promptVersion: z.string() })
export type HustlePlanResponse = z.infer<typeof HustlePlanResponseSchema>
