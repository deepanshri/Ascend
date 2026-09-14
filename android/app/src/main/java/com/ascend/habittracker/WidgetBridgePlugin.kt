package com.ascend.habittracker

import android.content.Context
import android.content.Intent
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {
    override fun load() {
        instance = this
        dispatchIntent(context, activity?.intent)
    }

    override fun handleOnDestroy() {
        if (instance === this) instance = null
        super.handleOnDestroy()
    }

    @PluginMethod
    fun sync(call: PluginCall) {
        val payload = call.getString("payload") ?: call.data.toString()
        WidgetStore.writeRaw(context, payload)
        WidgetViews.updateAll(context)
        call.resolve()
    }

    @PluginMethod
    fun consumeActions(call: PluginCall) {
        val pending = WidgetStore.consumeActions(context)
        val actions = JSArray()
        for (i in 0 until pending.length()) {
            val row = pending.optJSONObject(i) ?: continue
            try {
                actions.put(JSObject(row.toString()))
            } catch (_: Exception) {
                // skip malformed pending rows
            }
        }
        val result = JSObject()
        result.put("actions", actions)
        call.resolve(result)
    }

    @PluginMethod
    fun getLaunchRoute(call: PluginCall) {
        val result = JSObject()
        result.put("url", WidgetStore.consumeLastRoute(context))
        call.resolve(result)
    }

    companion object {
        @Volatile
        private var instance: WidgetBridgePlugin? = null

        fun dispatchIntent(context: Context?, intent: Intent?) {
            if (context == null || intent == null) return
            val url = intent.data?.toString()
                ?: intent.getStringExtra(WidgetContract.EXTRA_ROUTE)
                ?: return
            WidgetStore.setLastRoute(context, url)
            val plugin = instance ?: return
            val data = JSObject()
            data.put("url", url)
            plugin.notifyListeners("deepLink", data, true)
        }

        fun emitLatestAction(context: Context) {
            val pending = WidgetStore.readPending(context)
            if (pending.length() == 0) return
            val row = pending.optJSONObject(pending.length() - 1) ?: return
            val plugin = instance ?: return
            try {
                plugin.notifyListeners("widgetAction", JSObject(row.toString()), true)
            } catch (_: Exception) {
                // keep pending queue for the next app resume
            }
        }
    }
}
