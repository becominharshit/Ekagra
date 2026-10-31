import { describe, expect, it } from 'vitest'
import { activeBlock, currentMode, needsSwitchWarning, sectionFromPath, type ScheduledBlock, type SwitchCheck } from './modes'

const NOW = new Date('2026-11-01T10:30:00Z')

function block(mode: ScheduledBlock['mode'], id = 'block-1'): ScheduledBlock {
  return { id, mode, title: 'Test block', startsAt: '2026-11-01T10:00:00Z', endsAt: '2026-11-01T11:00:00Z' }
}

/** Default situation: a Study block is running and you tap the Hustle tab from Today. */
function check(overrides: Partial<SwitchCheck> = {}): boolean {
  return needsSwitchWarning({
    block: block('study'),
    now: NOW,
    fromPath: '/today',
    toPath: '/hustle',
    acknowledgedBlockIds: [],
    ...overrides,
  })
}

describe('sectionFromPath', () => {
  it('reads the tab from the first part of the URL', () => {
    expect(sectionFromPath('/hustle')).toBe('hustle')
    expect(sectionFromPath('/hustle/clients/42')).toBe('hustle')
    expect(sectionFromPath('/academics/')).toBe('academics')
  })

  it('returns null for the home URL and unknown URLs', () => {
    expect(sectionFromPath('/')).toBeNull()
    expect(sectionFromPath('/settings')).toBeNull()
  })
})

describe('activeBlock and currentMode', () => {
  it('uses the block mode while the block is running', () => {
    expect(currentMode(block('hustle'), NOW)).toBe('hustle')
  })

  it('counts the start minute but not the end minute', () => {
    expect(activeBlock(block('study'), new Date('2026-11-01T10:00:00Z'))).not.toBeNull()
    expect(activeBlock(block('study'), new Date('2026-11-01T11:00:00Z'))).toBeNull()
  })

  it('is Free before, after, or without a block', () => {
    expect(currentMode(block('study'), new Date('2026-11-01T09:59:00Z'))).toBe('free')
    expect(currentMode(block('study'), new Date('2026-11-01T11:30:00Z'))).toBe('free')
    expect(currentMode(null, NOW)).toBe('free')
  })
})

describe('needsSwitchWarning', () => {
  it('warns when you open Hustle during a Study block', () => {
    expect(check()).toBe(true)
    expect(check({ fromPath: '/academics' })).toBe(true)
  })

  it('warns when you open Academics during a Hustle block', () => {
    expect(check({ block: block('hustle'), toPath: '/academics' })).toBe(true)
  })

  it('does not warn when the tab matches the block', () => {
    expect(check({ toPath: '/academics' })).toBe(false)
    expect(check({ block: block('hustle'), toPath: '/hustle' })).toBe(false)
  })

  it('never warns for Today, Life or Me', () => {
    for (const toPath of ['/today', '/life', '/me']) {
      expect(check({ toPath })).toBe(false)
      expect(check({ block: block('hustle'), toPath })).toBe(false)
    }
  })

  it('does not warn during a Life block', () => {
    expect(check({ block: block('life'), toPath: '/hustle' })).toBe(false)
    expect(check({ block: block('life'), toPath: '/academics' })).toBe(false)
  })

  it('does not warn in Free mode (no block, or the block has ended)', () => {
    expect(check({ block: null })).toBe(false)
    expect(check({ now: new Date('2026-11-01T11:00:00Z') })).toBe(false)
  })

  it('does not warn when moving around inside the same tab', () => {
    expect(check({ fromPath: '/hustle', toPath: '/hustle/clients' })).toBe(false)
  })

  it('asks only once per block', () => {
    expect(check({ acknowledgedBlockIds: ['block-1'] })).toBe(false)
    expect(check({ block: block('study', 'block-2'), acknowledgedBlockIds: ['block-1'] })).toBe(true)
  })
})
