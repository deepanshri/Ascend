package com.ascend.habittracker

import org.json.JSONObject

/**
 * In-app Light/Dark theme for widgets — ignores system night mode.
 * Driven by the Capacitor snapshot's `dark` flag.
 */
object WidgetTheme {
    data class Palette(
        val text: Int,
        val muted: Int,
        val accent: Int,
        val cardBg: Int,
        val pillBg: Int,
        val fabBg: Int,
    )

    private val light = Palette(
        text = 0xFF0F172A.toInt(),
        muted = 0xFF64748B.toInt(),
        accent = 0xFF22C55E.toInt(),
        cardBg = R.drawable.widget_card_bg_light,
        pillBg = R.drawable.shape_rounded_pill_light,
        fabBg = R.drawable.widget_fab_circle_light,
    )

    private val dark = Palette(
        text = 0xFFF8FAFC.toInt(),
        muted = 0xFF94A3B8.toInt(),
        accent = 0xFF3B82F6.toInt(),
        cardBg = R.drawable.widget_card_bg_dark,
        pillBg = R.drawable.shape_rounded_pill_dark,
        fabBg = R.drawable.widget_fab_circle_dark,
    )

    fun isAppDark(snapshot: JSONObject): Boolean = snapshot.optBoolean("dark", false)

    fun palette(snapshot: JSONObject): Palette = if (isAppDark(snapshot)) dark else light

    fun palette(appDark: Boolean): Palette = if (appDark) dark else light
}
