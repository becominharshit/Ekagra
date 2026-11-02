import { describe, expect, it } from 'vitest'
import { handleAiRequest, type ServerDeps } from '../_shared/http.ts'
import { fakeModel, memoryUsage, modelAnswer, TEST_SECRETS } from '../_shared/testing.ts'
import { inboxFeature } from './feature.ts'

const SUBJECTS = [
  { key: 's1', name: 'Database Management Systems', code: 'DBMS' },
  { key: 's2', name: 'Engineering Mathematics', code: null },
]
const REQUEST = { fileName: 'DBMS_syllabus_2026.pdf', text: 'Unit I: ER model, relational algebra. Unit II: SQL.', pageCount: 3, subjects: SUBJECTS }
const SYLLABUS = {
  kind: 'syllabus',
  title: ' DBMS syllabus ',
  summary: 'The units and topics of Database Management Systems.',
  subjectKey: 's1',
  newSubject: 'Databases',
  year: 2026,
  classes: [{ subject: 'DBMS', subjectKey: 's1', days: [1], start: '09:00', end: '10:00' }],
}

async function call(body: unknown, ...answers: unknown[]) {
  const model = fakeModel(...answers.map((answer) => modelAnswer(JSON.stringify(answer))))
  const usage = memoryUsage()
  const deps = (): ServerDeps => ({ env: TEST_SECRETS, authenticate: async () => 'student-1', usage, model: () => model })
  const response = await handleAiRequest(inboxFeature, deps)(new Request('http://localhost/ai-inbox', { method: 'POST', body: JSON.stringify(body) }))
  return { response, model, usage }
}

describe('ai-inbox', () => {
  it('says what an upload is and which listed subject it belongs to; only timetables keep classes, only papers a year', async () => {
    const { response, usage } = await call(REQUEST, SYLLABUS)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      kind: 'syllabus',
      title: 'DBMS syllabus',
      summary: 'The units and topics of Database Management Systems.',
      subjectKey: 's1',
      newSubject: null, // a listed subject fits
      year: null,
      classes: [],
      model: 'claude-fast-test',
      promptVersion: 'inbox-v1',
    })
    expect(usage.logged).toEqual([expect.objectContaining({ feature: 'inbox', model: 'claude-fast-test' })])
  })

  it('suggests a new subject when no listed one fits, and keeps the year of a past paper', async () => {
    const paper = { ...SYLLABUS, kind: 'past_paper', title: 'Physics paper 2024', subjectKey: 's9', newSubject: ' Engineering Physics ', year: 2024 }
    const body = await (await call(REQUEST, paper)).response.json()
    expect(body).toMatchObject({ kind: 'past_paper', subjectKey: null, newSubject: 'Engineering Physics', year: 2024, classes: [] })

    const notice = { ...SYLLABUS, kind: 'task', subjectKey: 's2', newSubject: 'Maths' }
    expect(await (await call(REQUEST, notice)).response.json()).toMatchObject({ kind: 'task', subjectKey: 's2', newSubject: null })
  })

  it('cleans up a timetable: times as HH:MM, days once and in order, unknown subject keys dropped, impossible classes left out', async () => {
    const timetable = {
      kind: 'timetable',
      title: 'Semester 3 timetable',
      summary: 'Weekly classes for semester 3.',
      subjectKey: 's1',
      newSubject: 'Timetable',
      year: 2026,
      classes: [
        { subject: 'DBMS', subjectKey: 's1', days: [3, 1, 3], start: '9:00', end: '9:50' },
        { subject: ' Workshop ', subjectKey: 's7', days: [5], start: '14:00', end: '16:00' },
        { subject: 'Maths', subjectKey: 's2', days: [2], start: '11:00', end: '10:00' },
      ],
    }
    const body = await (await call({ ...REQUEST, fileName: 'timetable.jpg' }, timetable)).response.json()
    expect(body).toMatchObject({ kind: 'timetable', subjectKey: null, newSubject: null, year: null })
    expect(body.classes).toEqual([
      { subject: 'DBMS', subjectKey: 's1', days: [1, 3], start: '09:00', end: '09:50' },
      { subject: 'Workshop', subjectKey: null, days: [5], start: '14:00', end: '16:00' },
    ])
  })

  it('tries again when a class time is not a time of day', async () => {
    const broken = { ...SYLLABUS, kind: 'timetable', classes: [{ subject: 'DBMS', subjectKey: 's1', days: [1], start: 'first period', end: '10:00' }] }
    const { response, model } = await call(REQUEST, broken, { ...broken, classes: [] })
    expect(response.status).toBe(200)
    expect(model.doGenerateCalls).toHaveLength(2)
  })

  it("gives the model the file's name, its page count and the subjects; a photo goes as a file", async () => {
    const { model } = await call(REQUEST, SYLLABUS)
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('File name: DBMS_syllabus_2026.pdf')
    expect(prompt).toContain('Pages: 3')
    expect(prompt).toContain('s1: Database Management Systems (DBMS)')
    expect(prompt).toContain('Unit I: ER model')

    const photo = { fileName: 'IMG_2041.jpg', file: { mimeType: 'image/jpeg', base64: 'aGVsbG8=' }, pageCount: null, subjects: [] }
    const sent = JSON.stringify((await call(photo, SYLLABUS)).model.doGenerateCalls[0]?.prompt)
    expect(sent).toContain('"type":"file"')
    expect(sent).toContain('They have no subjects yet.')
  })

  it('needs text or a file', async () => {
    const { response } = await call({ ...REQUEST, text: '  ' }, SYLLABUS)
    expect(response.status).toBe(400)
  })
})
