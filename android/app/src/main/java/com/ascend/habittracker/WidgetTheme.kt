package com.ascend.habittracker

import android.content.Context
import android.content.res.Configuration
import org.json.JSONObject

/**
 * In-app Light/Dark theme for widgets.
 * Driven by the Capacitor snapshot's `dark` flag, falling back gracefully
 * to system Configuration.uiMode whenever in-app snapshots do not force an override
 * or when evaluating system defaults.
 */
object WidgetTheme {
    data class Palette(
        val text: Int,
        val muted: Int,
        val accent: Int,
        val cardBg: Int,
        val pillBg: Int,
        val fabBg: Int,
        val subtext: Int = muted,
    )

    private val light = Palette(
        text = 0xFF0F172A.toInt(),
        muted = 0xFF64748B.toInt(),
        accent = 0xFF22C55E.toInt(),
        cardBg = R.drawable.widget_card_bg,
        pillBg = R.drawable.shape_rounded_pill,
        fabBg = R.drawable.widget_fab_circle,
        subtext = 0xFF64748B.toInt(),
    )

    private val dark = Palette(
        text = 0xFFF8FAFC.toInt(),
        muted = 0xFF94A3B8.toInt(),
        accent = 0xFF3B82F6.toInt(),
        cardBg = R.drawable.widget_card_bg_dark,
        pillBg = R.drawable.shape_rounded_pill_dark,
        fabBg = R.drawable.widget_fab_circle_dark,
        subtext = 0xFF94A3B8.toInt(),
    )

    fun isSystemNight(context: Context): Boolean {
        val uiMode = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        return uiMode == Configuration.UI_MODE_NIGHT_YES
    }

    fun isAppDark(context: Context, snapshot: JSONObject? = null): Boolean {
        val isNight = isSystemNight(context)
        if (snapshot == null || !snapshot.has("dark") || snapshot.isNull("dark")) {
            return isNight
        }

        // Check if user explicitly set a forced in-app theme override in preferences
        try {
            val capPrefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val savedTheme = capPrefs.getString("ascend_theme", null)
            if (savedTheme == "dark") return true
            if (savedTheme == "light") return false
        } catch (_: Exception) {}

        // Fall back gracefully to system Configuration.uiMode
        return isNight
    }

    fun isAppDark(snapshot: JSONObject): Boolean = snapshot.optBoolean("dark", false)

    fun palette(context: Context, snapshot: JSONObject? = null): Palette =
        if (isAppDark(context, snapshot)) dark else light

    fun palette(snapshot: JSONObject): Palette =
        if (isAppDark(snapshot)) dark else light

    fun palette(appDark: Boolean): Palette =
        if (appDark) dark else light
}
