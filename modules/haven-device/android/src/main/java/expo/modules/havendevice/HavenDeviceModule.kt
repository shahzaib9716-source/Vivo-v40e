package expo.modules.havendevice

import android.Manifest
import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

class HavenDeviceModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)
  private fun usageAllowed(): Boolean {
    val ops = requireNotNull(context.getSystemService(AppOpsManager::class.java))
    return ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED
  }

  override fun definition() = ModuleDefinition {
    Name("HavenDevice")
    AsyncFunction("openUsageSettings") {
      context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    AsyncFunction("readUsage") {
      check(usageAllowed()) { "Enable Usage access for Haven in Android Settings." }
      var screenMs = 0L
      val end = System.currentTimeMillis()
      val week = UsageWeek(end)
      val apps = readUsage(context, week, end) { screenMs = it }
      mapOf("apps" to apps, "screenMs" to screenMs, "measuredAt" to end, "days" to week.days())
    }
    AsyncFunction("applyPolicy") { payload: String ->
      ManagedPolicy.update(context, payload)
    }
    AsyncFunction("clearPolicy") { ManagedPolicy.clear(context) }
    AsyncFunction("currentFix") { promise: Promise ->
      if (Build.VERSION.SDK_INT < 30) {
        promise.reject("E_OS", "GPS check-in requires Android 11 or newer.", null)
        return@AsyncFunction
      }
      val ctx = context
      val manager = requireNotNull(ctx.getSystemService(LocationManager::class.java))
      val fine = ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
      val provider = if (fine && manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) LocationManager.GPS_PROVIDER else LocationManager.NETWORK_PROVIDER
      if (!manager.isProviderEnabled(provider)) {
        promise.reject("E_PROVIDER", "Turn on Android Location and try again.", null)
        return@AsyncFunction
      }
      val signal = CancellationSignal()
      val done = AtomicBoolean()
      val handler = Handler(Looper.getMainLooper())
      val timeout = Runnable {
        if (done.compareAndSet(false, true)) {
          signal.cancel()
          promise.reject("E_TIMEOUT", "Location timed out. Move near a window and retry.", null)
        }
      }
      handler.postDelayed(timeout, 30000)
      manager.getCurrentLocation(provider, signal, ctx.mainExecutor) { fix ->
        handler.removeCallbacks(timeout)
        if (done.compareAndSet(false, true)) {
          if (fix == null || !fix.hasAccuracy()) promise.reject("E_FIX", "No current location available.", null)
          else promise.resolve(mapOf("latitude" to fix.latitude, "longitude" to fix.longitude, "accuracyM" to fix.accuracy.toDouble(), "measuredAt" to fix.time))
        }
      }
    }
  }
}

internal fun readUsage(context: Context, week: UsageWeek? = null, end: Long = System.currentTimeMillis(), screenTime: (Long) -> Unit = {}): List<Map<String, Any>> {
      val pm = context.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      val apps = pm.queryIntentActivities(launcher, 0).associate { it.activityInfo.packageName to it.loadLabel(pm).toString() }
      val start = java.util.Calendar.getInstance().apply {
        timeInMillis = end
        set(java.util.Calendar.HOUR_OF_DAY, 0); set(java.util.Calendar.MINUTE, 0)
        set(java.util.Calendar.SECOND, 0); set(java.util.Calendar.MILLISECOND, 0)
      }.timeInMillis
      val events = requireNotNull(context.getSystemService(UsageStatsManager::class.java)).queryEvents((week?.start ?: start) - 86400000L, end)
      checkNotNull(events) { "Unlock this phone before reading usage." }
      val event = UsageEvents.Event()
      val active = mutableMapOf<String, MutableSet<String>>()
      val opened = mutableMapOf<String, Long>()
      val totals = mutableMapOf<String, Long>()
      fun close(pkg: String, at: Long) {
        val from = opened.remove(pkg) ?: return
        totals[pkg] = (totals[pkg] ?: 0L) + (at - maxOf(start, from)).coerceAtLeast(0L)
      }
      var foregroundMs = 0L
      var previous = week?.start ?: start
      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        val pkg = event.packageName
        val at = event.timeStamp
        if (opened.isNotEmpty()) {
          foregroundMs += (at - maxOf(start, previous)).coerceAtLeast(0L)
          week?.add(previous, at)
        }
        previous = at
        if (event.eventType in listOf(UsageEvents.Event.SCREEN_NON_INTERACTIVE, UsageEvents.Event.DEVICE_SHUTDOWN)) {
          opened.keys.toList().forEach { close(it, at) }
          active.clear()
        } else if (pkg in apps) {
          val activity = event.className ?: pkg
          when (event.eventType) {
            UsageEvents.Event.ACTIVITY_RESUMED -> {
              active.getOrPut(pkg) { mutableSetOf() }.add(activity)
              opened.putIfAbsent(pkg, at)
            }
            UsageEvents.Event.ACTIVITY_PAUSED -> {
              active[pkg]?.remove(activity)
              if (active[pkg].isNullOrEmpty()) close(pkg, at)
            }
          }
        }
      }
      if (opened.isNotEmpty()) {
        foregroundMs += (end - maxOf(previous, start)).coerceAtLeast(0L)
        week?.add(previous, end)
      }
      screenTime(foregroundMs)
      opened.keys.toList().forEach { close(it, end) }
      return apps.map { (pkg, label) -> mapOf("pkg" to pkg, "label" to label, "ms" to (totals[pkg] ?: 0L)) }.sortedByDescending { it["ms"] as Long }
}
