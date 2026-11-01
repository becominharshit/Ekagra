import { describe, expect, it } from 'vitest'
import { demoPaper, demoSyllabus, demoTutor } from './demoAi'

const SYLLABUS = `Database Management Systems (CS301)
UNIT 1: Introduction to databases (8 hours)
- ER model
- Relational model and relational algebra
UNIT II: SQL, views, triggers
Unit 3 – Design
1. Functional dependencies
2. Normalization (1NF to BCNF)`

describe('demoSyllabus (Demo Mode sample)', () => {
  it('makes units from Unit lines and topics from the lines (or comma lists) under them', () => {
    const tree = demoSyllabus({ subjectName: 'DBMS', text: SYLLABUS })
    expect(tree.units.map((unit) => [unit.title, unit.topics.map((topic) => topic.title)])).toEqual([
      ['Topics', ['Database Management Systems (CS301)']],
      ['UNIT 1: Introduction to databases', ['ER model', 'Relational model and relational algebra']],
      ['UNIT II', ['SQL', 'Views', 'Triggers']],
      ['Unit 3 – Design', ['Functional dependencies', 'Normalization (1NF to BCNF)']],
      ['Skill track', ['Use DBMS in a small project']],
    ])
  })

  it('puts the topics of a unit in order, and adds one skill-track project', () => {
    const tree = demoSyllabus({ subjectName: 'DBMS', text: SYLLABUS })
    expect(tree.units[1]?.topics.map((topic) => topic.prerequisites)).toEqual([[], ['u2t1']])
    expect(tree.units.at(-1)?.topics[0]).toMatchObject({ track: 'skill', examWeight: 0 })
  })

  it('splits a long plain list into parts of 6', () => {
    const list = Array.from({ length: 13 }, (_, i) => `Topic number ${i + 1}`).join('\n')
    expect(demoSyllabus({ subjectName: 'Maths', text: list }).units.map((unit) => unit.topics.length)).toEqual([6, 6, 1, 1])
  })

  it('needs text: photos and scanned PDFs need the real AI', () => {
    expect(() => demoSyllabus({ subjectName: 'DBMS', file: { mimeType: 'image/png', base64: 'aGk=' } })).toThrow(/Paste the text/)
    expect(() => demoSyllabus({ subjectName: 'DBMS', text: '!!' })).toThrow(/Couldn't find any topics/)
  })
})

describe('demoPaper (Demo Mode sample)', () => {
  const topics = [
    { key: 't1', title: 'ER model' },
    { key: 't2', title: 'SQL queries' },
    { key: 't3', title: 'Normalization (1NF to BCNF)' },
  ]
  const PAPER = `End Semester Examination 2024
Q1. Draw an ER model for a library. (10 marks)
Q2. Write SQL queries to find the top 3 students
using GROUP BY. [5]
OR
Q3. Explain normalization up to BCNF with an example. (8 marks)
Q4. What is a spinlock? (2 marks)`

  it('finds the questions, their marks and the topic each one tests', () => {
    const answer = demoPaper({ subjectName: 'DBMS', topics, text: PAPER })
    expect(answer.questions.map((q) => [q.topicKey, q.marks, q.type])).toEqual([
      ['t1', 10, 'long'],
      ['t2', 5, 'code'],
      ['t3', 8, 'short'],
      [null, 2, 'short'],
    ])
    expect(answer.questions[1]?.text).toBe('Write SQL queries to find the top 3 students using GROUP BY.')
    expect(answer).toMatchObject({ year: 2024, examType: 'End semester', promptVersion: 'demo-sample' })
  })

  it('uses the year the student gave', () => {
    expect(demoPaper({ subjectName: 'DBMS', topics, text: 'Q1. ER model (5 marks)', year: 2021 }).year).toBe(2021)
  })
})

describe('demoTutor (Demo Mode sample)', () => {
  const page = {
    pageNumber: 42,
    materialTitle: 'DBMS notes',
    pageText:
      'A relation is in BCNF when every determinant is a superkey. Normalization removes redundancy from tables. ' +
      'Third normal form allows some dependencies that BCNF does not. Indexes make lookups faster.',
  }

  it('explains with the sentences of the page that match the selection', () => {
    const answer = demoTutor({ ...page, action: 'explain', selectedText: 'determinant superkey' })
    expect(answer.answerMd).toContain('Demo Mode has no AI')
    expect(answer.answerMd).toContain('> A relation is in BCNF when every determinant is a superkey.')
    expect(answer.answerMd).not.toContain('Indexes')
    expect(answer).toMatchObject({ flashcards: [], model: 'demo' })
  })

  it('makes "fill in the blank" flashcards from the selection', () => {
    const answer = demoTutor({ ...page, action: 'flashcards', selectedText: 'Normalization removes redundancy from tables.' })
    expect(answer.flashcards).toEqual([{ front: '_____ removes redundancy from tables.', back: 'normalization' }])
  })

  it("answers questions with the page's matching sentences, or says the page doesn't cover it", () => {
    expect(demoTutor({ ...page, action: 'ask', question: 'What makes lookups faster?' }).answerMd).toContain('Indexes make lookups faster.')
    expect(demoTutor({ ...page, action: 'ask', question: 'Who invented Python?' }).answerMd).toContain("doesn't seem to mention that")
  })

  it('splits a selection into short points to simplify it', () => {
    const answer = demoTutor({ ...page, action: 'simplify', selectedText: 'atomic values, no partial dependencies; no transitive dependencies' })
    expect(answer.answerMd).toContain('- atomic values\n- no partial dependencies\n- no transitive dependencies')
  })
})
