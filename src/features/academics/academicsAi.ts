import {
  PaperAnswerSchema,
  TopicTreeSchema,
  type PaperAnswer,
  type PaperRequest,
  type SyllabusRequest,
  type TopicTree,
} from '@shared/schemas.ts'
import { callAiFunction } from '@/features/ai/aiClient'
import { demoPaper, demoSyllabus } from '@/features/ai/demoAi'
import type { DataSource } from '@/lib/dataSource'

// The AI steps of Academics. Signed in: the Edge Functions (Smart model). Demo Mode: samples made
// on the device from the student's text (src/features/ai/demoAi.ts).

export async function readSyllabus(source: DataSource, request: SyllabusRequest): Promise<TopicTree> {
  if (source.kind === 'demo') return demoSyllabus(request)
  return callAiFunction('ai-syllabus', request, TopicTreeSchema)
}

export async function readPastPaper(source: DataSource, request: PaperRequest): Promise<PaperAnswer> {
  if (source.kind === 'demo') return demoPaper(request)
  return callAiFunction('ai-papers', request, PaperAnswerSchema)
}
