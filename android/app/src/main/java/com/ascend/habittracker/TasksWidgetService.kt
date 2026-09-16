package com.ascend.habittracker

import android.content.Intent
import android.widget.RemoteViewsService

class TasksWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return TasksRemoteViewsFactory(applicationContext)
    }
}
