package com.ascend.habittracker

import android.content.Context
import android.os.Handler
import android.os.Looper
import java.util.concurrent.ConcurrentHashMap

/**
 * 2s confirmation window for widget checkboxes:
 * check instantly in place → wait → commit + re-sort (habits stay visible).
 * Retap cancels with zero penalty.
 */
object WidgetCompletionGrace {
    const val DELAY_MS = 2000L
    const val KIND_HABIT = "habit"
    const val KIND_REMINDER = "reminder"

    private val handler = Handler(Looper.getMainLooper())
    private val jobs = ConcurrentHashMap<String, Runnable>()

    fun isPending(kind: String, id: String): Boolean = jobs.containsKey(key(kind, id))

    fun cancelAll() {
        jobs.values.forEach { handler.removeCallbacks(it) }
        jobs.clear()
    }

    /**
     * @return true when snapshot/UI should refresh.
     */
    fun onToggle(context: Context, kind: String, id: String): Boolean {
        if (id.isBlank()) return false
        val appCtx = context.applicationContext
        val jobKey = key(kind, id)

        // Retap within grace → cancel commit, revert check immediately.
        val pending = jobs.remove(jobKey)
        if (pending != null) {
            handler.removeCallbacks(pending)
            return WidgetStore.setItemCompleted(appCtx, kind, id, false)
        }

        val currentlyDone = WidgetStore.isItemCompleted(appCtx, kind, id)
        if (currentlyDone) {
            // Already committed complete → uncheck + sync immediately.
            if (!WidgetStore.setItemCompleted(appCtx, kind, id, false)) return false
            WidgetStore.enqueueCompletion(appCtx, kind, id, false)
            WidgetBridgePlugin.emitLatestAction(appCtx)
            return true
        }

        // Optimistic check in place; after DELAY_MS commit + refresh so list re-sorts.
        if (!WidgetStore.setItemCompleted(appCtx, kind, id, true)) return false
        val commit = Runnable {
            jobs.remove(jobKey)
            if (WidgetStore.isItemCompleted(appCtx, kind, id)) {
                WidgetStore.enqueueCompletion(appCtx, kind, id, true)
                WidgetBridgePlugin.emitLatestAction(appCtx)
                // Refresh dataset so completed habits sink to the bottom (never hidden).
                WidgetViews.updateAll(appCtx)
            }
        }
        jobs[jobKey] = commit
        handler.postDelayed(commit, DELAY_MS)
        return true
    }

    private fun key(kind: String, id: String) = "$kind:$id"
}
