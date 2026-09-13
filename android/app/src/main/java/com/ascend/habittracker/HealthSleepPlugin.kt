package com.ascend.habittracker

import android.os.Build
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant

@CapacitorPlugin(name = "HealthSleep")
class HealthSleepPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val sleepReadPermission = HealthPermission.getReadPermission(SleepSessionRecord::class)
    private var permissionLauncher: ActivityResultLauncher<Set<String>>? = null
    private var pendingPermissionCall: PluginCall? = null

    override fun load() {
        val host = activity ?: return
        permissionLauncher = host.registerForActivityResult(
            PermissionController.createRequestPermissionResultContract()
        ) { granted ->
            val call = pendingPermissionCall
            pendingPermissionCall = null
            val result = JSObject()
            result.put("granted", granted.contains(sleepReadPermission))
            call?.resolve(result)
        }
    }

    private fun sdkAvailable(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        return try {
            HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE
        } catch (_: Exception) {
            false
        }
    }

    private fun clientOrNull(): HealthConnectClient? {
        if (!sdkAvailable()) return null
        return try {
            HealthConnectClient.getOrCreate(context)
        } catch (_: Exception) {
            null
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val result = JSObject()
        result.put("available", sdkAvailable())
        if (!sdkAvailable()) {
            result.put("reason", "unlinked")
        }
        call.resolve(result)
    }

    @PluginMethod
    fun checkAuthorization(call: PluginCall) {
        val client = clientOrNull()
        if (client == null) {
            val result = JSObject()
            result.put("granted", false)
            call.resolve(result)
            return
        }
        scope.launch {
            val granted = try {
                withContext(Dispatchers.IO) {
                    client.permissionController.getGrantedPermissions().contains(sleepReadPermission)
                }
            } catch (_: Exception) {
                false
            }
            val result = JSObject()
            result.put("granted", granted)
            call.resolve(result)
        }
    }

    @PluginMethod
    fun requestAuthorization(call: PluginCall) {
        val launcher = permissionLauncher
        if (!sdkAvailable() || launcher == null) {
            val result = JSObject()
            result.put("granted", false)
            call.resolve(result)
            return
        }
        pendingPermissionCall = call
        launcher.launch(setOf(sleepReadPermission))
    }

    @PluginMethod
    fun readSleepSessions(call: PluginCall) {
        val client = clientOrNull()
        if (client == null) {
            val result = JSObject()
            result.put("sessions", JSArray())
            call.resolve(result)
            return
        }

        val startIso = call.getString("startIso")
        val endIso = call.getString("endIso")
        val start = runCatching { Instant.parse(startIso) }.getOrNull()
        val end = runCatching { Instant.parse(endIso) }.getOrNull()
        if (start == null || end == null || !end.isAfter(start)) {
            call.reject("Invalid sleep query window")
            return
        }

        scope.launch {
            try {
                val granted = withContext(Dispatchers.IO) {
                    client.permissionController.getGrantedPermissions().contains(sleepReadPermission)
                }
                if (!granted) {
                    val result = JSObject()
                    result.put("sessions", JSArray())
                    call.resolve(result)
                    return@launch
                }

                val response = withContext(Dispatchers.IO) {
                    client.readRecords(
                        ReadRecordsRequest(
                            recordType = SleepSessionRecord::class,
                            timeRangeFilter = TimeRangeFilter.between(start, end)
                        )
                    )
                }

                val sessions = JSArray()
                response.records.forEach { record ->
                    val minutes = java.time.Duration.between(record.startTime, record.endTime).toMinutes()
                    val row = JSObject()
                    row.put("start", record.startTime.toString())
                    row.put("end", record.endTime.toString())
                    row.put("minutes", minutes.toDouble())
                    sessions.put(row)
                }
                val result = JSObject()
                result.put("sessions", sessions)
                call.resolve(result)
            } catch (err: Exception) {
                call.reject(err.message ?: "Sleep read failed")
            }
        }
    }
}
