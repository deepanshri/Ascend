package com.ascend.habittracker

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object WidgetStore {
    fun readSnapshot(context: Context): JSONObject {
        val raw = prefs(context).getString(WidgetContract.KEY_SNAPSHOT, null)
        return try {
            if (raw.isNullOrBlank()) emptySnapshot() else JSONObject(raw)
        } catch (_: Exception) {
            emptySnapshot()
        }
    }

    fun writeRaw(context: Context, payload: String) {
        // App sync is authoritative — drop any in-flight widget grace timers.
        WidgetCompletionGrace.cancelAll()
        prefs(context).edit().putString(WidgetContract.KEY_SNAPSHOT, payload).apply()
    }

    fun writeSnapshot(context: Context, snapshot: JSONObject) {
        prefs(context).edit().putString(WidgetContract.KEY_SNAPSHOT, snapshot.toString()).apply()
    }

    fun emptySnapshot(): JSONObject {
        return JSONObject()
            .put("version", 1)
            .put("todayIso", "")
            .put("dark", false)
            .put("score", 0)
            .put("habitsCompleted", 0)
            .put("totalHabits", 0)
            .put("workRate", 0)
            .put("selfRate", 0)
            .put("sleepRate", JSONObject.NULL)
            .put("reminders", JSONArray())
            .put("habits", JSONArray())
            .put("identity", JSONObject().put("points", 0).put("lines", JSONArray()))
            .put("lastUpdated", "")
    }

    fun enqueueAction(context: Context, action: JSONObject) {
        val pending = readPending(context)
        pending.put(action)
        prefs(context).edit().putString(WidgetContract.KEY_PENDING, pending.toString()).apply()
    }

    fun readPending(context: Context): JSONArray {
        val raw = prefs(context).getString(WidgetContract.KEY_PENDING, null)
        return try {
            if (raw.isNullOrBlank()) JSONArray() else JSONArray(raw)
        } catch (_: Exception) {
            JSONArray()
        }
    }

    fun consumeActions(context: Context): JSONArray {
        val pending = readPending(context)
        prefs(context).edit().remove(WidgetContract.KEY_PENDING).apply()
        return pending
    }

    fun setLastRoute(context: Context, url: String?) {
        prefs(context).edit().putString(WidgetContract.KEY_LAST_ROUTE, url).apply()
    }

    fun consumeLastRoute(context: Context): String? {
        val url = prefs(context).getString(WidgetContract.KEY_LAST_ROUTE, null)
        prefs(context).edit().remove(WidgetContract.KEY_LAST_ROUTE).apply()
        return url
    }

    fun isItemCompleted(context: Context, kind: String, id: String): Boolean {
        val row = findRow(readSnapshot(context), kind, id) ?: return false
        return row.optBoolean("completed", false)
    }

    /** Optimistic / local completion only — does not enqueue a backend action. */
    fun setItemCompleted(context: Context, kind: String, id: String, completed: Boolean): Boolean {
        val snapshot = readSnapshot(context)
        val row = findRow(snapshot, kind, id) ?: return false
        val prev = row.optBoolean("completed", false)
        if (prev == completed) return false
        row.put("completed", completed)
        if (kind == WidgetCompletionGrace.KIND_HABIT) {
            val completedCount = snapshot.optInt("habitsCompleted", 0)
            snapshot.put(
                "habitsCompleted",
                (completedCount + if (completed) 1 else -1).coerceAtLeast(0)
            )
        }
        writeSnapshot(context, snapshot)
        return true
    }

    fun enqueueCompletion(context: Context, kind: String, id: String, completed: Boolean) {
        val type = if (kind == WidgetCompletionGrace.KIND_HABIT) "habit" else "reminder"
        enqueueAction(
            context,
            JSONObject().put("type", type).put("id", id).put("completed", completed)
        )
    }

    private fun findRow(snapshot: JSONObject, kind: String, id: String): JSONObject? {
        val key = if (kind == WidgetCompletionGrace.KIND_HABIT) "habits" else "reminders"
        val rows = snapshot.optJSONArray(key) ?: return null
        for (i in 0 until rows.length()) {
            val row = rows.optJSONObject(i) ?: continue
            if (row.optString("id") == id) return row
        }
        return null
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(WidgetContract.PREFS, Context.MODE_PRIVATE)
}
