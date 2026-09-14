package com.ascend.habittracker

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

class IdentityLedgerWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        WidgetViews.updateIdentity(context, appWidgetManager, appWidgetIds)
    }
}
