package com.ascend.habittracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-renders the widgets when the day can have changed: the midnight alarm
 * ([WidgetMidnight]), a clock or timezone change, a reboot (alarms are cleared)
 * and an app update. These system broadcasts are all exempt from the Android 8
 * implicit-broadcast limits. Every render re-arms the midnight alarm.
 */
class WidgetDateChangeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            WidgetMidnight.ACTION_MIDNIGHT,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> WidgetViews.updateAll(context)
        }
    }
}
