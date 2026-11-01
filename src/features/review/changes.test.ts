import { describe, expect, it } from 'vitest'
import { mergeSettings, readSettings } from '@/features/profile/settings'
import {
  changeKey,
  changeProblem,
  describeChange,
  editChange,
  fitNumber,
  fromFlatChange,
  NUMBER_RULES,
  readReviewChanges,
  settingsPatch,
  type Change,
  type ChangeContext,
  type FlatChange,
} from './changes'

const settings = readSettings({})
const CTX: ChangeContext = {
  settings,
  subjects: new Map([
    ['dbms', { name: 'DBMS', kind: 'course', weeklyMinutes: null }],
    ['logo', { name: 'Logo design', kind: 'skill_course', weeklyMinutes: null }],
  ]),
  metrics: { memory: 0.8, learning_speed: null, processing_speed: 22, problem_solving: null },
  peak: { start: '09:00', end: '13:00' },
  defaultSkillMinutes: 120,
}

describe('applying a change', () => {
  it('saves planner settings (the plan is made again from them)', () => {
    expect(settingsPatch({ type: 'move_subject_to_window', subjectId: 'dbms', window: 'morning' }, settings)).toEqual({ planner: { subjectWindows: { dbms: 'morning' } } })
    expect(settingsPatch({ type: 'shift_budget', from: 'hustle', to: 'academics', points: 5 }, settings)).toEqual({ budget: { academics: 60, hustle: 20, life: 20 } })
    expect(settingsPatch({ type: 'set_buffer', value: 18 }, settings)).toEqual({ planner: { bufferPct: 18 } })
    expect(settingsPatch({ type: 'set_new_cards', value: 10 }, settings)).toEqual({ learning: { newCardsPerDay: 10 } })
    expect(settingsPatch({ type: 'set_peak_window', window: 'night' }, settings)).toEqual({ planner: { peakStart: '21:00', peakEnd: '23:59' } })
    expect(settingsPatch({ type: 'block_apps_in_study' }, settings)).toEqual({ focus: { blockDuring: 'study_blocks' } })
    expect(settingsPatch({ type: 'challenge_metric', metric: 'memory' }, settings)).toBeNull()
  })

  it('keeps the other subjects in their parts of the day, and reads back as valid settings', () => {
    const saved = mergeSettings({ planner: { subjectWindows: { maths: 'evening' } } }, settingsPatch({ type: 'move_subject_to_window', subjectId: 'dbms', window: 'morning' }, readSettings({ planner: { subjectWindows: { maths: 'evening' } } })) ?? {})
    expect(readSettings(saved).planner.subjectWindows).toEqual({ maths: 'evening', dbms: 'morning' })
    const shifted = readSettings(mergeSettings({}, settingsPatch({ type: 'shift_budget', from: 'life', to: 'academics', points: 10 }, settings) ?? {}))
    expect(shifted.budget).toEqual({ academics: 65, hustle: 25, life: 10 })
  })
})

