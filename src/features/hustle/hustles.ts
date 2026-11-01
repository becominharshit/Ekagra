import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'
import type { HustleType, PlanPhase } from './templates'

// Hustles with their phases and steps, saved in Supabase or (Demo Mode) on the device.

export type Hustle = Tables<'hustles'>
export type HustlePhase = Tables<'hustle_phases'>
export type HustleStep = Tables<'hustle_steps'>
export type PhaseWithSteps = HustlePhase & { steps: HustleStep[] }
export type PhaseStatus = 'todo' | 'doing' | 'done'

export interface HustlePlan {
  hustle: Hustle
  phases: PhaseWithSteps[]
}

/** Every hustle query key starts with this, so one refresh after a change updates every hustle screen. */
export const hustlesKey = (owner: string | null) => ['hustles', owner] as const

const byOrder = (a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index

/** Groups phases and steps under their hustles, oldest hustle first. */
export function groupPlans(hustles: Hustle[], phases: HustlePhase[], steps: HustleStep[]): HustlePlan[] {
  return [...hustles]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((hustle) => ({
      hustle,
      phases: phases
        .filter((phase) => phase.hustle_id === hustle.id)
        .sort(byOrder)
        .map((phase) => ({ ...phase, steps: steps.filter((step) => step.phase_id === phase.id).sort(byOrder) })),
    }))
}

/** A phase's status from its steps: all done → done, some → doing, none → to do. */
export function phaseStatus(steps: Pick<HustleStep, 'done'>[]): PhaseStatus {
  const done = steps.filter((step) => step.done).length
  if (steps.length > 0 && done === steps.length) return 'done'
  return done > 0 ? 'doing' : 'todo'
}

/** What changes on a phase after its steps changed: its status, when it started and when it was finished. Null = nothing. */
export function phasePatch(
  phase: Pick<HustlePhase, 'status' | 'started_at'>,
  steps: Pick<HustleStep, 'done'>[],
  now: Date,
): TablesUpdate<'hustle_phases'> | null {
  const status = phaseStatus(steps)
  if (status === phase.status) return null
  return {
    status,
    started_at: status === 'todo' ? phase.started_at : (phase.started_at ?? now.toISOString()),
    completed_at: status === 'done' ? now.toISOString() : null,
  }
}

/** The phase to work on: the first one that isn't done (the last one when all are). -1 = no phases. */
export function currentPhaseIndex(phases: Pick<HustlePhase, 'status'>[]): number {
  const open = phases.findIndex((phase) => phase.status !== 'done')
  return open === -1 ? phases.length - 1 : open
}

export function stepProgress(phases: PhaseWithSteps[]): { done: number; total: number } {
  const steps = phases.flatMap((phase) => phase.steps)
  return { done: steps.filter((step) => step.done).length, total: steps.length }
}

export async function loadHustlePlans(source: DataSource): Promise<HustlePlan[]> {
  if (source.kind === 'demo') return groupPlans(demoDb.list('hustles'), demoDb.list('hustle_phases'), demoDb.list('hustle_steps'))
  const { client, userId } = source
  const [hustles, phases, steps] = await Promise.all([
    client.from('hustles').select('*').eq('user_id', userId),
    client.from('hustle_phases').select('*').eq('user_id', userId),
    client.from('hustle_steps').select('*').eq('user_id', userId),
  ])
  const error = hustles.error ?? phases.error ?? steps.error
  if (error) throw dbError(error)
  return groupPlans(hustles.data ?? [], phases.data ?? [], steps.data ?? [])
}

export interface NewHustle {
  type: HustleType
  name: string
  goal: string | null
  goalAmount: number | null
  /** 'YYYY-MM-DD' or null. */
  goalDate: string | null
  currency: string
  phases: PlanPhase[]
  /** The pipeline board's columns. */
  stages: string[]
}

/** Makes a hustle with its phases and steps. Returns its id. */
export async function createHustle(source: DataSource, input: NewHustle): Promise<string> {
  const id = crypto.randomUUID()
  const hustle: TablesInsert<'hustles'> = {
    id,
    type: input.type,
    name: input.name.trim(),
    goal: input.goal?.trim() || null,
    goal_amount: input.goalAmount,
    goal_date: input.goalDate,
    currency: input.currency,
    pipeline_stages: input.stages,
  }
  const phases = input.phases.map((phase, index) => ({ id: crypto.randomUUID(), hustle_id: id, order_index: index, title: phase.title }))
  const steps = input.phases.flatMap((phase, phaseIndex) =>
    phase.steps.map((step, index) => ({ phase_id: phases[phaseIndex]?.id ?? '', order_index: index, title: step.title, skill_name: step.skillName })),
  )
  if (source.kind === 'demo') {
    demoDb.insert('hustles', [hustle])
    demoDb.insert('hustle_phases', phases)
    demoDb.insert('hustle_steps', steps)
    return id
  }
  const { client } = source
  const created = await client.from('hustles').insert(hustle)
  if (created.error) throw dbError(created.error)
  // Phases and steps are separate requests: if one fails, the half-made hustle is removed again.
  const addedPhases = phases.length > 0 ? await client.from('hustle_phases').insert(phases) : { error: null }
  const addedSteps = addedPhases.error || steps.length === 0 ? { error: null } : await client.from('hustle_steps').insert(steps)
  const error = addedPhases.error ?? addedSteps.error
  if (error) {
    await client.from('hustles').delete().eq('id', id)
    throw dbError(error)
  }
  return id
}

export async function updateHustle(source: DataSource, { id, patch }: { id: string; patch: TablesUpdate<'hustles'> }): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.update('hustles', id, patch)
    return
  }
  const { error } = await source.client.from('hustles').update(patch).eq('id', id)
  if (error) throw dbError(error)
}

