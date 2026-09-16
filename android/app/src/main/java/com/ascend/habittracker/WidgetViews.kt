package com.ascend.habittracker

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import kotlin.math.min
import kotlin.math.roundToInt

object WidgetViews {
    private val identityLineIds = intArrayOf(
        R.id.widget_identity_line_1, R.id.widget_identity_line_2
    )

    fun updateAll(context: Context) {
        val task = {
            val manager = AppWidgetManager.getInstance(context)
            updateReport(context, manager, ids(context, manager, ReportRingWidget::class.java))
            updateReminders(context, manager, ids(context, manager, RemindersWidget::class.java))
            updateHabits(context, manager, ids(context, manager, HabitsWidget::class.java))
            updateIdentity(context, manager, ids(context, manager, IdentityLedgerWidget::class.java))
        }
        if (Looper.myLooper() == Looper.getMainLooper()) task()
        else Handler(Looper.getMainLooper()).post(task)
    }

    fun updateReport(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        val snapshot = WidgetStore.readSnapshot(context)
        val dark = isDark(context)
        val work = snapshot.optDouble("workRate", 0.0).toFloat()
        val self = snapshot.optDouble("selfRate", 0.0).toFloat()
        val sleep = if (!snapshot.has("sleepRate") || snapshot.isNull("sleepRate")) {
            null
        } else {
            snapshot.optDouble("sleepRate", 0.0).toFloat()
        }
        val score = snapshot.optInt("score", 0)
        val done = snapshot.optInt("habitsCompleted", 0)
        val total = snapshot.optInt("totalHabits", 0)
        val mix = if (sleep == null) ((work + self) / 2f) else ((work + self + sleep) / 3f)

        appWidgetIds.forEach { id ->
            val views = RemoteViews(context.packageName, R.layout.widget_report_ring)
            views.setImageViewBitmap(R.id.widget_report_rings, drawRings(work, self, sleep, dark))
            views.setTextViewText(R.id.widget_report_score, score.toString())
            views.setTextViewText(R.id.widget_report_label, "MOMENTUM")
            views.setTextViewText(
                R.id.widget_report_progress,
                "${(mix * 100).roundToInt()}% · $done/$total today"
            )
            views.setOnClickPendingIntent(
                R.id.widget_report_root,
                openApp(context, WidgetContract.ROUTE_REPORT, id)
            )
            manager.updateAppWidget(id, views)
        }
    }

