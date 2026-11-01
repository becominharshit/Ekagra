package app.ekagra.student.focusguard

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FocusGuardStateTest {
    private val minute = 60_000L
    private val start = 1_800_000_000_000L
    private val allowed = AppRules.alwaysAllowed("app.ekagra.student", "com.google.android.dialer", null)
    private val session = GuardSession(setOf("com.instagram.android", "com.google.android.youtube"), endsAt = start + 25 * minute, title = "Normalization", unlocksLeft = 3)

    @Test
    fun blocks_picked_apps_and_leaves_the_others_alone() {
        assertEquals(Decision.BLOCK, GuardRules.decide(session, "com.instagram.android", start, allowed))
        assertEquals(Decision.ALLOW, GuardRules.decide(session, "com.android.chrome", start, allowed))
        assertEquals(Decision.ALLOW, GuardRules.decide(session, null, start, allowed)) // not known yet
    }

    @Test
    fun never_blocks_the_phone_or_this_app_even_if_picked() {
        val picked = session.copy(blockedPackages = setOf("com.google.android.dialer", "app.ekagra.student"))
        assertEquals(Decision.ALLOW, GuardRules.decide(picked, "com.google.android.dialer", start, allowed))
        assertEquals(Decision.ALLOW, GuardRules.decide(picked, "app.ekagra.student", start, allowed))
    }

    @Test
    fun an_emergency_unlock_opens_blocked_apps_until_it_runs_out() {
        val unlocked = session.copy(unlockUntil = start + 3 * minute)
        assertEquals(Decision.ALLOW, GuardRules.decide(unlocked, "com.instagram.android", start + 2 * minute, allowed))
        assertEquals(Decision.BLOCK, GuardRules.decide(unlocked, "com.instagram.android", start + 3 * minute, allowed))
    }

    @Test
    fun ends_when_the_session_is_over_or_gone() {
        assertEquals(Decision.END, GuardRules.decide(session, "com.instagram.android", start + 25 * minute, allowed))
        assertEquals(Decision.END, GuardRules.decide(null, "com.instagram.android", start, allowed))
    }

    @Test
    fun counts_minutes_left_rounded_up() {
        assertEquals(25L, GuardRules.minutesLeft(session, start))
        assertEquals(18L, GuardRules.minutesLeft(session, start + 7 * minute + 30_000))
        assertEquals(0L, GuardRules.minutesLeft(session, start + 30 * minute))
    }

    @Test
    fun the_app_on_the_screen_is_the_last_one_that_came_to_the_front() {
        val events = listOf(
            AppEvent(start + 2_000, "com.instagram.android", resumed = true),
            AppEvent(start + 1_000, "app.ekagra.student", resumed = true),
            AppEvent(start + 3_000, "com.instagram.android", resumed = false),
        )
        assertEquals("com.instagram.android", ForegroundTracker.latest(events, "com.android.chrome"))
        assertEquals("com.android.chrome", ForegroundTracker.latest(emptyList(), "com.android.chrome")) // nothing new: still the same
        assertNull(ForegroundTracker.latest(emptyList(), null))
    }
}
