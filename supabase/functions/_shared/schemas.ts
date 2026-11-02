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
// The Add inbox: an upload → what it is and where it goes (ai-inbox)
// ---------------------------------------------------------------------------

export const INBOX_KINDS = ['syllabus', 'timetable', 'past_paper', 'study_material', 'task', 'other'] as const
export type InboxKind = (typeof INBOX_KINDS)[number]

export const InboxRequestSchema = z
  .object({
    /** The file's name (it often says what it is), or null for typed text. */
    fileName: z.string().max(200).nullable(),
    /** Typed text, or the text of a PDF's first pages, read on the device. */
    text: z.string().max(MAX_TEXT_LENGTH).optional(),
    /** A photo, or a scanned PDF (one with no text in it). */
    file: SourceFileSchema.optional(),
    pageCount: z.number().int().min(1).max(100_000).nullable(),
    /** The student's subjects with short keys (s1, s2, …). */
    subjects: z
      .array(z.object({ key: z.string().min(1).max(10), name: z.string().min(1).max(120), code: z.string().max(40).nullable() }))
      .max(40),
  })
  .refine(hasSource, NO_SOURCE)
export type InboxRequest = z.infer<typeof InboxRequestSchema>

/** A time of day as H:MM or HH:MM (24-hour). */
const TIME_OF_DAY = /^([01]?\d|2[0-3]):[0-5]\d$/

export const InboxClassSchema = z.object({
  subject: z.string().min(1).max(120).describe('The course as the timetable names it'),
  subjectKey: z.string().nullable().describe('Key of the listed subject it is, or null'),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7).describe('0 = Sunday, 1 = Monday … 6 = Saturday'),
  start: z.string().describe('Start time, 24-hour HH:MM'),
  end: z.string().describe('End time, 24-hour HH:MM'),
})
export type InboxClass = z.infer<typeof InboxClassSchema>

export const InboxAnswerSchema = z
  .object({
    kind: z.enum(INBOX_KINDS).describe('What it is'),
    title: z.string().min(1).max(120).describe('A short name for it, e.g. "DBMS syllabus" or "Unit 3 notes: SQL joins"'),
    summary: z.string().min(1).max(300).describe('One plain sentence on what it is'),
    subjectKey: z.string().nullable().describe('Key of the listed subject it belongs to, or null (always null for a timetable)'),
    newSubject: z.string().max(120).nullable().describe('The course it belongs to when that course is not in the list, else null'),
    year: z.number().int().min(1990).max(2100).nullable().describe('Past papers: the exam year when the paper shows it, else null'),
    classes: z.array(InboxClassSchema).max(80).describe('Timetables: every weekly class; an empty list for anything else'),
  })
  .superRefine((answer, context) => {
    answer.classes.forEach((item, index) => {
      if (!TIME_OF_DAY.test(item.start) || !TIME_OF_DAY.test(item.end)) {
        context.addIssue({ code: 'custom', message: 'start and end must be 24-hour times like 09:00 or 13:30', path: ['classes', index] })
      }
    })
  })
export type InboxAnswer = z.infer<typeof InboxAnswerSchema>

/** What ai-inbox returns. Nothing is saved until the student confirms where it goes. */
export const InboxResponseSchema = InboxAnswerSchema.safeExtend({ model: z.string(), promptVersion: z.string() })
export type InboxResponse = z.infer<typeof InboxResponseSchema>

// ---------------------------------------------------------------------------
// Ekagra Studio: notes, mind maps and revision sheets from a material (studio-notes, Gemini)
// ---------------------------------------------------------------------------

export const NOTE_KINDS = ['notes', 'mind_map', 'revision_sheet'] as const
export type StudioNoteKind = (typeof NOTE_KINDS)[number]

export const StudioNotesRequestSchema = z.object({
  materialId: z.uuid(),
  subjectId: z.uuid(),
  kind: z.enum(NOTE_KINDS),
  /** The material's name, for the note's first title (the AI may give a better one). */
  title: z.string().trim().min(1).max(200),
  /** What to read: a public YouTube video's link, text (typed, or read from a PDF on the device), or a photo or scanned PDF. */
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('youtube'), url: z.string().max(300) }),
    z.object({ kind: z.literal('text'), text: z.string().trim().min(1).max(MAX_TEXT_LENGTH) }),
    z.object({ kind: z.literal('file'), file: SourceFileSchema }),
  ]),
  /** The student's course and year, so the notes fit their level. */
  program: z.string().max(120).nullable().optional(),
  year: z.number().int().min(1).max(8).nullable().optional(),
})
export type StudioNotesRequest = z.infer<typeof StudioNotesRequestSchema>