describe('changeProblem', () => {
  it('stops changes that changed nothing or no longer fit', () => {
    expect(changeProblem({ type: 'set_buffer', value: 12 }, CTX)).toBe('That is already the setting.')
    expect(changeProblem({ type: 'set_buffer', value: 18 }, CTX)).toBeNull()
    expect(changeProblem({ type: 'move_subject_to_window', subjectId: 'gone', window: 'morning' }, CTX)).toMatch(/no longer here/)
    expect(changeProblem({ type: 'move_subject_to_window', subjectId: 'logo', window: 'morning' }, CTX)).toMatch(/no longer here/) // a skill course
    expect(changeProblem({ type: 'shift_budget', from: 'life', to: 'academics', points: 25 }, CTX)).toBe('Life has only 20% to give.')
    expect(changeProblem({ type: 'set_peak_window', window: 'morning' }, { ...CTX, peak: { start: '06:00', end: '12:00' } })).toMatch(/already/)
    expect(changeProblem({ type: 'challenge_metric', metric: 'problem_solving' }, CTX)).toMatch(/wasn't enough practice/)
    expect(changeProblem({ type: 'challenge_metric', metric: 'memory' }, CTX)).toBeNull()
    expect(changeProblem({ type: 'set_skill_minutes', subjectId: 'logo', value: 120 }, CTX)).toBe('That is already its weekly time.')
  })
})

describe('describeChange', () => {
  it('says what changes, and what it replaces', () => {
    expect(describeChange({ type: 'move_subject_to_window', subjectId: 'dbms', window: 'morning' }, CTX)).toEqual({ title: 'Study DBMS in the mornings', detail: 'Its study blocks go between 06:00 and 12:00 first.' })
    expect(describeChange({ type: 'shift_budget', from: 'hustle', to: 'academics', points: 5 }, CTX).detail).toBe('Academics 55% → 60%, Hustle 25% → 20%.')
    expect(describeChange({ type: 'set_buffer', value: 18 }, CTX).title).toBe('Keep 18% of free time unplanned')
    expect(describeChange({ type: 'set_skill_minutes', subjectId: 'logo', value: 90 }, CTX)).toEqual({ title: 'Give Logo design 1 h 30 min a week', detail: 'Now 2 h.' })
  })
})

describe('editing and reading changes', () => {
  it('keeps edited numbers within their limits and steps', () => {
    expect(editChange({ type: 'set_block_length', value: 50 }, { value: 33 })).toEqual({ type: 'set_block_length', value: 35 })
    expect(editChange({ type: 'set_buffer', value: 15 }, { value: 80 })).toEqual({ type: 'set_buffer', value: 30 })
    expect(editChange({ type: 'shift_budget', from: 'hustle', to: 'academics', points: 5 }, { value: 12 })).toMatchObject({ points: 10 })
    expect(editChange({ type: 'set_peak_window', window: 'morning' }, { window: 'evening' })).toEqual({ type: 'set_peak_window', window: 'evening' })
    expect(fitNumber(NUMBER_RULES.set_skill_minutes, 100)).toBe(105)
  })

  it("turns the AI's flat changes into real ones, and drops what doesn't make sense", () => {
    const flat = (values: Partial<FlatChange>): FlatChange => ({ type: 'set_buffer', subjectKey: null, window: null, from: null, to: null, value: null, metric: null, ...values })
    const keys = new Map([['s1', 'dbms']])
    expect(fromFlatChange(flat({ type: 'move_subject_to_window', subjectKey: 's1', window: 'morning' }), keys)).toEqual({ type: 'move_subject_to_window', subjectId: 'dbms', window: 'morning' })
    expect(fromFlatChange(flat({ type: 'set_buffer', value: 47 }), keys)).toEqual({ type: 'set_buffer', value: 30 })
    expect(fromFlatChange(flat({ type: 'shift_budget', from: 'hustle', to: 'academics' }), keys)).toEqual({ type: 'shift_budget', from: 'hustle', to: 'academics', points: 5 })
    expect(fromFlatChange(flat({ type: 'move_subject_to_window', subjectKey: 's9', window: 'morning' }), keys)).toBeNull()
    expect(fromFlatChange(flat({ type: 'set_buffer' }), keys)).toBeNull()
    expect(fromFlatChange(flat({ type: 'challenge_metric', metric: 'iq' }), keys)).toBeNull()
    expect(fromFlatChange(flat({ type: 'delete_everything' }), keys)).toBeNull()
  })

  it('reads saved changes back, leaving out broken ones', () => {
    const saved = [
      { type: 'set_buffer', value: 18, reason: 'Many blocks were missed.', status: 'applied' },
      { type: 'move_subject_to_window', subjectId: 'dbms', window: 'noon', reason: '', status: 'open' },
      { type: 'block_apps_in_study' },
      'nonsense',
    ]
    expect(readReviewChanges(saved)).toEqual([
      { type: 'set_buffer', value: 18, reason: 'Many blocks were missed.', status: 'applied' },
      { type: 'block_apps_in_study', reason: '', status: 'open' },
    ])
    expect(readReviewChanges(null)).toEqual([])
  })

  it('gives changes that set the same thing the same key', () => {
    const a: Change = { type: 'move_subject_to_window', subjectId: 'dbms', window: 'morning' }
    const b: Change = { type: 'move_subject_to_window', subjectId: 'dbms', window: 'evening' }
    expect(changeKey(a)).toBe(changeKey(b))
    expect(changeKey({ type: 'set_buffer', value: 10 })).toBe('set_buffer')
  })
})
