package com.ascend.habittracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri

class WidgetActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        when (action) {
            WidgetContract.ACTION_TOGGLE_REMINDER -> {
                val id = intent.getStringExtra(WidgetContract.EXTRA_ITEM_ID) ?: return
                if (WidgetCompletionGrace.onToggle(context, WidgetCompletionGrace.KIND_REMINDER, id)) {
                    WidgetViews.updateAll(context)
                }
            }
            WidgetContract.ACTION_TOGGLE_HABIT -> {
                val route = intent.getStringExtra(WidgetContract.EXTRA_ROUTE)
                if (!route.isNullOrBlank()) {
                    openApp(context, route)
                    return
                }
                val id = intent.getStringExtra(WidgetContract.EXTRA_ITEM_ID) ?: return
                if (WidgetCompletionGrace.onToggle(context, WidgetCompletionGrace.KIND_HABIT, id)) {
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

    private fun openApp(context: Context, route: String) {
        val launch = Intent(context, MainActivity::class.java).apply {
            this.action = Intent.ACTION_VIEW
            data = Uri.parse(route)
            putExtra(WidgetContract.EXTRA_ROUTE, route)
            putExtra(WidgetContract.EXTRA_OPENED_AT, System.currentTimeMillis())
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        context.startActivity(launch)
    }
}