    fun updateReminders(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        val raw = WidgetStore.readSnapshot(context).optJSONArray("reminders") ?: JSONArray()
        val rows = sortTasksForWidget(raw)
        val doneCount = countCompletedTasks(rows)
        val yetToCount = countOpenTasks(rows)
        val visibleCount = countVisibleRows(rows, WidgetCompletionGrace.KIND_REMINDER)
        appWidgetIds.forEach { widgetId ->
            val views = RemoteViews(context.packageName, R.layout.widget_tasks)
            // Only the corner + opens the app.
            views.setOnClickPendingIntent(
                R.id.widget_tasks_add,
                openApp(context, WidgetContract.ROUTE_REMINDERS, widgetId)
            )
            views.setTextViewText(R.id.widget_tasks_done, doneCount.toString())
            views.setTextViewText(R.id.widget_tasks_yet, yetToCount.toString())
            views.setTextViewText(R.id.widget_reminders_header, context.getString(R.string.widget_tasks_title))
            views.setViewVisibility(R.id.widget_reminders_empty, if (visibleCount == 0) View.VISIBLE else View.GONE)
            views.setViewVisibility(R.id.widget_tasks_list, if (visibleCount == 0) View.GONE else View.VISIBLE)

            val serviceIntent = Intent(context, TasksWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            views.setRemoteAdapter(R.id.widget_tasks_list, serviceIntent)
            views.setEmptyView(R.id.widget_tasks_list, R.id.widget_reminders_empty)

            val toggleTemplate = PendingIntent.getBroadcast(
                context,
                widgetId * 60,
                Intent(context, WidgetActionReceiver::class.java).apply {
                    action = WidgetContract.ACTION_TOGGLE_REMINDER
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
            views.setPendingIntentTemplate(R.id.widget_tasks_list, toggleTemplate)

            manager.updateAppWidget(widgetId, views)
            manager.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_tasks_list)
        }
    }

    fun updateHabits(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        val snapshot = WidgetStore.readSnapshot(context)
        val rows = snapshot.optJSONArray("habits") ?: JSONArray()
        val count = rows.length()
        val doneCount = snapshot.optInt("habitsCompleted", countCompletedHabits(rows)).coerceIn(0, count)
        val yetToCount = (count - doneCount).coerceAtLeast(0)
        val visibleCount = countVisibleRows(rows, WidgetCompletionGrace.KIND_HABIT)
        appWidgetIds.forEach { widgetId ->
            val views = RemoteViews(context.packageName, R.layout.widget_habits)
            // Only the corner + opens the app; list toggles stay in-widget.
            views.setOnClickPendingIntent(
                R.id.widget_habits_add,
                openApp(context, WidgetContract.ROUTE_HOME, widgetId)
            )
            views.setTextViewText(R.id.widget_habits_done, doneCount.toString())
            views.setTextViewText(R.id.widget_habits_yet, yetToCount.toString())
            views.setViewVisibility(R.id.widget_habits_empty, if (visibleCount == 0) View.VISIBLE else View.GONE)
            views.setViewVisibility(R.id.widget_habits_list, if (visibleCount == 0) View.GONE else View.VISIBLE)

            val serviceIntent = Intent(context, HabitsWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            views.setRemoteAdapter(R.id.widget_habits_list, serviceIntent)
            views.setEmptyView(R.id.widget_habits_list, R.id.widget_habits_empty)

            val toggleTemplate = PendingIntent.getBroadcast(
                context,
                widgetId * 40,
                Intent(context, WidgetActionReceiver::class.java).apply {
                    action = WidgetContract.ACTION_TOGGLE_HABIT
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
            views.setPendingIntentTemplate(R.id.widget_habits_list, toggleTemplate)

            manager.updateAppWidget(widgetId, views)
            manager.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_habits_list)
        }
    }

    fun updateIdentity(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        val snapshot = WidgetStore.readSnapshot(context)
        val today = LocalDate.now().toString()
        val fresh = snapshot.optString("todayIso") == today
        val identity = snapshot.optJSONObject("identity") ?: JSONObject()
        val points = if (fresh) identity.optInt("points", 0) else 0
        val lines = if (fresh) identity.optJSONArray("lines") ?: JSONArray() else JSONArray()

        appWidgetIds.forEach { id ->
            val views = RemoteViews(context.packageName, R.layout.widget_identity)
            views.setTextViewText(R.id.widget_identity_kicker, "TODAY'S LEDGER")
            views.setTextViewText(R.id.widget_identity_points, "$points pts")
            views.setViewVisibility(R.id.widget_identity_empty, if (lines.length() == 0) View.VISIBLE else View.GONE)
            views.setTextViewText(
                R.id.widget_identity_empty,
                if (fresh) "No identity votes yet today" else "Open Ascend to refresh today's ledger"
            )
            for (index in identityLineIds.indices) {
                val line = lines.optJSONObject(index)
                if (line == null) {
                    views.setViewVisibility(identityLineIds[index], View.GONE)
                } else {
                    views.setViewVisibility(identityLineIds[index], View.VISIBLE)
                    views.setTextViewText(
                        identityLineIds[index],
                        "${line.optString("label")} · ${line.optString("detail")}"
                    )
                }
            }
            views.setOnClickPendingIntent(
                R.id.widget_identity_root,
                openApp(context, WidgetContract.ROUTE_LEDGER, id)
            )
            manager.updateAppWidget(id, views)
        }
    }

    private fun ids(context: Context, manager: AppWidgetManager, cls: Class<*>): IntArray {
        return manager.getAppWidgetIds(ComponentName(context, cls))
    }

    /** Timed reminders (R) above timeless to-dos (TD); open items before completed. */
    private fun sortTasksForWidget(source: JSONArray): JSONArray {
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

    private fun countOpenTasks(rows: JSONArray): Int {
        var open = 0
        for (i in 0 until rows.length()) {
            val row = rows.optJSONObject(i) ?: continue
            if (!row.optBoolean("completed", false)) open += 1
        }
        return open
    }

    private fun countCompletedTasks(rows: JSONArray): Int {
        var done = 0
        for (i in 0 until rows.length()) {
            val row = rows.optJSONObject(i) ?: continue
            if (row.optBoolean("completed", false)) done += 1
        }
        return done
    }

    private fun countCompletedHabits(rows: JSONArray): Int {
        var done = 0
        for (i in 0 until rows.length()) {
            val row = rows.optJSONObject(i) ?: continue
            if (row.optBoolean("completed", false)) done += 1
        }
        return done
    }

    /** Rows still shown in the ListView (open + in-grace completes). */
    private fun countVisibleRows(rows: JSONArray, kind: String): Int {
        var visible = 0
        for (i in 0 until rows.length()) {
            val row = rows.optJSONObject(i) ?: continue
            val id = row.optString("id")
            val completed = row.optBoolean("completed", false)
            if (!completed || WidgetCompletionGrace.isPending(kind, id)) visible += 1
        }
        return visible
    }

    private fun isDark(context: Context): Boolean {
        val mode = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        return mode == Configuration.UI_MODE_NIGHT_YES
    }

    private fun openApp(context: Context, url: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(url)
            putExtra(WidgetContract.EXTRA_ROUTE, url)
            putExtra(WidgetContract.EXTRA_OPENED_AT, System.currentTimeMillis())
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun actionIntent(context: Context, action: String, itemId: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, WidgetActionReceiver::class.java).apply {
            this.action = action
            putExtra(WidgetContract.EXTRA_ITEM_ID, itemId)
        }
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun drawRings(work: Float, self: Float, sleep: Float?, dark: Boolean): Bitmap {
        val width = 320
        val height = 220
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val cx = width / 2f
        val cy = height / 2f
        val accent = if (dark) 0xFF3B82F6.toInt() else 0xFF22C55E.toInt()
        val accentSoft = if (dark) 0xFF93C5FD.toInt() else 0xFF4ADE80.toInt()
        val sleepColor = if (dark) 0xFF1D4ED8.toInt() else 0xFF166534.toInt()
        val track = if (dark) 0xFF334155.toInt() else 0xFFE2E8F0.toInt()

        val rings = if (sleep == null) {
            listOf(Triple(78f, work, accent), Triple(52f, self, accentSoft))
        } else {
            listOf(
                Triple(86f, sleep, sleepColor),
                Triple(64f, work, accent),
                Triple(42f, self, accentSoft)
            )
        }

        rings.forEach { (radius, rate, color) ->
            val stroke = 16f
            val rect = RectF(cx - radius, cy - radius, cx + radius, cy + radius)
            val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = stroke
                this.color = track
                strokeCap = Paint.Cap.ROUND
            }
            val valuePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = stroke
                this.color = color
                strokeCap = Paint.Cap.ROUND
            }
            canvas.drawArc(rect, -90f, 360f, false, trackPaint)
            canvas.drawArc(rect, -90f, 360f * rate.coerceIn(0f, 1f), false, valuePaint)
        }
        return bitmap
    }
}
