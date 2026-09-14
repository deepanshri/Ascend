package com.ascend.habittracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class WidgetActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        when (action) {
            WidgetContract.ACTION_TOGGLE_REMINDER -> {
                val id = intent.getStringExtra(WidgetContract.EXTRA_ITEM_ID) ?: return
                if (WidgetStore.toggleReminder(context, id)) {
                    WidgetBridgePlugin.emitLatestAction(context)
                    WidgetViews.updateAll(context)
                }
            }
            WidgetContract.ACTION_TOGGLE_HABIT -> {
                val id = intent.getStringExtra(WidgetContract.EXTRA_ITEM_ID) ?: return
                if (WidgetStore.toggleHabit(context, id)) {
                    WidgetBridgePlugin.emitLatestAction(context)
                    WidgetViews.updateAll(context)
                }
            }
            Intent.ACTION_DATE_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            WidgetContract.ACTION_REFRESH -> {
                WidgetViews.updateAll(context)
            }
        }
    }
}
