package expo.modules.havendevice

import android.Manifest
import android.app.role.RoleManager
import android.app.AppOpsManager
import android.app.NotificationManager
import android.app.admin.DevicePolicyManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

class HavenDeviceModule : Module() {
  private var mediaRequest: Promise? = null
  private val context get() = requireNotNull(appContext.reactContext)
  private fun usageAllowed(): Boolean {
    val ops = requireNotNull(context.getSystemService(AppOpsManager::class.java))
    return ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED
  }

  private fun launchMedia(intent: Intent, code: Int, promise: Promise) {
    Handler(Looper.getMainLooper()).post {
      val activity = appContext.currentActivity
      if (activity == null || !activity.hasWindowFocus() || mediaRequest != null) {
        promise.reject("E_MEDIA", "Open Haven and finish the current media action.", null)
      } else {
        mediaRequest = promise
        try { activity.startActivityForResult(intent, code) }
        catch (e: Exception) {
          mediaRequest = null
          promise.reject("E_MEDIA", "Unable to open the requested screen.", e)
        }
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("HavenDevice")
    Events("onTrip")
    OnCreate { TripService.receive = { event -> sendEvent("onTrip", event) } }
    AsyncFunction("startTrip") { scope: String, session: String, threshold: Int ->
      val activity = requireNotNull(appContext.currentActivity)
      check(activity.hasWindowFocus()) { "Open the trip screen to start sharing." }
      check(TripService.visibleChannel(activity)) { "Enable Haven trip notifications before sharing." }
      val intent = Intent(activity, TripService::class.java).putExtra("scope", scope)
        .putExtra("session", session).putExtra("threshold", threshold)
      if (Build.VERSION.SDK_INT >= 26) activity.startForegroundService(intent) else activity.startService(intent)
      Unit
    }
    AsyncFunction("endTrip") { context.stopService(Intent(context, TripService::class.java)); Unit }
    AsyncFunction("appCache") { clear: Boolean ->
      val result = AppCache.inspect(listOf(context.cacheDir) + context.externalCacheDirs.filterNotNull(), clear, VoiceNoteActivity.activeFile)
      mapOf("bytes" to result.bytes.toDouble(), "failures" to result.failures)
    }
    AsyncFunction("usingWifi") {
      val manager = requireNotNull(context.getSystemService(android.net.ConnectivityManager::class.java))
      manager.getNetworkCapabilities(manager.activeNetwork)?.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) == true
    }
    AsyncFunction("takeCheckinPhoto") { promise: Promise ->
      launchMedia(Intent(context, CheckinCameraActivity::class.java), 58110, promise)
    }
    AsyncFunction("captureHavenWindow") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) promise.reject("E_SCREEN", "Open the Haven screen first.", null)
      else HavenWindow.capture(activity) { result ->
        result.onSuccess { promise.resolve(it) }.onFailure { promise.reject("E_SCREEN", "Could not capture the visible Haven screen.", it) }
      }
      Unit
    }
    AsyncFunction("chooseCheckinImage") { promise: Promise ->
      launchMedia(Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE), 58111, promise)
    }
    AsyncFunction("recordVoiceNote") { promise: Promise ->
      launchMedia(Intent(context, VoiceNoteActivity::class.java), 58112, promise)
    }
    AsyncFunction("playVoiceNote") { audio: String, promise: Promise ->
      require(audio.length in 1..240000)
      launchMedia(Intent(context, VoiceNoteActivity::class.java).putExtra("audio", audio), 58113, promise)
    }
    OnActivityResult { _, result ->
      if (result.requestCode in 58110..58113) {
        val request = mediaRequest
        mediaRequest = null
        if (result.resultCode != android.app.Activity.RESULT_OK || result.requestCode == 58113) request?.resolve(null)
        else if (result.requestCode == 58110) request?.resolve(result.data?.getStringExtra("jpeg"))
        else if (result.requestCode == 58112) request?.resolve(result.data?.getStringExtra("audio"))
        else {
          val uri = result.data?.data
          val resolver = context.contentResolver
          Thread {
            try { request?.resolve(CheckinImage.preview(resolver, requireNotNull(uri))) }
            catch (e: Exception) { request?.reject("E_IMAGE", "Unable to open this picture.", e) }
          }.start()
        }
      }
    }
    OnDestroy {
      TripService.receive = null
      appContext.reactContext?.let { it.stopService(Intent(it, TripService::class.java)) }
      mediaRequest?.reject("E_MEDIA", "Media session ended.", null); mediaRequest = null }
    AsyncFunction("permissionStatus") {
      val ctx = context
      val policy = requireNotNull(ctx.getSystemService(DevicePolicyManager::class.java))
      mapOf(
        "screeningRole" to (Build.VERSION.SDK_INT >= 29 && ctx.getSystemService(RoleManager::class.java)?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) == true),
        "screeningEnabled" to ctx.getSharedPreferences("haven-call-screening", Context.MODE_PRIVATE).getBoolean("enabled", false),
        "usage" to usageAllowed(),
        "location" to (ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
          ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED),
        "admin" to policy.isAdminActive(ComponentName(ctx, HavenAdmin::class.java)),
        "owner" to policy.isDeviceOwnerApp(ctx.packageName),
        "notifications" to requireNotNull(ctx.getSystemService(NotificationManager::class.java)).areNotificationsEnabled(),
        "batteryExempt" to requireNotNull(ctx.getSystemService(PowerManager::class.java)).isIgnoringBatteryOptimizations(ctx.packageName)
      )
    }
    AsyncFunction("batteryPercent") {
      context.getSystemService(android.os.BatteryManager::class.java)?.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 0..100 } ?: -1
    }
    AsyncFunction("familyCallConsent") { scope: String -> FamilyCallRule.optedIn(context, scope) }
    AsyncFunction("setFamilyCallConsent") { scope: String, allow: Boolean -> FamilyCallRule.consent(context, scope, allow) }
    AsyncFunction("applyFamilyCallRule") { scope: String, block: Boolean? -> FamilyCallRule.apply(context, scope, block) }
    AsyncFunction("requestScreeningRole") {
      check(Build.VERSION.SDK_INT >= 29) { "Call screening requires Android 10 or later." }
      val manager = requireNotNull(context.getSystemService(RoleManager::class.java))
      check(manager.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) { "This phone does not offer call screening." }
      val activity = requireNotNull(appContext.currentActivity)
      activity.startActivityForResult(manager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING), 58109)
    }
    AsyncFunction("setScreeningEnabled") { enabled: Boolean ->
      if (enabled) {
        check(Build.VERSION.SDK_INT >= 29 && context.getSystemService(RoleManager::class.java)?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) == true)
      }
      check(context.getSharedPreferences("haven-call-screening", Context.MODE_PRIVATE).edit().putBoolean("enabled", enabled).commit())
    }
    AsyncFunction("openAdminActivation") {
      val ctx = context
      val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
        .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, ComponentName(ctx, HavenAdmin::class.java))
        .putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Optional Android administration. App restrictions require Device Owner enrollment.")
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
    }
    AsyncFunction("openBatterySettings") {
      context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
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
      val totals = mutableMapOf<String, AppUsageWindow>()
      fun close(pkg: String, at: Long) {
        val from = opened.remove(pkg) ?: return
        totals.getOrPut(pkg) { AppUsageWindow(start, week?.start) }.add(from, at)
      }
      var foregroundMs = 0L
      var previous = week?.start ?: start
      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        val pkg = event.packageName
        val at = event.timeStamp
        if (event.eventType == UsageEvents.Event.DEVICE_STARTUP) {
          opened.keys.toList().forEach { close(it, previous) }
          active.clear()
          previous = at
          continue
        }
        if (opened.isNotEmpty()) {
          foregroundMs += (at - maxOf(start, previous)).coerceAtLeast(0L)
          week?.add(previous, at)
        }
        previous = at
        if (event.eventType == UsageEvents.Event.SCREEN_NON_INTERACTIVE || event.eventType == UsageEvents.Event.DEVICE_SHUTDOWN) {
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
      return apps.map { (pkg, label) -> (totals[pkg] ?: AppUsageWindow(start, week?.start)).toReport(pkg, label) }
        .sortedByDescending { it["ms"] as Long }
}
