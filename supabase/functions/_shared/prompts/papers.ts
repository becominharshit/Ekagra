import type { ModelMessage } from 'ai'
import type { PaperRequest } from '../schemas.ts'
import { withSource } from './source.ts'

// Prompt for ai-papers (Smart tier). Change the version when the wording changes.
export const PAPERS_PROMPT_VERSION = 'papers-v1'

export const PAPERS_INSTRUCTIONS = `You read one past exam paper and list every question in it.

For each question:
- text: the question, shortened to its essential part (at most 300 characters).
- marks: the marks shown for it, or null if none are shown.
- type: "mcq", "short", "numerical", "code" or "long".
- topicKey: the key of the topic from the given list that the question tests most, or null if none fits.

Sub-questions (1a, 1b) are separate questions. "OR" alternatives are separate questions too.
Also give the paper's year and exam type ("End semester", "Mid term", …) if the paper shows them, otherwise null.
Answer only with JSON in the required format.`

export function papersPrompt(request: PaperRequest): string | ModelMessage[] {
  const topics = request.topics.map((topic) => `${topic.key}: ${topic.title}`).join('\n')
  const year = request.year ? `\nThe student says this paper is from ${request.year}.` : ''
  return withSource(
    `Subject: ${request.subjectName}${year}\n\nTopics (key: title):\n${topics}\n\nList the questions of this past paper.`,
    request.text,
    request.file,
  )
}
