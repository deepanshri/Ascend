package com.ascend.habittracker

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray
import org.json.JSONObject

class HabitsRemoteViewsFactory(
    private val context: Context
) : RemoteViewsService.RemoteViewsFactory {
    private var rows: JSONArray = JSONArray()

    override fun onCreate() {
        loadRows()
    }

    override fun onDataSetChanged() {
        loadRows()
    }

    override fun onDestroy() {
        rows = JSONArray()
    }

    override fun getCount(): Int = rows.length()

    override fun getViewAt(position: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_habit_item)
        val row = rows.optJSONObject(position) ?: JSONObject()
        val id = row.optString("id")
        val completed = row.optBoolean("completed", false)
        val streak = row.optInt("streak", 0)

        views.setTextViewText(R.id.habit_title, row.optString("title", "Habit"))
        views.setTextViewText(R.id.habit_streak, if (streak > 0) "${streak}d" else "")
        views.setImageViewResource(
            R.id.habit_check,
            if (completed) R.drawable.widget_box_on else R.drawable.widget_box_off
        )

        // Checkbox (and row) toggles completion in-widget — never launches the app.
        val toggleFill = Intent().apply {
            putExtra(WidgetContract.EXTRA_ITEM_ID, id)
        }
        views.setOnClickFillInIntent(R.id.habit_check, toggleFill)
        views.setOnClickFillInIntent(R.id.habit_title, toggleFill)
        views.setOnClickFillInIntent(R.id.habit_row, toggleFill)

        return views
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long {
        val id = rows.optJSONObject(position)?.optString("id").orEmpty()
        return id.hashCode().toLong()
    }

    override fun hasStableIds(): Boolean = true

    private fun loadRows() {
        rows = WidgetStore.readSnapshot(context).optJSONArray("habits") ?: JSONArray()
    }
}
