package app.ekagra.student.focusguard

// FocusGuard's decisions, as plain Kotlin without Android, so JUnit tests them
// (src/test/.../FocusGuardStateTest.kt). The service (FocusGuardService.kt) feeds them the clock
// and the app on the screen.

/** A running FocusGuard session. It is saved on the phone (GuardStore), so it survives a restart. */
data class GuardSession(
    val blockedPackages: Set<String>,
    /** When blocking ends (epoch milliseconds). */
    val endsAt: Long,
    /** Shown on the blocker screen and in the notification, e.g. "Normalization". */
    val title: String,
    /** Emergency unlocks (Academic Tollbooth) left today, shown on the blocker screen. */
    val unlocksLeft: Int,
    /** After an emergency unlock, blocked apps open until then (epoch milliseconds; 0 = none). */
    val unlockUntil: Long = 0,
)

enum class Decision {
    /** Leave the app alone (and hide the blocker screen). */
    ALLOW,

    /** Show the blocker screen over it. */
    BLOCK,

    /** The session is over: stop FocusGuard. */
    END,
}

object GuardRules {
    /** What to do while [foreground] is on the screen at [now]. */
    fun decide(session: GuardSession?, foreground: String?, now: Long, alwaysAllowed: Set<String>): Decision {
        if (session == null || now >= session.endsAt) return Decision.END
        if (foreground == null || !AppRules.canBlock(foreground, alwaysAllowed)) return Decision.ALLOW
        if (now < session.unlockUntil) return Decision.ALLOW
        return if (foreground in session.blockedPackages) Decision.BLOCK else Decision.ALLOW
    }

    /** Whole minutes left, rounded up ("18 min left"). */
    fun minutesLeft(session: GuardSession, now: Long): Long = maxOf(0L, (session.endsAt - now + 59_999) / 60_000)
}

/** One event from Android's usage stats: an app's screen came to the front (resumed) or not. */
data class AppEvent(val time: Long, val packageName: String, val resumed: Boolean)

object ForegroundTracker {
    /** The app on the screen: the last one that came to the front, else the one seen before. */
    fun latest(events: List<AppEvent>, previous: String?): String? =
        events.filter { it.resumed }.sortedBy { it.time }.lastOrNull()?.packageName ?: previous
}
