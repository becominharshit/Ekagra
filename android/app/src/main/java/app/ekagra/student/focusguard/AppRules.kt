package app.ekagra.student.focusguard

/**
 * Apps FocusGuard never blocks, whatever the student picked: this app, the phone and messages
 * apps (so calls and emergencies always work), settings, the clock and maps.
 * Plain Kotlin without Android, so it is tested with JUnit (src/test/.../AppRulesTest.kt).
 */
object AppRules {
    private val ALWAYS_ALLOWED = setOf(
        "com.android.settings",
        "com.android.dialer",
        "com.google.android.dialer",
        "com.samsung.android.dialer",
        "com.android.contacts",
        "com.google.android.contacts",
        "com.android.mms",
        "com.google.android.apps.messaging",
        "com.samsung.android.messaging",
        "com.android.deskclock",
        "com.google.android.deskclock",
        "com.sec.android.app.clockpackage",
        "com.oneplus.deskclock",
        "com.coloros.alarmclock",
        "com.google.android.apps.maps",
    )

    /** The apps always allowed on this phone: the list above, this app, and the phone's own dialer and messages apps. */
    fun alwaysAllowed(ownPackage: String, defaultDialer: String?, defaultSms: String?): Set<String> =
        ALWAYS_ALLOWED + listOfNotNull(ownPackage, defaultDialer, defaultSms)

    /** Whether FocusGuard may block this app. */
    fun canBlock(packageName: String, allowed: Set<String>): Boolean = packageName.isNotBlank() && packageName !in allowed
}