export const StudioNoteAnswerSchema = z.object({
  title: z.string().min(1).max(200).describe('A short title, e.g. "SQL joins" or "Normalization: 1NF to BCNF"'),
  markdown: z.string().min(1).max(200_000).describe('The notes, mind map or revision sheet in Markdown, as the instructions describe'),
})
export type StudioNoteAnswer = z.infer<typeof StudioNoteAnswerSchema>

/** What studio-notes returns at once: the new note, which is made in the background (status processing → ready or failed). */
export const StudioNotesResponseSchema = z.object({ noteId: z.uuid() })
export type StudioNotesResponse = z.infer<typeof StudioNotesResponseSchema>

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

// ---------------------------------------------------------------------------
// Marking written answers: short and long answers of a mock test (ai-grade)
// ---------------------------------------------------------------------------

export const GradeItemSchema = z.object({
  /** A short key (a1, a2, …) so the grades come back matched to the answers. */
  key: z.string().min(1).max(10),
  question: z.string().trim().min(1).max(4000),
  marks: z.number().min(0.5).max(100),
  /** The student's answer (may be empty: then it gets 0). */
  answer: z.string().max(8000),
  /** What a full-marks answer must contain, when known. */
  keyPoints: z.array(z.string().max(300)).max(12).optional(),
  modelAnswer: z.string().max(4000).optional(),
})
export type GradeItem = z.infer<typeof GradeItemSchema>

export const GradeRequestSchema = z
  .object({
    subject: z.string().trim().min(1).max(120),
    items: z.array(GradeItemSchema).min(1).max(15),
  })
  .refine((request) => new Set(request.items.map((item) => item.key)).size === request.items.length, { message: 'Each answer needs its own key', path: ['items'] })
export type GradeRequest = z.infer<typeof GradeRequestSchema>

const gradeSchema = z.object({
  key: z.string(),
  awarded: z.number().min(0).describe('Marks given, in steps of 0.5'),
  feedback: z.string().trim().min(1).max(1200).describe('2–4 plain sentences: what was right and what was missing'),
  missing: z.array(z.string().max(300)).max(8).describe('Key points the answer left out'),
  modelAnswer: z.string().trim().min(1).max(4000).describe('A concise full-marks answer'),
})

/** The answer the model must give for these items: one grade per key, never above the item's marks. */
export function gradeAnswerSchemaFor(items: Pick<GradeItem, 'key' | 'marks'>[]) {
  const marks = new Map(items.map((item) => [item.key, item.marks]))
  return z.object({ grades: z.array(gradeSchema) }).superRefine((answer, context) => {
    const keys = answer.grades.map((grade) => grade.key)
    if (keys.length !== marks.size || new Set(keys).size !== keys.length || keys.some((key) => !marks.has(key))) {
      context.addIssue({ code: 'custom', message: `Give exactly one grade for each of: ${[...marks.keys()].join(', ')}`, path: ['grades'] })
    }
    answer.grades.forEach((grade, index) => {
      const most = marks.get(grade.key)
      if (most !== undefined && grade.awarded > most) context.addIssue({ code: 'custom', message: `At most ${most} marks for ${grade.key}`, path: ['grades', index, 'awarded'] })
    })
  })
}
export type GradeAnswer = { grades: z.infer<typeof gradeSchema>[] }

export const GradeResponseSchema = z.object({ grades: z.array(gradeSchema), model: z.string(), promptVersion: z.string() })
export type GradeResponse = z.infer<typeof GradeResponseSchema>

// ---------------------------------------------------------------------------
// Sunday weekly review: the week's numbers → 3 insights and up to 3 changes (ai-review)
// The change types, parts of the day and metrics match src/features/review/changes.ts.
// ---------------------------------------------------------------------------

export const REVIEW_CHANGE_TYPES = [
  'move_subject_to_window',
  'shift_budget',
  'set_buffer',
  'set_review_cap',
  'set_new_cards',
  'set_block_length',
  'set_peak_window',
  'set_revision_days',
  'block_apps_in_study',
  'challenge_metric',
  'set_skill_minutes',
] as const
export const REVIEW_WINDOWS = ['morning', 'afternoon', 'evening', 'night'] as const
export const REVIEW_AREAS = ['academics', 'hustle', 'life'] as const
export const REVIEW_METRICS = ['memory', 'learning_speed', 'processing_speed', 'problem_solving'] as const

