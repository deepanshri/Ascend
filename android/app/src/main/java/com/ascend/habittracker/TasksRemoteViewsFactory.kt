package com.ascend.habittracker

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray
import org.json.JSONObject

class TasksRemoteViewsFactory(
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
        val views = RemoteViews(context.packageName, R.layout.widget_item_task)
        val row = rows.optJSONObject(position) ?: JSONObject()
        val id = row.optString("id")
        val completed = row.optBoolean("completed", false)
        val title = row.optString("title", "Task")
        val timeLabel = row.optString("time", "").trim()
        val timed = isTimedTask(timeLabel)
        // Single-line label only — no subtitle TextView / no duplicate "To-Do".
        val main = if (timed) {
            "R · $timeLabel · $title"
        } else {
            "TD · $title"
        }

        views.setTextViewText(R.id.task_title, main)
        views.setImageViewResource(
            R.id.task_check,
            if (completed) R.drawable.widget_check_on else R.drawable.widget_check_off
        )

        val toggleFill = Intent().apply {
            putExtra(WidgetContract.EXTRA_ITEM_ID, id)
        }
        views.setOnClickFillInIntent(R.id.task_check, toggleFill)
        views.setOnClickFillInIntent(R.id.task_title, toggleFill)
        views.setOnClickFillInIntent(R.id.task_row, toggleFill)

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
        val raw = WidgetStore.readSnapshot(context).optJSONArray("reminders") ?: JSONArray()
        rows = sortTasks(raw)
    }

    private fun sortTasks(source: JSONArray): JSONArray {
        val items = mutableListOf<JSONObject>()
        for (i in 0 until source.length()) {
            source.optJSONObject(i)?.let { items.add(it) }
        }
        items.sortWith(
            compareBy<JSONObject> { if (it.optBoolean("completed", false)) 1 else 0 }
                .thenBy { if (isTimedTask(it.optString("time", ""))) 0 else 1 }
                .thenBy { it.optString("time", "") }
                .thenBy { it.optString("title", "") }
        )
        val out = JSONArray()
        items.forEach { out.put(it) }
        return out
    }

    private fun isTimedTask(time: String): Boolean {
        val raw = time.trim()
        if (raw.isEmpty()) return false
        if (raw.equals("Anytime", ignoreCase = true)) return false
        if (raw.equals("To-Do", ignoreCase = true)) return false
        return true
    }
}
