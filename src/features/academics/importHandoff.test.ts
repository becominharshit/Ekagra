import { describe, expect, it } from 'vitest'
import { clearImport, handOverImport, waitingImport } from './importHandoff'
import { EMPTY_SOURCE } from './source'

const SOURCE = { ...EMPTY_SOURCE, text: 'Unit 1: ER model' }

describe('handing a syllabus or past paper from the inbox to its import screen', () => {
  it('is found by that subject and kind only, until it is cleared', () => {
    handOverImport({ subjectId: 's1', kind: 'syllabus', source: SOURCE, year: null }, 1000)
    expect(waitingImport('s2', 'syllabus', 2000)).toBeNull()
    expect(waitingImport('s1', 'past_paper', 2000)).toBeNull()
    expect(waitingImport('s1', 'syllabus', 2000)?.source.text).toBe('Unit 1: ER model')
    expect(waitingImport('s1', 'syllabus', 3000)).not.toBeNull() // reading doesn't use it up

    clearImport('s2', 'syllabus') // another subject's screen leaves it alone
    expect(waitingImport('s1', 'syllabus', 3000)).not.toBeNull()
    clearImport('s1', 'syllabus')
    expect(waitingImport('s1', 'syllabus', 3000)).toBeNull()
  })

  it('is forgotten after 10 minutes', () => {
    handOverImport({ subjectId: 's1', kind: 'past_paper', source: SOURCE, year: 2024 }, 0)
    expect(waitingImport('s1', 'past_paper', 10 * 60 * 1000)?.year).toBe(2024)
    expect(waitingImport('s1', 'past_paper', 10 * 60 * 1000 + 1)).toBeNull()
  })
})