const count = z.number().int().min(0).max(1_000_000)
const minutes = z.number().min(0).max(100_000)
const shareOrNull = z.number().min(0).max(1).nullable()
const accuracy = z.object({ attempts: count, accuracy: shareOrNull })
const areaTime = z.object({ planned: minutes, done: minutes, budgetPct: z.number().min(0).max(100), sharePct: z.number().min(0).max(100) })
const nightsInWeek = z.number().int().min(0).max(7)
/** Study on the days after one kind of night: days, focus minutes a day, answers and the share right. */
const studyAfterSleep = z.object({ days: count, focusMinutes: minutes.nullable(), attempts: count, accuracy: shareOrNull })

export const ReviewStatsSchema = z.object({
  areas: z.object({ academics: areaTime, hustle: areaTime, life: areaTime }),
  blocks: z.object({ planned: count, done: count, partial: count, missed: count, open: count }),
  subjects: z
    .array(
      z.object({
        key: z.string().min(1).max(10),
        name: z.string().trim().min(1).max(120),
        kind: z.enum(['course', 'skill_course']),
        planned: minutes,
        done: minutes,
        attempts: count,
        accuracy: shareOrNull,
        examInDays: z.number().int().nullable(),
        weeklyMinutes: z.number().int().min(0).max(10_000).nullable(),
      }),
    )
    .max(30),
  topicsLearned: z.array(z.object({ title: z.string().trim().min(1).max(200), subjectKey: z.string().max(10) })).max(50),
  quiz: accuracy,
  accuracyByWindow: z.object({ morning: accuracy, afternoon: accuracy, evening: accuracy, night: accuracy }),
  reviews: z.object({ count, retention: shareOrNull }),
  focus: z.object({ minutes, sessions: count, completed: count }),
  distractions: z.object({
    total: count,
    unlocks: count,
    topApps: z.array(z.object({ app: z.string().max(120), count })).max(3),
    topHours: z.array(z.object({ hour: z.number().int().min(0).max(23), count })).max(3),
    reasons: z.array(z.object({ reason: z.string().max(40), count })).max(4),
  }),
  checkIns: z.object({ days: count, energy: z.number().min(1).max(5).nullable(), mood: z.number().min(1).max(5).nullable(), crashedDays: count }),
  tasks: z.object({ completed: count, overdue: count }),
  hustle: z.object({ minutes, income: z.array(z.object({ currency: z.string().max(8), amount: z.number() })).max(5) }),
  // Sleep and workouts are optional: app versions from before they were added still get reviews.
  sleep: z
    .object({
      nights: nightsInWeek,
      avgMinutes: z.number().min(0).max(1440).nullable(),
      regularity: z.number().min(0).max(100).nullable(),
      shortNights: nightsInWeek,
      /** The last 4 weeks: study after nights of 7+ hours (rested) and after shorter ones. */
      vsStudy: z.object({ rested: studyAfterSleep, short: studyAfterSleep }),
    })
    .optional(),
  workouts: count.optional(),
  metrics: z.object({ memory: shareOrNull, learning_speed: z.number().min(0).nullable(), processing_speed: z.number().min(0).nullable(), problem_solving: shareOrNull }).nullable(),
})

export const ReviewRequestSchema = z.object({
  weekStart: z.iso.date(),
  mentorTone: z.enum(['strict', 'balanced', 'friendly']),
  stats: ReviewStatsSchema,
  /** What's set now, so the AI doesn't suggest what's already there. */
  settings: z.object({
    budget: z.object({ academics: z.number().min(0).max(100), hustle: z.number().min(0).max(100), life: z.number().min(0).max(100) }),
    bufferPct: z.number().min(0).max(50),
    maxReviewMinutes: z.number().min(0).max(120),
    newCardsPerDay: z.number().min(0).max(200),
    maxBlockMinutes: z.number().min(20).max(90),
    revisionDays: z.number().min(0).max(60),
    peak: z.object({ start: z.string().max(5), end: z.string().max(5) }),
    blockAppsInStudy: z.boolean(),
    subjectWindows: z.record(z.string().max(10), z.enum(REVIEW_WINDOWS)),
  }),
  /** This week's challenge and whether it's on target so far. */
  challenge: z.object({ metric: z.enum(REVIEW_METRICS), target: z.number(), onTarget: z.boolean() }).nullable(),
})
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>

