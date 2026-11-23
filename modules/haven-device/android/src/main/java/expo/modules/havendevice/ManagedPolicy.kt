package expo.modules.havendevice

import android.app.AppOpsManager
import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.app.job.*
import android.content.*
import android.content.pm.ApplicationInfo
import android.os.Process
import org.json.JSONObject

class HavenAdmin : DeviceAdminReceiver()

object ManagedPolicy {
  private const val JOB = 482611
  private fun prefs(c: Context) = c.getSharedPreferences("haven-managed-policy", Context.MODE_PRIVATE)
  private fun admin(c: Context) = ComponentName(c, HavenAdmin::class.java)
  private fun owner(c: Context) = requireNotNull(c.getSystemService(DevicePolicyManager::class.java)).isDeviceOwnerApp(c.packageName)

  @Synchronized fun clear(c: Context) {
    val saved = prefs(c)
    check(saved.edit().remove("policy").commit()) { "Could not record policy removal." }
    val held = saved.getStringSet("held", emptySet()).orEmpty()
    if (owner(c) && held.isNotEmpty()) {
      val failed = requireNotNull(c.getSystemService(DevicePolicyManager::class.java)).setPackagesSuspended(admin(c), held.toTypedArray(), false)
      check(saved.edit().putStringSet("held", failed.toSet()).commit())
      check(failed.isEmpty()) { "Android could not release all managed packages." }
    }
    if (owner(c)) ChromeSitePolicy.apply(c, admin(c), emptyList(), emptyList(), false)
    check(saved.edit().clear().commit())
    requireNotNull(c.getSystemService(JobScheduler::class.java)).cancel(JOB)
  }

  @Synchronized fun update(c: Context, payload: String): String {
    if (!owner(c)) return "Family agreements only. Android device-owner enrollment is required for enforcement."
    val saved = prefs(c)
    val next = JSONObject(payload)
    val previous = if (next.has("adultSites")) null else saved.getString("policy", null)?.let {
      try { JSONObject(it) } catch (_: org.json.JSONException) { null }
    }
    // A listener still loading after reconnect is not a parent's opt-out.
    next.put("adultSites", CatalogPolicy.enabled(next.optString("scope"), next.opt("adultSites") as? Boolean,
      previous?.optString("scope"), previous?.optBoolean("adultSites") == true))
    check(saved.edit().putString("policy", next.toString()).commit())
    val job = JobInfo.Builder(JOB, ComponentName(c, PolicyJob::class.java))
      .setPeriodic(15 * 60 * 1000L).setPersisted(true).build()
    val scheduler = requireNotNull(c.getSystemService(JobScheduler::class.java))
    if (scheduler.getPendingJob(JOB) == null) check(scheduler.schedule(job) == JobScheduler.RESULT_SUCCESS)
    return apply(c)
  }

