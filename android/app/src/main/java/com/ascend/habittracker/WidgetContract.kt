package com.ascend.habittracker

object WidgetContract {
    const val PREFS = "ascend_widget_store"
    const val KEY_SNAPSHOT = "snapshot"
    const val KEY_PENDING = "pending_actions"
    const val KEY_LAST_ROUTE = "last_route"

    const val ACTION_TOGGLE_REMINDER = "com.ascend.habittracker.widget.TOGGLE_REMINDER"
    const val ACTION_TOGGLE_HABIT = "com.ascend.habittracker.widget.TOGGLE_HABIT"
    const val ACTION_REFRESH = "com.ascend.habittracker.widget.REFRESH"

    const val EXTRA_ITEM_ID = "item_id"
    const val EXTRA_COMPLETED = "completed"
    const val EXTRA_ROUTE = "ascend_route"
    const val EXTRA_OPENED_AT = "opened_at"

    const val ROUTE_REPORT = "ascend://app/report"
    const val ROUTE_REMINDERS = "ascend://app/reminders"
    const val ROUTE_HOME = "ascend://app/home"
    const val ROUTE_LEDGER = "ascend://app/ledger"
    const val ROUTE_CREATE_HABIT = "ascend://app/create-habit"
    const val ROUTE_CREATE_TASK = "ascend://app/create-task"

    const val ROW_COUNT = 5
    const val HABITS_LIST_VIEW_ID = "widget_habits_list"
    const val TASKS_LIST_VIEW_ID = "widget_tasks_list"
}
