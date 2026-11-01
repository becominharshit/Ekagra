package app.ekagra.student.focusguard

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import app.ekagra.student.R

/**
 * Reminders at a set time, e.g. "Launchpad: time's up" when the 10 minutes on Upwork end. Android's
 * AlarmManager wakes ReminderReceiver then, even if the app is closed. The alarm is exact when the
 * student allowed "Alarms & reminders" (automatic on Android 12–13); otherwise Android may deliver
 * it a few minutes late, and the app still asks "Did you do it?" when it's opened again.
 */
object Reminders {
    private const val CHANNEL = "launchpad"
    private const val ACTION = "app.ekagra.student.focusguard.REMINDER"

    fun canBeExact(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

    fun schedule(context: Context, id: String, at: Long, title: String, body: String) {
        val alarms = context.getSystemService(AlarmManager::class.java)
        val pending = pendingIntent(context, id, title, body)
        if (canBeExact(context)) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
        } else {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
        }
    }

    fun cancel(context: Context, id: String) {
        context.getSystemService(AlarmManager::class.java).cancel(pendingIntent(context, id, "", ""))
        context.getSystemService(NotificationManager::class.java).cancel(id.hashCode())
    }

    /** Shows the reminder; tapping it opens the app. Without the notifications permission nothing shows. */
    fun show(context: Context, id: String, title: String, body: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val manager = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(NotificationChannel(CHANNEL, "Launchpad reminders", NotificationManager.IMPORTANCE_HIGH))
        }
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val open = launch?.let { PendingIntent.getActivity(context, id.hashCode(), it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_focusguard)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        manager.notify(id.hashCode(), notification)
    }

    // The same id gives the same PendingIntent, so a new time replaces the old one and cancel finds it.
    private fun pendingIntent(context: Context, id: String, title: String, body: String): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java)
            .setAction(ACTION)
            .putExtra("id", id)
            .putExtra("title", title)
            .putExtra("body", body)
        return PendingIntent.getBroadcast(context, id.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
}

/** Woken by AlarmManager at the reminder's time. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Reminders.show(context, intent.getStringExtra("id").orEmpty(), intent.getStringExtra("title").orEmpty(), intent.getStringExtra("body").orEmpty())
    }
}
