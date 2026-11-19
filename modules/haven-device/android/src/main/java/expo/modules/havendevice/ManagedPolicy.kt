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
    requireNotNull(c.getSystemService(JobScheduler::class.java)).cancel(JOB)
    val saved = prefs(c)
    val held = saved.getStringSet("held", emptySet()).orEmpty()
    if (owner(c) && held.isNotEmpty()) {
      val failed = requireNotNull(c.getSystemService(DevicePolicyManager::class.java)).setPackagesSuspended(admin(c), held.toTypedArray(), false)
      check(failed.isEmpty()) { "Android could not release all managed packages." }
    }
    saved.edit().clear().commit()
  }

  @Synchronized fun update(c: Context, payload: String): String {
    if (!owner(c)) return "Family agreements only. Android device-owner enrollment is required for enforcement."
    prefs(c).edit().putString("policy", payload).commit()
    val job = JobInfo.Builder(JOB, ComponentName(c, PolicyJob::class.java))
      .setPeriodic(15 * 60 * 1000L).setPersisted(true).build()
    val scheduler = requireNotNull(c.getSystemService(JobScheduler::class.java))
    if (scheduler.getPendingJob(JOB) == null) check(scheduler.schedule(job) == JobScheduler.RESULT_SUCCESS)
    return apply(c)
  }

  @Synchronized fun apply(c: Context): String {
    if (!owner(c)) return "Device management unavailable."
    val saved = prefs(c)
    val config = JSONObject(saved.getString("policy", null) ?: return "No policy.")
    val rules = config.getJSONArray("rules")
    val pm = c.packageManager
    val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
    val protected = pm.queryIntentActivities(home, 0).map { it.activityInfo.packageName }.toMutableSet()
    protected.add(c.packageName)
    requireNotNull(c.getSystemService(android.telecom.TelecomManager::class.java)).defaultDialerPackage?.let { protected.add(it) }
    requireNotNull(c.getSystemService(android.view.inputmethod.InputMethodManager::class.java)).enabledInputMethodList.forEach { protected.add(it.packageName) }
    val allowed = requireNotNull(c.getSystemService(AppOpsManager::class.java)).checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.packageName) == AppOpsManager.MODE_ALLOWED
    var screenMs = 0L
    val usage = if (allowed) readUsage(c) { screenMs = it }.associate { it["pkg"] as String to it["ms"] as Long } else emptyMap()
    val desired = mutableSetOf<String>()
    for (i in 0 until rules.length()) {
      val rule = rules.getJSONObject(i)
      val pkg = rule.getString("pkg")
      if (pkg in protected) continue
      val app = try { pm.getApplicationInfo(pkg, 0) } catch (_: android.content.pm.PackageManager.NameNotFoundException) { continue }
      if (app.flags and ApplicationInfo.FLAG_SYSTEM != 0) continue
      val limit = rule.getInt("minutes")
      if ((allowed && screenMs >= config.getInt("dailyMinutes") * 60000L) || config.getBoolean("paused") || rule.getBoolean("blocked") || (allowed && limit > 0 && (usage[pkg] ?: 0L) >= limit * 60000L)) desired.add(pkg)
    }
    val held = saved.getStringSet("held", emptySet()).orEmpty().toMutableSet()
    val manager = requireNotNull(c.getSystemService(DevicePolicyManager::class.java))
    val release = held - desired
    var failed = emptySet<String>()
    if (release.isNotEmpty()) {
      failed = manager.setPackagesSuspended(admin(c), release.toTypedArray(), false).toSet()
      held.removeAll(release - failed)
    }
    if (desired.isNotEmpty()) {
      val rejected = manager.setPackagesSuspended(admin(c), desired.toTypedArray(), true).toSet()
      held.addAll(desired - rejected)
      failed = failed + rejected
    }
    saved.edit().putStringSet("held", held).commit()
    return when {
      failed.isNotEmpty() -> "Android declined changes for " + failed.joinToString()
      !allowed -> "Managed blocks applied. Enable Usage access for timed limits."
      else -> "Managed policy applied. Suspended packages: " + held.size
    }
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
