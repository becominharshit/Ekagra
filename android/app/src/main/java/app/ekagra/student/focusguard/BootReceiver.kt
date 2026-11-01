package app.ekagra.student.focusguard

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * If the phone restarts (or the app is updated) in the middle of a focus session, blocking goes
 * on until the session's end, read back from GuardStore. A session that already ended is forgotten.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val session = GuardStore.load(context) ?: return
        if (System.currentTimeMillis() >= session.endsAt) {
            GuardStore.clear(context)
            return
        }
        FocusGuardService.start(context)
    }
}