/** Deletes a hustle with its phases, board, money and time. Its tasks stay, without the link. */
export async function deleteHustle(source: DataSource, id: string): Promise<void> {
  if (source.kind === 'demo') {
    demoDb.remove('hustles', [id])
    return
  }
  const { error } = await source.client.from('hustles').delete().eq('id', id)
  if (error) throw dbError(error)
}

async function phaseSteps(source: DataSource, phaseId: string): Promise<HustleStep[]> {
  if (source.kind === 'demo') return demoDb.list('hustle_steps').filter((step) => step.phase_id === phaseId)
  const { data, error } = await source.client.from('hustle_steps').select('*').eq('phase_id', phaseId)
  if (error) throw dbError(error)
  return data
}

/** After a phase's steps changed, its status follows them (read fresh, so quick taps can't mix it up). */
async function refreshPhase(source: DataSource, phase: HustlePhase, now: Date): Promise<void> {
  const patch = phasePatch(phase, await phaseSteps(source, phase.id), now)
  if (!patch) return
  if (source.kind === 'demo') {
    demoDb.update('hustle_phases', phase.id, patch)
    return
  }
  const { error } = await source.client.from('hustle_phases').update(patch).eq('id', phase.id)
  if (error) throw dbError(error)
}

export async function setStepDone(
  source: DataSource,
  { step, done, phase, now = new Date() }: { step: HustleStep; done: boolean; phase: HustlePhase; now?: Date },
): Promise<void> {
  if (source.kind === 'demo') demoDb.update('hustle_steps', step.id, { done })
  else {
    const { error } = await source.client.from('hustle_steps').update({ done }).eq('id', step.id)
    if (error) throw dbError(error)
  }
  await refreshPhase(source, phase, now)
}

export async function addStep(
  source: DataSource,
  { phase, title, now = new Date() }: { phase: PhaseWithSteps; title: string; now?: Date },
): Promise<void> {
  const row = { phase_id: phase.id, title: title.trim(), order_index: Math.max(-1, ...phase.steps.map((step) => step.order_index)) + 1 }
  if (source.kind === 'demo') demoDb.insert('hustle_steps', [row])
  else {
    const { error } = await source.client.from('hustle_steps').insert(row)
    if (error) throw dbError(error)
  }
  await refreshPhase(source, phase, now)
}

export async function deleteStep(source: DataSource, { step, phase, now = new Date() }: { step: HustleStep; phase: HustlePhase; now?: Date }): Promise<void> {
  if (source.kind === 'demo') demoDb.remove('hustle_steps', [step.id])
  else {
    const { error } = await source.client.from('hustle_steps').delete().eq('id', step.id)
    if (error) throw dbError(error)
  }
  await refreshPhase(source, phase, now)
}

export function useHustlePlans() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...hustlesKey(owner), 'plans'],
    queryFn: () => loadHustlePlans(need(source)),
    enabled: source !== null,
  })
}

/** A change to hustles. Afterwards every hustle screen reloads. */
export function useHustleMutation<Variables, Result>(run: (source: DataSource, variables: Variables) => Promise<Result>) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: Variables) => run(need(source), variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: hustlesKey(owner) })
    },
  })
}
