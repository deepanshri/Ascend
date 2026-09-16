package com.ascend.habittracker

import android.content.Context
import android.content.Intent
import android.graphics.Paint
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
        val views = RemoteViews(context.packageName, R.layout.widget_item_habit)
        val row = rows.optJSONObject(position) ?: JSONObject()
        val id = row.optString("id")
        val completed = row.optBoolean("completed", false)
        val streak = row.optInt("streak", 0)

        views.setTextViewText(R.id.habit_title, row.optString("title", "Habit"))
        views.setTextViewText(R.id.habit_streak, if (streak > 0) "${streak}d" else "")
        views.setImageViewResource(
            R.id.habit_check,
            if (completed) R.drawable.widget_check_on else R.drawable.widget_check_off
        )
        views.setInt(
            R.id.habit_title,
            "setPaintFlags",
            if (completed) {
                Paint.STRIKE_THRU_TEXT_FLAG or Paint.ANTI_ALIAS_FLAG
            } else {
                Paint.ANTI_ALIAS_FLAG
            }
        )
        views.setTextColor(
            R.id.habit_title,
            context.getColor(if (completed) R.color.widget_muted else R.color.widget_text)
        )
        // Completed rows stay visible but visually secondary.
        views.setFloat(R.id.habit_row, "setAlpha", if (completed) 0.6f else 1f)

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
        val source = WidgetStore.readSnapshot(context).optJSONArray("habits") ?: JSONArray()
        // Keep every habit visible — incomplete (and in-grace) first, committed completes last.
        rows = sortHabits(source)
    }

    /**
     * Primary: open / grace-checked rows above committed completes.
     * Secondary: original snapshot order (creation / sync index).
     */
    private fun sortHabits(source: JSONArray): JSONArray {
        val items = mutableListOf<Pair<Int, JSONObject>>()
        for (i in 0 until source.length()) {
            val row = source.optJSONObject(i) ?: continue
            items.add(i to row)
        }
        items.sortWith(
            compareBy<Pair<Int, JSONObject>> { (_, row) ->
                val id = row.optString("id")
                val completed = row.optBoolean("completed", false)
                val inGrace = WidgetCompletionGrace.isPending(WidgetCompletionGrace.KIND_HABIT, id)
                // Grace keeps the row in the "open" band so it does not jump until the timer fires.
                if (completed && !inGrace) 1 else 0
            }.thenBy { (index, _) -> index }
        )
        val out = JSONArray()
        items.forEach { (_, row) -> out.put(row) }
        return out
    }
}
