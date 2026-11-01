package app.ekagra.student.focusguard

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Telephony
import android.telecom.TelecomManager
import androidx.core.app.NotificationCompat
import app.ekagra.student.R

/**
 * FocusGuard's foreground service: while a session runs it checks once a second which app is on
 * the screen (UsageStatsManager) and covers blocked apps with the blocker screen. It shows a
 * notification ("Focus: Normalization · 18 min left"), as Android requires for a foreground
 * service (type specialUse on Android 14+), and stops by itself when the session ends.
 */
class FocusGuardService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var usageStats: UsageStatsManager
    private lateinit var overlay: BlockerOverlay
    private var alwaysAllowed: Set<String> = emptySet()
    private var foreground: String? = null
    private var queriedUntil = 0L
    private var notifiedMinutes = -1L
    private var ticking = false

    private val tick = object : Runnable {
        override fun run() {
            check()
            if (ticking) handler.postDelayed(this, TICK_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        usageStats = getSystemService(UsageStatsManager::class.java)
        alwaysAllowed = AppRules.alwaysAllowed(packageName, defaultDialer(), defaultSms())
        overlay = BlockerOverlay(
            this,
            onBackToStudy = { openApp(Uri.parse("ekagra://focus")) },
            onEmergencyUnlock = { app, label ->
                val now = System.currentTimeMillis()
                GuardStore.queueEvent(this, EVENT_EMERGENCY_UNLOCK, app, label, now)
                FocusGuardPlugin.emit(EVENT_EMERGENCY_UNLOCK, app, label, now)
                openApp(Uri.parse("ekagra://focus/tollbooth").buildUpon().appendQueryParameter("app", app).appendQueryParameter("label", label).build())
            },
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL, "Focus sessions", NotificationManager.IMPORTANCE_LOW)
            channel.description = "Shown while FocusGuard blocks apps during a focus session."
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val now = System.currentTimeMillis()
        val session = if (intent?.action == ACTION_STOP) null else GuardStore.load(this)
        // Android wants the notification within a few seconds of starting, even when stopping right away.
        startInForeground(notification(session, now))
        if (session == null || now >= session.endsAt) {
            finish()
            return START_NOT_STICKY
        }
        if (!ticking) {
            ticking = true
            handler.post(tick)
        }
        // If Android closes the service, it starts it again and the session is read back from GuardStore.
        return START_STICKY
    }

    override fun onDestroy() {
        ticking = false
        handler.removeCallbacks(tick)
        overlay.hide()
        super.onDestroy()
    }

    private fun check() {
        val now = System.currentTimeMillis()
        val session = GuardStore.load(this)
        foreground = ForegroundTracker.latest(recentEvents(now), foreground)
        when (GuardRules.decide(session, foreground, now, alwaysAllowed)) {
            Decision.END -> finish()
            Decision.ALLOW -> overlay.hide()
            Decision.BLOCK -> if (session != null) block(session, foreground.orEmpty(), now)
        }
        if (session != null && now < session.endsAt) refreshNotification(session, now)
    }

    private fun block(session: GuardSession, app: String, now: Long) {
        val label = labelOf(app)
        if (!overlay.isShowingFor(app)) {
            GuardStore.queueEvent(this, EVENT_BLOCKED_APP_OPENED, app, label, now)
            FocusGuardPlugin.emit(EVENT_BLOCKED_APP_OPENED, app, label, now)
        }
        overlay.show(app, label, session.title, GuardRules.minutesLeft(session, now), session.unlocksLeft)
    }

    /** "Came to the front" events since the last check (the first time: the last 10 minutes). */
    private fun recentEvents(now: Long): List<AppEvent> {
        val from = if (queriedUntil == 0L) now - FIRST_LOOK_MS else queriedUntil - OVERLAP_MS
        queriedUntil = now
        val found = mutableListOf<AppEvent>()
        val events = usageStats.queryEvents(from, now) ?: return found
        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            // ACTIVITY_RESUMED (Android 10+) has the same number as MOVE_TO_FOREGROUND before it.
            if (event.eventType == RESUMED) found.add(AppEvent(event.timeStamp, event.packageName, resumed = true))
        }
        return found
    }

    private fun labelOf(app: String): String =
        runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(app, 0)).toString() }.getOrDefault(app)

    /** Opens the Ekagra app on a focus link (the web app routes ekagra://focus… to the focus screens). */
    private fun openApp(link: Uri) {
        val intent = Intent(Intent.ACTION_VIEW, link).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        runCatching { startActivity(intent) }.onFailure {
            packageManager.getLaunchIntentForPackage(packageName)?.let { launch -> startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        }
    }

    private fun notification(session: GuardSession?, now: Long): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(Intent.ACTION_VIEW, Uri.parse("ekagra://focus")).setPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val text = session?.let {
            val apps = it.blockedPackages.size
            "${GuardRules.minutesLeft(it, now)} min left · $apps ${if (apps == 1) "app" else "apps"} blocked"
        } ?: "Starting…"
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_focusguard)
            .setContentTitle("Focus: ${session?.title ?: "FocusGuard"}")
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    /** The notification's minutes are updated once a minute. */
    private fun refreshNotification(session: GuardSession, now: Long) {
        val minutes = GuardRules.minutesLeft(session, now)
        if (minutes == notifiedMinutes) return
        notifiedMinutes = minutes
        runCatching { getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(session, now)) }
    }

    private fun startInForeground(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun finish() {
        ticking = false
        handler.removeCallbacks(tick)
        overlay.hide()
        GuardStore.clear(this)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun defaultDialer(): String? = (getSystemService(Context.TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage

    private fun defaultSms(): String? = Telephony.Sms.getDefaultSmsPackage(this)

    companion object {
        const val ACTION_STOP = "app.ekagra.student.focusguard.STOP"
        const val EVENT_BLOCKED_APP_OPENED = "blockedAppOpened"
        const val EVENT_EMERGENCY_UNLOCK = "emergencyUnlock"
        private const val CHANNEL = "focusguard"
        private const val NOTIFICATION_ID = 4501
        private const val TICK_MS = 1_000L
        private const val FIRST_LOOK_MS = 10 * 60_000L
        private const val OVERLAP_MS = 2_000L
        private const val RESUMED = 1

        /** Starts FocusGuard (or makes it read the saved session again). */
        fun start(context: Context) {
            val intent = Intent(context, FocusGuardService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, FocusGuardService::class.java))
        }
    }
}