  @Synchronized fun apply(c: Context): String {
    if (!owner(c)) return "Device management unavailable."
    val saved = prefs(c)
    val payload = saved.getString("policy", null)
    if (payload == null) {
      clear(c)
      return "Policy released."
    }
    val config = JSONObject(payload)
    val rules = config.getJSONArray("rules")
    val pm = c.packageManager
    val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
    val protected = pm.queryIntentActivities(home, 0).map { it.activityInfo.packageName }.toMutableSet()
    protected.add(c.packageName)
    if (c.packageName == "com.haven.familysafety.child") protected.add("com.haven.familysafety.parent")
    requireNotNull(c.getSystemService(android.telecom.TelecomManager::class.java)).defaultDialerPackage?.let { protected.add(it) }
    requireNotNull(c.getSystemService(android.view.inputmethod.InputMethodManager::class.java)).enabledInputMethodList.forEach { protected.add(it.packageName) }
    val allowed = requireNotNull(c.getSystemService(AppOpsManager::class.java)).checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.packageName) == AppOpsManager.MODE_ALLOWED
    var screenMs = 0L
    val usage = if (allowed) {
      try {
        readUsage(c) { screenMs = it }.associate { it["pkg"] as String to it["ms"] as Long }
      } catch (_: IllegalStateException) {
        null
      } catch (_: SecurityException) {
        null
      }
    } else null
    val now = java.util.Calendar.getInstance()
    val mondayBasedDay = (now.get(java.util.Calendar.DAY_OF_WEEK) + 5) % 7
    val minute = now.get(java.util.Calendar.HOUR_OF_DAY) * 60 + now.get(java.util.Calendar.MINUTE)
    val windows = config.optJSONArray("windows")
    val scheduled = windows != null && (0 until windows.length()).any { index ->
      val window = windows.getJSONObject(index)
      ScheduleWindow.active(window.getInt("start"), window.getInt("end"), window.getInt("mask"), mondayBasedDay, minute)
    }
    val desired = mutableSetOf<String>()
    var ineligible = 0
    for (i in 0 until rules.length()) {
      val rule = rules.getJSONObject(i)
      val pkg = rule.getString("pkg")
      val app = try { pm.getApplicationInfo(pkg, 0) } catch (_: android.content.pm.PackageManager.NameNotFoundException) { null }
      if (pkg in protected || app == null || app.flags and ApplicationInfo.FLAG_SYSTEM != 0) {
        ineligible++
        continue
      }
      val limit = rule.getInt("minutes")
      if (shouldSuspendApp(
        blocked = rule.getBoolean("blocked"),
        paused = config.getBoolean("paused"),
        scheduled = scheduled,
        dailyMinutes = config.getInt("dailyMinutes"),
        appMinutes = limit,
        screenMs = if (usage != null) screenMs else null,
        appMs = usage?.get(pkg)
      )) desired.add(pkg)
    }
    val held = saved.getStringSet("held", emptySet()).orEmpty().toMutableSet()
    val manager = requireNotNull(c.getSystemService(DevicePolicyManager::class.java))
    val result = reconcileSuspensions(held, desired,
      persist = { packages -> check(saved.edit().putStringSet("held", packages).commit()) },
      change = { packages, shouldSuspend -> manager.setPackagesSuspended(admin(c), packages.toTypedArray(), shouldSuspend).toSet() })
    val sites = config.optJSONArray("sites")
    val webStatus = if (sites != null) {
      val blocked = mutableSetOf<String>()
      val exceptions = mutableSetOf<String>()
      for (i in 0 until sites.length()) {
        val site = sites.optJSONObject(i) ?: continue
        val host = site.optString("host")
        if (!ChromeSitePolicy.validHost(host)) continue
        when (site.optString("list")) {
          "blocked" -> blocked.add(host)
          "allowed" -> exceptions.add(host)
        }
      }
      try {
        val manual = CatalogPolicy.select(blocked, exceptions, emptySequence())
        val plan = if (config.optBoolean("adultSites")) {
          try {
            c.assets.open("haven/adult-sites.txt").bufferedReader().useLines { lines ->
              CatalogPolicy.plan(blocked, exceptions, lines.map { line ->
                line.trim().also { require(ChromeSitePolicy.validHost(it)) { "Invalid bundled domain." } }
              })
            }
          } catch (_: java.io.IOException) { CatalogPolicy.Plan(manual, true) }
        } else CatalogPolicy.Plan(manual, false)
        val result = ChromeSitePolicy.apply(c, admin(c), plan.blocked, exceptions.sorted(), if (config.has("safeSearch")) config.getBoolean("safeSearch") else null)
        if (plan.catalogOmitted) "Adult-site catalog omitted (size or asset error). $result" else result
      } catch (_: IllegalArgumentException) {
        "Chrome site rules could not be applied. Check the 1,000-entry Chrome list limits."
      } catch (_: Exception) {
        "Chrome site rules could not be applied."
      }
    } else null
    val failed = result.failed
    return buildList {
      add("Suspended packages: " + result.held.size + ".")
      if (webStatus != null) add(webStatus)
      if (failed.isNotEmpty()) add("Android declined changes for " + failed.size + " packages.")
      if (ineligible > 0) add("Ineligible or unavailable packages: " + ineligible + ".")
      if (!allowed) add("Timed limits require Usage Access.")
      else if (usage == null) add("Timed limits could not be checked. Unlock the device and check Usage Access.")
    }.joinToString(" ")
  }
}

class PolicyJob : JobService() {
  override fun onStartJob(params: JobParameters): Boolean {
    Thread {
      val retry = runCatching { ManagedPolicy.apply(this) }.isFailure
      jobFinished(params, retry)
    }.start()
    return true
  }
  override fun onStopJob(params: JobParameters) = true
}