const flatChangeSchema = z.object({
  type: z.enum(REVIEW_CHANGE_TYPES),
  subjectKey: z.string().nullable().describe('move_subject_to_window (a course) and set_skill_minutes (a skill course): the subject key, e.g. s1; otherwise null'),
  window: z.enum(REVIEW_WINDOWS).nullable().describe('move_subject_to_window and set_peak_window: the part of the day; otherwise null'),
  from: z.enum(REVIEW_AREAS).nullable().describe('shift_budget: the area that gives time; otherwise null'),
  to: z.enum(REVIEW_AREAS).nullable().describe('shift_budget: the area that gets it; otherwise null'),
  value: z.number().nullable().describe('the new number: buffer %, review minutes a day, new cards a day, block minutes, revision days, skill minutes a week, or budget points to move (5-20); otherwise null'),
  metric: z.enum(REVIEW_METRICS).nullable().describe('challenge_metric: the metric for next week; otherwise null'),
  reason: z.string().trim().min(1).max(220).describe('Why, from the numbers, in one sentence'),
})
export type FlatReviewChange = z.infer<typeof flatChangeSchema>

const NEEDS_VALUE = new Set(['set_buffer', 'set_review_cap', 'set_new_cards', 'set_block_length', 'set_revision_days', 'set_skill_minutes'])

/** The answer the model must give for this request: every change complete, with subject keys of the right kind. */
export function reviewAnswerSchemaFor(request: Pick<ReviewRequest, 'stats'>) {
  const kinds = new Map(request.stats.subjects.map((subject) => [subject.key, subject.kind]))
  return z
    .object({
      insights: z.array(z.string().trim().min(1).max(240)).min(1).max(3),
      changes: z.array(flatChangeSchema).max(3),
    })
    .superRefine((answer, context) => {
      answer.changes.forEach((change, index) => {
        const problem = (message: string) => context.addIssue({ code: 'custom', message, path: ['changes', index] })
        if (change.type === 'move_subject_to_window' && (kinds.get(change.subjectKey ?? '') !== 'course' || !change.window)) problem('move_subject_to_window needs the key of a course and a window')
        if (change.type === 'set_skill_minutes' && kinds.get(change.subjectKey ?? '') !== 'skill_course') problem('set_skill_minutes needs the key of a skill course')
        if (change.type === 'set_peak_window' && !change.window) problem('set_peak_window needs a window')
        if (change.type === 'shift_budget' && (!change.from || !change.to || change.from === change.to)) problem('shift_budget needs two different areas')
        if (change.type === 'challenge_metric' && !change.metric) problem('challenge_metric needs a metric')
        if (NEEDS_VALUE.has(change.type) && change.value === null) problem(`${change.type} needs a value`)
      })
    })
}
export type ReviewAnswer = { insights: string[]; changes: FlatReviewChange[] }

export const ReviewResponseSchema = z.object({
  insights: z.array(z.string()),
  changes: z.array(flatChangeSchema),
  model: z.string(),
  promptVersion: z.string(),
})
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>

// ---------------------------------------------------------------------------
// Meals: a photo (and/or a note) → estimated calories and macros (ai-meal)
// The photo is only in the request: it is never stored.
// ---------------------------------------------------------------------------

export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const

export const MealRequestSchema = z
  .object({
    meal: z.enum(MEAL_SLOTS),
    photo: SourceFileSchema.refine((file) => file.mimeType !== 'application/pdf', { message: 'Send a photo (JPG, PNG or WebP)' }).optional(),
    /** What the student says about it, e.g. "hostel lunch, 3 rotis". */
    note: z.string().trim().max(300).optional(),
  })
  .refine((request) => request.photo !== undefined || Boolean(request.note), { message: 'Send a photo or say what you ate', path: ['note'] })
export type MealRequest = z.infer<typeof MealRequestSchema>

const mealItemSchema = z.object({
  name: z.string().trim().min(1).max(80).describe('The food, e.g. "Dal tadka"'),
  portion: z.string().trim().min(1).max(60).describe('The amount seen, e.g. "1 bowl" or "2 rotis"'),
  calories: z.number().min(0).max(3000),
  protein_g: z.number().min(0).max(300),
  carbs_g: z.number().min(0).max(500),
  fat_g: z.number().min(0).max(300),
})
export type MealItem = z.infer<typeof mealItemSchema>

export const MealAnswerSchema = z.object({
  items: z.array(mealItemSchema).max(12).describe('Each food on the plate; empty when there is no food'),
  confidence: z.enum(['low', 'medium', 'high']),
  note: z.string().trim().max(200).describe('One short sentence on what was hard to tell, or empty'),
})
export type MealAnswer = z.infer<typeof MealAnswerSchema>

export const MealResponseSchema = MealAnswerSchema.extend({ model: z.string(), promptVersion: z.string() })
export type MealResponse = z.infer<typeof MealResponseSchema>

