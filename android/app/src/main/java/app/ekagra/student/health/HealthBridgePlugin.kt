package app.ekagra.student.health

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine

/**
 * HealthBridge: sleep and steps from Android's Health Connect (docs/2-technical-design.md), which
 * collects them from the phone and from watches and fitness apps. The web app calls it through
 * src/lib/native/healthBridge.ts. It only reads, and only what the student allowed.
 *
 * Health Connect exists from Android 9; this app also runs on Android 7 and 8, so every method
 * checks the version before HealthReader (the only class that uses Health Connect) is touched.
 */
@CapacitorPlugin(name = "HealthBridge")
class HealthBridgePlugin : Plugin() {

    private fun supported(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P

    /** { status: available | needs_update | not_installed | not_supported, granted } */
    @PluginMethod
    fun getStatus(call: PluginCall) {
        if (!supported()) {
            call.resolve(JSObject().put("status", "not_supported").put("granted", false))
            return
        }
        val status = HealthReader.status(context)
        if (status != "available") {
            call.resolve(JSObject().put("status", status).put("granted", false))
            return
        }
        withHealthConnect(call, { HealthReader.hasAccess(context) }) { granted ->
            call.resolve(JSObject().put("status", status).put("granted", granted))
        }
    }

    /** Opens Health Connect's screen to allow reading sleep and steps; resolves { granted }. */
    @PluginMethod
    fun requestAccess(call: PluginCall) {
        if (!supported() || HealthReader.status(context) != "available") {
            call.reject("Health Connect isn't ready on this phone.", "UNAVAILABLE")
            return
        }
        startActivityForResult(call, HealthReader.accessIntent(context), "onAccessResult")
    }

    @ActivityCallback
    private fun onAccessResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        call.resolve(JSObject().put("granted", HealthReader.accessGranted(result.resultCode, result.data)))
    }

    /** { from, to } in epoch ms → { sessions: [{ start, end, minutes }] } */
    @PluginMethod
    fun readSleep(call: PluginCall) {
        val from = call.getLong("from")
        val to = call.getLong("to")
        if (!supported() || from == null || to == null || to <= from) {
            call.reject("from and to (epoch ms) are needed, on Android 9 or newer.")
            return
        }
        withHealthConnect(call, { HealthReader.readSleep(context, from, to) }) { sessions ->
            val list = JSArray()
            sessions.forEach { list.put(JSObject().put("start", it.start).put("end", it.end).put("minutes", it.minutes)) }
            call.resolve(JSObject().put("sessions", list))
        }
    }

    /** { from, to } as 'YYYY-MM-DD' (both included) → { days: [{ date, steps }] } */
    @PluginMethod
    fun readSteps(call: PluginCall) {
        val from = call.getString("from")
        val to = call.getString("to")
        val date = Regex("""\d{4}-\d{2}-\d{2}""")
        if (!supported() || from == null || to == null || !date.matches(from) || !date.matches(to)) {
            call.reject("from and to ('YYYY-MM-DD') are needed, on Android 9 or newer.")
            return
        }
        withHealthConnect(call, { HealthReader.readSteps(context, from, to) }) { days ->
            val list = JSArray()
            days.forEach { (day, steps) -> list.put(JSObject().put("date", day).put("steps", steps)) }
            call.resolve(JSObject().put("days", list))
        }
    }

    /** Health Connect's settings (what each app may read). */
    @PluginMethod
    fun openSettings(call: PluginCall) {
        if (!supported()) {
            call.reject("Health Connect needs Android 9 or newer.")
            return
        }
        open(call, HealthReader.settingsIntent())
    }

    /** Health Connect in the Play Store, to install or update it (Android 9–13). */
    @PluginMethod
    fun openStore(call: PluginCall) {
        val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$HEALTH_CONNECT&url=healthconnect%3A%2F%2Fonboarding"))
        try {
            activity.startActivity(market.setPackage("com.android.vending"))
            call.resolve()
        } catch (noStore: ActivityNotFoundException) {
            open(call, Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$HEALTH_CONNECT")))
        }
    }

    private fun open(call: PluginCall, intent: Intent) {
        try {
            activity.startActivity(intent)
            call.resolve()
        } catch (missing: ActivityNotFoundException) {
            call.reject("That screen isn't available on this phone.")
        }
    }

    /**
     * Runs one of Health Connect's suspend functions with the Kotlin standard library (no coroutine
     * library needed): it finishes on Health Connect's own thread, then `done` answers the call.
     */
    private fun <T> withHealthConnect(call: PluginCall, work: suspend () -> T, done: (T) -> Unit) {
        work.startCoroutine(
            Continuation(EmptyCoroutineContext) { result ->
                result
                    .onSuccess { value ->
                        try {
                            done(value)
                        } catch (error: Exception) {
                            call.reject("Couldn't read Health Connect's answer.", "HEALTH_CONNECT", error)
                        }
                    }
                    .onFailure { error ->
                        val message = if (error is SecurityException) "Health Connect access is off. Connect again in Life → Sleep & steps." else "Health Connect couldn't be read: ${error.message}"
                        call.reject(message, if (error is SecurityException) "NO_ACCESS" else "HEALTH_CONNECT", error as? Exception)
                    }
            },
        )
    }

    private companion object {
        const val HEALTH_CONNECT = "com.google.android.apps.healthdata"
    }
}
