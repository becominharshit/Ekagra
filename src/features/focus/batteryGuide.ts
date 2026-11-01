// Some phones close apps in the background to save battery, which would stop FocusGuard in the
// middle of a session. These are the settings that keep it running, per phone maker. Menu names
// differ a little between versions, so the steps say where to look.

export type Brand = 'oneplus' | 'realme' | 'xiaomi' | 'samsung' | 'other'

export interface BatteryGuide {
  name: string
  steps: string[]
}

export const BRANDS: Brand[] = ['oneplus', 'realme', 'xiaomi', 'samsung', 'other']

/** The guide for a phone maker as Android reports it ("OnePlus", "realme", "Xiaomi", "samsung", "POCO"…). */
export function brandOf(manufacturer: string): Brand {
  const maker = manufacturer.trim().toLowerCase()
  if (maker.includes('oneplus')) return 'oneplus'
  if (maker.includes('realme') || maker.includes('oppo')) return 'realme'
  if (maker.includes('xiaomi') || maker.includes('redmi') || maker.includes('poco')) return 'xiaomi'
  if (maker.includes('samsung')) return 'samsung'
  return 'other'
}

export const BATTERY_GUIDES: Record<Brand, BatteryGuide> = {
  oneplus: {
    name: 'OnePlus',
    steps: [
      'Settings → Apps → App management → Ekagra → Battery usage: turn on "Allow background activity" (and "Allow auto-launch" if you see it).',
      'Settings → Battery → More settings → Optimise battery use → Ekagra → "Don\'t optimise" (older versions).',
      'Open Recent apps, tap the menu on Ekagra\'s card and choose Lock, so clearing recent apps keeps it.',
    ],
  },
  realme: {
    name: 'Realme (and Oppo)',
    steps: [
      'Settings → Apps → App management → Ekagra → Battery usage: turn on "Allow background activity" and "Allow auto launch".',
      'Settings → Battery → More settings → Optimise battery use → Ekagra → "Don\'t optimise".',
      'Open Recent apps and lock Ekagra (pull its card down or tap the lock), so it isn\'t cleared.',
    ],
  },
  xiaomi: {
    name: 'Xiaomi, Redmi and POCO',
    steps: [
      'Settings → Apps → Manage apps → Ekagra → turn on Autostart.',
      'Same screen → Battery saver → "No restrictions".',
      'Same screen → Other permissions → allow "Display pop-up windows while running in the background" (the blocker screen needs it).',
      'Open Recent apps, press and hold Ekagra and tap the lock.',
    ],
  },
  samsung: {
    name: 'Samsung',
    steps: [
      'Settings → Apps → Ekagra → Battery → "Unrestricted".',
      'Settings → Battery (or Device care → Battery) → Background usage limits: add Ekagra to "Never sleeping apps", and make sure it isn\'t in "Sleeping" or "Deep sleeping apps".',
      'Optional: in Recent apps, tap Ekagra\'s icon and choose "Keep open".',
    ],
  },
  other: {
    name: 'Other phones',
    steps: [
      'Settings → Apps → Ekagra → Battery → "Unrestricted" (or "Don\'t optimise").',
      'If your phone has Autostart or Auto-launch, turn it on for Ekagra.',
      'Lock Ekagra in Recent apps if your phone allows it.',
    ],
  },
}
