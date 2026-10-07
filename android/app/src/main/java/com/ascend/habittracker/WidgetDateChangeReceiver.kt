package com.ascend.habittracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class WidgetDateChangeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action == Intent.ACTION_DATE_CHANGED ||
            action == Intent.ACTION_TIMEZONE_CHANGED ||
            action == Intent.ACTION_CONFIGURATION_CHANGED
        ) {
            WidgetViews.updateAll(context)
        }
    }
}
