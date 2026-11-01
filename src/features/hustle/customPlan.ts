import { HustlePlanResponseSchema } from '@shared/schemas.ts'
import { callAiFunction } from '@/features/ai/aiClient'
import type { DataSource } from '@/lib/dataSource'
import { planFromTemplate, TEMPLATES, type PlanPhase } from './templates'

// A plan for the student's own hustle idea (the Custom type): the AI makes it when signed in
// (ai-hustle); in Demo Mode, or when the AI isn't available, the general Custom template is used.

export interface CustomPlan {
  /** The AI's name for the hustle (null with the template). */
  name: string | null
  phases: PlanPhase[]
  stages: string[]
  by: 'ai' | 'template'
  /** Why the AI didn't make it (signed in), to show with the template's plan. */
  aiError: string | null
}

export interface CustomIdea {
  description: string
  skill: string
  goal: string
}

function templatePlan(skill: string, aiError: string | null): CustomPlan {
  return { name: null, phases: planFromTemplate(TEMPLATES.custom, skill), stages: TEMPLATES.custom.stages, by: 'template', aiError }
}

export async function makeCustomPlan(source: DataSource, { description, skill, goal }: CustomIdea): Promise<CustomPlan> {
  if (source.kind === 'demo') return templatePlan(skill, null)
  try {
    const answer = await callAiFunction(
      'ai-hustle',
      { description: description.trim(), skill: skill.trim() || undefined, goal: goal.trim() || undefined },
      HustlePlanResponseSchema,
    )
    return {
      name: answer.name,
      phases: answer.phases.map((phase) => ({ title: phase.title, steps: phase.steps.map((step) => ({ title: step.title, skillName: step.skill })) })),
      stages: answer.stages,
      by: 'ai',
      aiError: null,
    }
  } catch (error) {
    return templatePlan(skill, error instanceof Error ? error.message : 'The AI is not available.')
  }
}
