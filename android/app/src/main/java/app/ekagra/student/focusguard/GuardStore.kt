package app.ekagra.student.focusguard

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * FocusGuard's memory on the phone (SharedPreferences): the running session, so blocking goes on
 * after a restart (BootReceiver), and the events the web app hasn't picked up yet (blocked apps
 * opened, emergency unlocks asked for). The web app takes the events with takeEvents().
 */
object GuardStore {
    private const val PREFS = "focusguard"
    private const val MAX_EVENTS = 50

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun save(context: Context, session: GuardSession) {
        prefs(context).edit()
            .putStringSet("blocked", session.blockedPackages)
            .putLong("endsAt", session.endsAt)
            .putString("title", session.title)
            .putInt("unlocksLeft", session.unlocksLeft)
            .putLong("unlockUntil", session.unlockUntil)
            .apply()
    }

    fun load(context: Context): GuardSession? {
        val prefs = prefs(context)
        val endsAt = prefs.getLong("endsAt", 0L)
        if (endsAt == 0L) return null
        return GuardSession(
            blockedPackages = prefs.getStringSet("blocked", emptySet()).orEmpty().toSet(),
            endsAt = endsAt,
            title = prefs.getString("title", null) ?: "Focus",
            unlocksLeft = prefs.getInt("unlocksLeft", 0),
            unlockUntil = prefs.getLong("unlockUntil", 0L),
        )
    }

    /** Forgets the session (the event queue stays for the web app). */
    fun clear(context: Context) {
        prefs(context).edit().remove("blocked").remove("endsAt").remove("title").remove("unlocksLeft").remove("unlockUntil").apply()
    }

    fun setUnlockUntil(context: Context, until: Long) {
        prefs(context).edit().putLong("unlockUntil", until).apply()
    }

    @Synchronized
    fun queueEvent(context: Context, type: String, packageName: String, label: String, at: Long) {
        val events = JSONArray(prefs(context).getString("events", "[]"))
        events.put(JSONObject().put("type", type).put("packageName", packageName).put("label", label).put("at", at))
        // Only the newest ones, in case the web app isn't opened for a long time.
        val kept = JSONArray()
        for (index in maxOf(0, events.length() - MAX_EVENTS) until events.length()) kept.put(events.get(index))
        prefs(context).edit().putString("events", kept.toString()).apply()
    }

    /** The events not picked up yet, oldest first; afterwards the queue is empty. */
    @Synchronized
    fun takeEvents(context: Context): JSONArray {
        val events = JSONArray(prefs(context).getString("events", "[]"))
        prefs(context).edit().remove("events").apply()
        return events
    }
}
