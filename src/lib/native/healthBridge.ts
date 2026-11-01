import { Capacitor, registerPlugin } from '@capacitor/core'

// HealthBridge: sleep and steps from Android's Health Connect, through the Kotlin plugin in
// android/app/src/main/java/app/ekagra/student/health/. Screens use `healthBridge` below, never the
// plugin itself. On the web (and in tests) Health Connect doesn't exist: status says so, and the
// student types sleep and steps in instead.

/** available; needs_update or not_installed (Android 9–13 get it from the Play Store); not_supported (the web, or Android 7–8). */
export type HealthStatus = 'available' | 'needs_update' | 'not_installed' | 'not_supported'

/** A sleep session: start and end in epoch ms, and the minutes asleep (awake stages left out). */
export interface SleepSession {
  start: number
  end: number
  minutes: number
}

export interface StepDay {
  /** 'YYYY-MM-DD', the phone's local date. */
  date: string
  steps: number
}

interface HealthBridgePlugin {
  getStatus(): Promise<{ status: HealthStatus; granted: boolean }>
  requestAccess(): Promise<{ granted: boolean }>
  readSleep(options: { from: number; to: number }): Promise<{ sessions: SleepSession[] }>
  readSteps(options: { from: string; to: string }): Promise<{ days: StepDay[] }>
  openSettings(): Promise<void>
  openStore(): Promise<void>
}

const plugin = registerPlugin<HealthBridgePlugin>('HealthBridge')

/** True in the Android app, where Health Connect may be there. */
export function healthBridgeAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('HealthBridge')
}

export const healthBridge = {
  async status(): Promise<{ status: HealthStatus; granted: boolean }> {
    if (!healthBridgeAvailable()) return { status: 'not_supported', granted: false }
    return plugin.getStatus()
  },
  /** Opens Health Connect's screen to allow reading sleep and steps. */
  async requestAccess(): Promise<boolean> {
    if (!healthBridgeAvailable()) return false
    return (await plugin.requestAccess()).granted
  },
  async readSleep(from: Date, to: Date): Promise<SleepSession[]> {
    if (!healthBridgeAvailable()) return []
    return (await plugin.readSleep({ from: from.getTime(), to: to.getTime() })).sessions
  },
  /** Steps per day from one date to another ('YYYY-MM-DD', both included). */
  async readSteps(from: string, to: string): Promise<StepDay[]> {
    if (!healthBridgeAvailable()) return []
    return (await plugin.readSteps({ from, to })).days
  },
  async openSettings(): Promise<void> {
    if (healthBridgeAvailable()) await plugin.openSettings()
  },
  /** Health Connect in the Play Store, to install or update it. */
  async openStore(): Promise<void> {
    if (healthBridgeAvailable()) await plugin.openStore()
  },
}
