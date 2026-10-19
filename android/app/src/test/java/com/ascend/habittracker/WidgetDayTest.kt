package com.ascend.habittracker

import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetDayTest {
    @Test
    fun todaysSnapshotIsShownAsIs() {
        assertEquals(WidgetDayChoice.CURRENT, WidgetDay.choose("2026-10-18", "2026-10-19", "2026-10-18"))
    }

    @Test
    fun afterMidnightTheNextDayViewIsPromoted() {
        assertEquals(WidgetDayChoice.NEXT, WidgetDay.choose("2026-10-18", "2026-10-19", "2026-10-19"))
    }

    @Test
    fun twoDaysLaterTheSnapshotIsStale() {
        assertEquals(WidgetDayChoice.STALE, WidgetDay.choose("2026-10-18", "2026-10-19", "2026-10-20"))
    }

    @Test
    fun aSnapshotWithoutANextDayViewIsStaleAfterMidnight() {
        assertEquals(WidgetDayChoice.STALE, WidgetDay.choose("2026-10-18", null, "2026-10-19"))
        assertEquals(WidgetDayChoice.STALE, WidgetDay.choose("2026-10-18", "", "2026-10-19"))
    }

    @Test
    fun aSnapshotFromALaterDayIsNeverShownAsToday() {
        // Clock or timezone moved back past midnight.
        assertEquals(WidgetDayChoice.STALE, WidgetDay.choose("2026-10-19", "2026-10-20", "2026-10-18"))
    }

    @Test
    fun nothingPublishedYetIsEmpty() {
        assertEquals(WidgetDayChoice.EMPTY, WidgetDay.choose("", null, "2026-10-18"))
    }
}
