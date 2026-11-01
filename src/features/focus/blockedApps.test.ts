import { describe, expect, it } from 'vitest'
import { EXAMPLE_APPS, focusGuard } from '@/lib/native/focusGuard'
import type { DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { stubLocalStorage } from '@/test/memoryStorage'
import { BATTERY_GUIDES, BRANDS, brandOf } from './batteryGuide'
import { blockedPackages, listBlockedApps, setAppBlocked } from './blockedApps'

stubLocalStorage()

const DEMO: DataSource = { kind: 'demo' }

describe('blocked apps (Demo Mode)', () => {
  it('turns blocking on and off; an app turned off stays in the list, inactive', async () => {
    await setAppBlocked(DEMO, { packageName: 'com.instagram.android', label: 'Instagram', blocked: true })
    await setAppBlocked(DEMO, { packageName: 'com.google.android.youtube', label: 'YouTube', blocked: true })
    await setAppBlocked(DEMO, { packageName: 'com.instagram.android', label: 'Instagram', blocked: false })
    const rows = await listBlockedApps(DEMO)
    expect(rows.map((row) => [row.package_name, row.label, row.active])).toEqual([
      ['com.instagram.android', 'Instagram', false],
      ['com.google.android.youtube', 'YouTube', true],
    ])
    expect(blockedPackages(rows)).toEqual(['com.google.android.youtube'])
    expect(demoDb.list('blocked_apps')).toHaveLength(2) // never two rows for one app
  })
})

describe('FocusGuard outside the Android app', () => {
  it('blocks nothing, and offers example apps so the picker can be tried', async () => {
    expect(await focusGuard.checkPermissions()).toEqual({ usageAccess: false, overlay: false, notifications: false, batteryUnrestricted: false, manufacturer: '' })
    expect(await focusGuard.listLaunchableApps()).toBe(EXAMPLE_APPS)
    expect(EXAMPLE_APPS.find((app) => app.label === 'Phone')?.alwaysAllowed).toBe(true)
    await expect(focusGuard.openPermissionSettings('overlay')).resolves.toBeUndefined()
  })
})

describe('the battery guide', () => {
  it("picks the guide for the phone's maker", () => {
    expect([brandOf('OnePlus'), brandOf('realme'), brandOf('OPPO'), brandOf('Xiaomi'), brandOf('POCO'), brandOf('Redmi'), brandOf('samsung'), brandOf('Google'), brandOf('')]).toEqual([
      'oneplus',
      'realme',
      'realme',
      'xiaomi',
      'xiaomi',
      'xiaomi',
      'samsung',
      'other',
      'other',
    ])
    expect(BRANDS.every((brand) => BATTERY_GUIDES[brand].steps.length >= 3)).toBe(true)
  })
})
