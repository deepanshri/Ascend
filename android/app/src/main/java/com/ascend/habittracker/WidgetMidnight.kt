package com.ascend.habittracker

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import java.time.LocalDate
import java.time.ZoneId

/**
 * Refreshes the widgets just after local midnight. ACTION_DATE_CHANGED is not
 * delivered to manifest receivers since Android 8, so the widgets kept showing
 * yesterday until the app was opened.
 *
 * A windowed, non-wakeup alarm: no exact-alarm permission, no waking the phone.
 * If the phone is asleep at midnight it fires when the screen next turns on,
 * which is the first moment anyone can see the widget anyway.
 */
object WidgetMidnight {
    const val ACTION_MIDNIGHT = "com.ascend.habittracker.widget.MIDNIGHT"
    private const val REQUEST_CODE = 7_310
    private const val AFTER_MIDNIGHT_MS = 5_000L
    private const val WINDOW_MS = 10 * 60 * 1000L

    /** Arm (or re-arm) the next refresh. Idempotent: the same PendingIntent is replaced. */
    fun schedule(context: Context) {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        val nextMidnight = LocalDate.now()
            .plusDays(1)
            .atStartOfDay(ZoneId.systemDefault())
            .toInstant()
            .toEpochMilli()
        val intent = Intent(context, WidgetDateChangeReceiver::class.java).setAction(ACTION_MIDNIGHT)
        val pending = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        try {
            alarmManager.setWindow(AlarmManager.RTC, nextMidnight + AFTER_MIDNIGHT_MS, WINDOW_MS, pending)
        } catch (_: SecurityException) {
            // Alarm limits hit: the 30-minute widget update still catches up.
        }
    }
}
