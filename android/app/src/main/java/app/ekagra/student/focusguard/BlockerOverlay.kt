package app.ekagra.student.focusguard

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.KeyEvent
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The full-screen page over a blocked app: "Focus: Normalization · 18 min left" with
 * "Back to study" and "Emergency unlock (Academic Tollbooth)". It is a window drawn over other
 * apps (needs "display over other apps"). Android's back button counts as "Back to study".
 */
class BlockerOverlay(
    private val context: Context,
    private val onBackToStudy: () -> Unit,
    private val onEmergencyUnlock: (packageName: String, label: String) -> Unit,
) {
    private val windowManager = context.getSystemService(WindowManager::class.java)
    private var screen: Screen? = null
    private var shownFor: String? = null
    private var shownLabel = ""

    private val heading = text(28f, Color.WHITE, bold = true)
    private val detail = text(16f, Color.parseColor("#CBD5E1"))
    private val message = text(16f, Color.WHITE)
    private val backButton = Button(context).apply {
        text = "Back to study"
        isAllCaps = false
        setTextColor(Color.parseColor("#0F172A"))
        backgroundTintList = ColorStateList.valueOf(Color.WHITE)
        setOnClickListener { backToStudy() }
    }
    private val unlockButton = Button(context).apply {
        isAllCaps = false
        setTextColor(Color.WHITE)
        backgroundTintList = ColorStateList.valueOf(Color.parseColor("#334155"))
        setOnClickListener {
            val packageName = shownFor ?: return@setOnClickListener
            val label = shownLabel
            hide()
            onEmergencyUnlock(packageName, label)
        }
    }
    private val hint = text(13f, Color.parseColor("#94A3B8"))

    fun isShowingFor(packageName: String): Boolean = screen != null && shownFor == packageName

    fun show(packageName: String, label: String, title: String, minutesLeft: Long, unlocksLeft: Int) {
        if (!Settings.canDrawOverlays(context)) return
        shownFor = packageName
        shownLabel = label
        heading.text = "Focus time"
        detail.text = "$title · $minutesLeft min left"
        message.text = "$label is blocked until your focus session ends."
        unlockButton.isEnabled = unlocksLeft > 0
        unlockButton.text = if (unlocksLeft > 0) "Emergency unlock (Academic Tollbooth)" else "No emergency unlocks left today"
        hint.text = if (unlocksLeft > 0) "$unlocksLeft left today: answer 3 quick questions from your subject." else "The block ends with your session."
        if (screen == null) {
            val created = build()
            windowManager.addView(created, layoutParams())
            screen = created
        }
    }

    fun hide() {
        screen?.let { runCatching { windowManager.removeView(it) } }
        screen = null
        shownFor = null
    }

    private fun backToStudy() {
        hide()
        onBackToStudy()
    }

    private fun build(): Screen {
        val column = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(32), dp(32), dp(32))
        }
        // The texts and buttons are reused: take them out of the page shown last time.
        listOf(heading, detail, message, backButton, unlockButton, hint).forEach { view ->
            (view.parent as? ViewGroup)?.removeView(view)
        }
        column.addView(heading)
        column.addView(detail, spaced(8))
        column.addView(message, spaced(32))
        column.addView(backButton, spaced(32, fullWidth = true))
        column.addView(unlockButton, spaced(12, fullWidth = true))
        column.addView(hint, spaced(12))
        return Screen(context).apply {
            setBackgroundColor(Color.parseColor("#F20F172A"))
            addView(column, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
    }

    private fun layoutParams(): WindowManager.LayoutParams {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        return WindowManager.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        )
    }

    private fun text(size: Float, color: Int, bold: Boolean = false) = TextView(context).apply {
        textSize = size
        setTextColor(color)
        gravity = Gravity.CENTER
        if (bold) typeface = Typeface.DEFAULT_BOLD
    }

    private fun spaced(top: Int, fullWidth: Boolean = false) = LinearLayout.LayoutParams(
        if (fullWidth) ViewGroup.LayoutParams.MATCH_PARENT else ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(top) }

    private fun dp(value: Int): Int = (value * context.resources.displayMetrics.density).toInt()

    /** The page itself: the back button means "Back to study". */
    private inner class Screen(context: Context) : FrameLayout(context) {
        override fun dispatchKeyEvent(event: KeyEvent): Boolean {
            if (event.keyCode == KeyEvent.KEYCODE_BACK) {
                if (event.action == KeyEvent.ACTION_UP) backToStudy()
                return true
            }
            return super.dispatchKeyEvent(event)
        }
    }
}
