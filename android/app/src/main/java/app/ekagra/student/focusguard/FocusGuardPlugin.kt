package app.ekagra.student.focusguard

import android.Manifest
import android.app.AppOpsManager
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import android.provider.Telephony
import android.telecom.TelecomManager
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.ByteArrayOutputStream

/**
 * FocusGuard: blocks the apps the student picked during focus (docs/2-technical-design.md §11).
 * This part: the permissions it needs and the list of apps to pick from. The web app calls it
 * through src/lib/native/focusGuard.ts. Capacitor runs these methods off the main thread.
 */
@CapacitorPlugin(
    name = "FocusGuard",
    permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")],
)
class FocusGuardPlugin : Plugin() {

    /** Which permissions are on, and the phone's maker (for the battery guide). */
    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        val result = JSObject()
        result.put("usageAccess", hasUsageAccess(context))
        result.put("overlay", Settings.canDrawOverlays(context))
        result.put("notifications", notificationsOn(context))
        result.put("batteryUnrestricted", ignoresBatteryOptimizations(context))
        result.put("manufacturer", Build.MANUFACTURER.orEmpty())
        call.resolve(result)
    }

    /** Opens the screen where the student turns a permission on. */
    @PluginMethod
    fun openPermissionSettings(call: PluginCall) {
        val type = call.getString("type")
        // Notifications (Android 13+): Android's own question first; after a "no", the settings screen.
        if (type == "notifications" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val state = getPermissionState("notifications")
            if (state == PermissionState.PROMPT || state == PermissionState.PROMPT_WITH_RATIONALE) {
                requestPermissionForAlias("notifications", call, "afterNotificationQuestion")
                return
            }
        }
        val intent = when (type) {
            "usageAccess" -> Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            "overlay" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, packageUri())
            "notifications" -> notificationSettings()
            "battery" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            "appInfo" -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri())
            else -> {
                call.reject("Unknown settings screen: $type")
                return
            }
        }
        open(intent)
        call.resolve()
    }

    @PermissionCallback
    private fun afterNotificationQuestion(call: PluginCall) {
        call.resolve()
    }

    /** The apps with a launcher icon, A to Z, each with its icon and whether it may be blocked. */
    @PluginMethod
    fun listLaunchableApps(call: PluginCall) {
        val packageManager = context.packageManager
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val activities = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.queryIntentActivities(launcher, PackageManager.ResolveInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            packageManager.queryIntentActivities(launcher, 0)
        }
        val allowed = AppRules.alwaysAllowed(context.packageName, defaultDialer(), defaultSms())
        val apps = JSArray()
        activities
            .distinctBy { it.activityInfo.packageName }
            .filter { it.activityInfo.packageName != context.packageName }
            .map { it to it.loadLabel(packageManager).toString() }
            .sortedBy { (_, label) -> label.lowercase() }
            .forEach { (info, label) ->
                val packageName = info.activityInfo.packageName
                val app = JSObject()
                app.put("packageName", packageName)
                app.put("label", label)
                app.put("iconBase64", iconBase64(info.loadIcon(packageManager)))
                app.put("alwaysAllowed", !AppRules.canBlock(packageName, allowed))
                apps.put(app)
            }
        val result = JSObject()
        result.put("apps", apps)
        call.resolve(result)
    }

    private fun packageUri(): Uri = Uri.parse("package:${context.packageName}")

    private fun notificationSettings(): Intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri())
        }

    /** Opens a settings screen; phones without that screen get the app's info page, which has the same switches. */
    private fun open(intent: Intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (missing: ActivityNotFoundException) {
            context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    private fun defaultDialer(): String? = (context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage

    private fun defaultSms(): String? = Telephony.Sms.getDefaultSmsPackage(context)

    /** A 96 × 96 PNG of the app's icon, as base64 text the web app can show. */
    private fun iconBase64(drawable: Drawable): String {
        val size = 96
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        drawable.setBounds(0, 0, size, size)
        drawable.draw(Canvas(bitmap))
        val bytes = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes)
        bitmap.recycle()
        return Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)
    }

    companion object {
        /** Usage access: lets FocusGuard see which app is on the screen. Turned on by the student in Settings. */
        fun hasUsageAccess(context: Context): Boolean {
            val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
            } else {
                @Suppress("DEPRECATION")
                appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
            }
            if (mode == AppOpsManager.MODE_DEFAULT) {
                return context.checkCallingOrSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED
            }
            return mode == AppOpsManager.MODE_ALLOWED
        }

        fun notificationsOn(context: Context): Boolean {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                return false
            }
            return (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled()
        }

        fun ignoresBatteryOptimizations(context: Context): Boolean =
            (context.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(context.packageName)
    }
}
