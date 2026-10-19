package com.ascend.habittracker

/**
 * Which stored view the widgets may show on [today]. The app publishes today's
 * snapshot plus a precomputed view of tomorrow (`next`), so after midnight the
 * widgets move to the new day without the app running. Anything older is never
 * shown as if it were today.
 */
enum class WidgetDayChoice { CURRENT, NEXT, STALE, EMPTY }

object WidgetDay {
    /** Dates are local `YYYY-MM-DD` strings; blank means the app never published. */
    fun choose(storedIso: String, nextIso: String?, today: String): WidgetDayChoice = when {
        storedIso.isBlank() -> WidgetDayChoice.EMPTY
        storedIso == today -> WidgetDayChoice.CURRENT
        !nextIso.isNullOrBlank() && nextIso == today -> WidgetDayChoice.NEXT
        else -> WidgetDayChoice.STALE
    }
}
