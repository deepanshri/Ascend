package com.ascend.habittracker

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

class ReportRingWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        WidgetViews.updateReport(context, appWidgetManager, appWidgetIds)
    }
}
