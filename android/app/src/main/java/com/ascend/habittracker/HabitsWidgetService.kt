package com.ascend.habittracker

import android.content.Intent
import android.widget.RemoteViewsService

class HabitsWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return HabitsRemoteViewsFactory(applicationContext)
    }
}
