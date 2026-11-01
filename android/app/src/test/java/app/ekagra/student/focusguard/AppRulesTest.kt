package app.ekagra.student.focusguard

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppRulesTest {
    private val allowed = AppRules.alwaysAllowed("app.ekagra.student", "com.truecaller", null)

    @Test
    fun picked_apps_can_be_blocked() {
        assertTrue(AppRules.canBlock("com.instagram.android", allowed))
        assertTrue(AppRules.canBlock("com.google.android.youtube", allowed))
    }

    @Test
    fun this_app_the_phone_messages_settings_and_clock_never_are() {
        for (app in listOf("app.ekagra.student", "com.truecaller", "com.google.android.dialer", "com.google.android.apps.messaging", "com.android.settings", "com.google.android.deskclock")) {
            assertFalse(app, AppRules.canBlock(app, allowed))
        }
        assertFalse(AppRules.canBlock("", allowed))
    }
}
