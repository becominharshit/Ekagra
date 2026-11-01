import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

// FocusGuard: the Kotlin app blocker in the Android app (android/app/src/main/java/app/ekagra/
// student/focusguard/, docs/2-technical-design.md §11). Screens use `focusGuard` below, never the
// plugin itself. On the web (and in tests) a stand-in answers: nothing is blocked there, and the
// app list holds a few well-known apps, so the picker can be tried in Demo Mode.

/** The settings screens FocusGuard can open; "appInfo" is the app's info page (battery options on many phones). */
export type SettingsScreen = 'usageAccess' | 'overlay' | 'notifications' | 'battery' | 'exactAlarms' | 'appInfo'

export interface PermissionStatus {
  /** Usage access: FocusGuard can see which app is on the screen. */
  usageAccess: boolean
  /** Display over other apps: the blocker screen. */
  overlay: boolean
  notifications: boolean
  /** The phone doesn't put the app to sleep to save battery. */
  batteryUnrestricted: boolean
  /** "Alarms & reminders": reminders (the Launchpad's) arrive exactly on time. */
  exactAlarms: boolean
  /** The phone's maker, e.g. "OnePlus" (for the battery guide); empty on the web. */
  manufacturer: string
}

export interface LaunchableApp {
  packageName: string
  label: string
  /** A PNG of the app's icon in base64; empty on the web. */
  iconBase64: string
  /** The phone, messages, clock, maps, settings and this app are never blocked. */
  alwaysAllowed: boolean
}

export interface StartOptions {
  blockedPackages: string[]
  /** When blocking ends (epoch milliseconds); FocusGuard stops by itself then. */
  endsAt: number
  /** Shown on the blocker screen and in the notification. */
  title: string
  emergencyUnlocksLeft: number
}

export type GuardEventType = 'blockedAppOpened' | 'emergencyUnlock'

/** What FocusGuard saw: a blocked app was opened, or an emergency unlock was asked for on the blocker screen. */
export interface GuardEvent {
  type: GuardEventType
  packageName: string
  label: string
  /** Epoch milliseconds. */
  at: number
}

interface FocusGuardPlugin {
  checkPermissions(): Promise<PermissionStatus>
  openPermissionSettings(options: { type: SettingsScreen }): Promise<void>
  listLaunchableApps(): Promise<{ apps: LaunchableApp[] }>
  start(options: StartOptions): Promise<void>
  stop(): Promise<void>
  unlock(options: { minutes: number }): Promise<{ unlockUntil: number }>
  getStatus(): Promise<{ running: boolean; endsAt: number; unlockUntil: number }>
  takeEvents(): Promise<{ events: GuardEvent[] }>
  addListener(eventName: GuardEventType, listener: (event: Omit<GuardEvent, 'type'>) => void): Promise<PluginListenerHandle>
  scheduleReminder(options: Reminder): Promise<void>
  cancelReminder(options: { id: string }): Promise<void>
}

/** A notification at a set time, shown even when the app is closed. */
export interface Reminder {
  /** A new reminder with the same id replaces the old one. */
  id: string
  /** Epoch milliseconds. */
  at: number
  title: string
  body: string
}

const plugin = registerPlugin<FocusGuardPlugin>('FocusGuard')

/** True in the Android app, where FocusGuard can block apps. */
export function focusGuardAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('FocusGuard')
}

const example = (packageName: string, label: string, alwaysAllowed = false): LaunchableApp => ({ packageName, label, iconBase64: '', alwaysAllowed })

/** Apps students often block, for trying the picker where FocusGuard isn't available. */
export const EXAMPLE_APPS: LaunchableApp[] = [
  example('com.pubg.imobile', 'BGMI'),
  example('com.facebook.katana', 'Facebook'),
  example('com.instagram.android', 'Instagram'),
  example('com.netflix.mediaclient', 'Netflix'),
  example('com.google.android.dialer', 'Phone', true),
  example('com.reddit.frontpage', 'Reddit'),
  example('com.snapchat.android', 'Snapchat'),
  example('com.whatsapp', 'WhatsApp'),
  example('com.twitter.android', 'X'),
  example('com.google.android.youtube', 'YouTube'),
]

const NOTHING_ON: PermissionStatus = { usageAccess: false, overlay: false, notifications: false, batteryUnrestricted: false, exactAlarms: false, manufacturer: '' }

export const focusGuard = {
  async checkPermissions(): Promise<PermissionStatus> {
    return focusGuardAvailable() ? plugin.checkPermissions() : NOTHING_ON
  },
  async openPermissionSettings(type: SettingsScreen): Promise<void> {
    if (focusGuardAvailable()) await plugin.openPermissionSettings({ type })
  },
  async listLaunchableApps(): Promise<LaunchableApp[]> {
    return focusGuardAvailable() ? (await plugin.listLaunchableApps()).apps : EXAMPLE_APPS
  },
  /** Starts blocking, or updates the running session. */
  async start(options: StartOptions): Promise<void> {
    if (focusGuardAvailable()) await plugin.start(options)
  },
  async stop(): Promise<void> {
    if (focusGuardAvailable()) await plugin.stop()
  },
  /** An emergency unlock (a passed Academic Tollbooth): blocked apps open for a few minutes. */
  async unlock(minutes: number): Promise<void> {
    if (focusGuardAvailable()) await plugin.unlock({ minutes })
  },
  /** The events FocusGuard saw that the app hasn't picked up yet (they're kept while the app is closed). */
  async takeEvents(): Promise<GuardEvent[]> {
    return focusGuardAvailable() ? (await plugin.takeEvents()).events : []
  },
  /** Android: a notification at `at`, even if the app is closed (the web app has its own reminders on screen). */
  async scheduleReminder(reminder: Reminder): Promise<void> {
    if (focusGuardAvailable()) await plugin.scheduleReminder(reminder)
  },
  async cancelReminder(id: string): Promise<void> {
    if (focusGuardAvailable()) await plugin.cancelReminder({ id })
  },
  /** Calls `listener` when FocusGuard has news while the app runs. Returns a function that stops listening. */
  onEvent(listener: () => void): () => void {
    if (!focusGuardAvailable()) return () => undefined
    const handles = [plugin.addListener('blockedAppOpened', listener), plugin.addListener('emergencyUnlock', listener)]
    return () => {
      for (const handle of handles) void handle.then((listening) => listening.remove())
    }
  },
}