// ---------------------------------------------------------------------------
// Speaking practice: what the student said, as text → scores and tips (ai-speak)
// The recording never leaves the phone: the browser's speech recognition (or the student, typing)
// turns it into words first. Words per minute and filler words are counted in the app.
// ---------------------------------------------------------------------------

export const SPEAK_SCENARIOS = ['interview', 'presentation', 'group_discussion', 'small_talk'] as const
export const SPEAK_SCORES = ['clarity', 'structure', 'vocabulary', 'confidence'] as const
/** Where the words came from: the browser's speech recognition (checked by the student), or typed. */
export const SPEAK_CAPTURES = ['speech', 'typed'] as const

export const SpeakRequestSchema = z.object({
  scenario: z.enum(SPEAK_SCENARIOS),
  /** The question they answered. */
  prompt: z.string().trim().min(1).max(500),
  durationSec: z.number().int().min(1).max(1800),
  /** What they said. */
  transcript: z.string().trim().min(1).max(20_000),
  captured: z.enum(SPEAK_CAPTURES),
  /** Counted in the app from the transcript, so the feedback uses exact numbers. */
  wpm: z.number().min(0).max(1000),
  fillers: z
    .array(z.object({ filler: z.string().trim().min(1).max(20), count: z.number().int().min(1).max(1000) }))
    .max(20),
})
export type SpeakRequest = z.infer<typeof SpeakRequestSchema>

const speakScore = z.number().min(1).max(10)

export const SpeakAnswerSchema = z.object({
  scores: z.object({ clarity: speakScore, structure: speakScore, vocabulary: speakScore, confidence: speakScore }),
  strength: z.string().trim().max(200).describe('One specific thing they did well, in one sentence'),
  tips: z.array(z.string().trim().min(1).max(200)).min(1).max(3).describe('The most useful changes for next time, one sentence each, the most useful first'),
})
export type SpeakAnswer = z.infer<typeof SpeakAnswerSchema>

export const SpeakResponseSchema = SpeakAnswerSchema.extend({ model: z.string(), promptVersion: z.string() })
export type SpeakResponse = z.infer<typeof SpeakResponseSchema>

// ---------------------------------------------------------------------------
// AI usage dashboard: the limits and what the whole app spent (ai-usage, no AI call)
// ---------------------------------------------------------------------------

/** The limits when the secrets AI_USER_DAILY_REQUESTS and AI_MONTHLY_BUDGET_USD aren't set. */
export const DEFAULT_AI_LIMITS = { userDailyRequests: 150, monthlyBudgetUsd: 10 } as const

export const AiUsageRequestSchema = z
  .object({
    /** When "this month" began for the student (midnight on the 1st, their time), e.g. 2026-10-31T18:30:00.000Z. */
    monthStart: z.iso.datetime({ offset: true }).optional(),
  })
  .optional()
export type AiUsageRequest = z.infer<typeof AiUsageRequestSchema>

export const AiUsageResponseSchema = z.object({
  limits: z.object({
    /** AI requests per student in any 24 hours. */
    userDailyRequests: z.number().int().positive(),
    /** The app's AI budget per month (USD), shared by all students. */
    monthlyBudgetUsd: z.number().positive(),
    /** The most the app may spend in any 24 hours: 1/30 of the monthly budget. */
    dailyBudgetUsd: z.number().positive(),
  }),
  app: z.object({
    /** What all students' AI requests cost in the last 24 hours (USD). Null: too many to add up. */
    spentLast24hUsd: z.number().min(0).nullable(),
    /** The same since monthStart. */
    spentThisMonthUsd: z.number().min(0).nullable(),
  }),
  /** False while the AI secrets (key, models, prices) aren't set on the server. */
  aiConfigured: z.boolean(),
})
export type AiUsageResponse = z.infer<typeof AiUsageResponseSchema>

// ---------------------------------------------------------------------------
// Wiping data or deleting the account (account-delete, no AI call)
// ---------------------------------------------------------------------------

export const AccountDeleteRequestSchema = z.object({
  /** data = delete everything the student added but keep the account; account = delete the account too. */
  mode: z.enum(['data', 'account']),
  /** The word the student typed to confirm. */
  confirm: z.literal('DELETE'),
})
export type AccountDeleteRequest = z.infer<typeof AccountDeleteRequestSchema>

export const AccountDeleteResponseSchema = z.object({
  deleted: z.enum(['data', 'account']),
  /** How many files (PDFs, screenshots) were deleted. */
  files: z.number().int().min(0),
})
export type AccountDeleteResponse = z.infer<typeof AccountDeleteResponseSchema>
