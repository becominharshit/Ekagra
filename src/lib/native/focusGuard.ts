import { Capacitor, registerPlugin } from '@capacitor/core'

// FocusGuard: the Kotlin app blocker in the Android app (android/app/src/main/java/app/ekagra/
// student/focusguard/, docs/2-technical-design.md §11). Screens use `focusGuard` below, never the
// plugin itself. On the web (and in tests) a stand-in answers: nothing is blocked there, and the
// app list holds a few well-known apps, so the picker can be tried in Demo Mode.

/** The settings screens FocusGuard can open; "appInfo" is the app's info page (battery options on many phones). */
export type SettingsScreen = 'usageAccess' | 'overlay' | 'notifications' | 'battery' | 'appInfo'

export interface PermissionStatus {
  /** Usage access: FocusGuard can see which app is on the screen. */
  usageAccess: boolean
  /** Display over other apps: the blocker screen. */
  overlay: boolean
  notifications: boolean
  /** The phone doesn't put the app to sleep to save battery. */
  batteryUnrestricted: boolean
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

interface FocusGuardPlugin {
  checkPermissions(): Promise<PermissionStatus>
  openPermissionSettings(options: { type: SettingsScreen }): Promise<void>
  listLaunchableApps(): Promise<{ apps: LaunchableApp[] }>
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

const NOTHING_ON: PermissionStatus = { usageAccess: false, overlay: false, notifications: false, batteryUnrestricted: false, manufacturer: '' }

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
}
