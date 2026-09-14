package com.ascend.habittracker

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

class HabitsWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        WidgetViews.updateHabits(context, appWidgetManager, appWidgetIds)
    }
}
