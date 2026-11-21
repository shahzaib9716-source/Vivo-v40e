package expo.modules.havendevice

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import org.json.JSONArray

internal object ChromeSitePolicy {
  private const val CHROME = "com.android.chrome"
  private val domain = Regex("""(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59})""")
  fun validHost(host: String) = host.length <= 253 && domain.matches(host)

  fun apply(context: Context, admin: ComponentName, blocked: List<String>, allowed: List<String>, safeSearch: Boolean?): String {
    val prefs = context.getSharedPreferences("haven-chrome-policy", Context.MODE_PRIVATE)
    if (blocked.isEmpty() && allowed.isEmpty() && safeSearch != true && prefs.all.isEmpty()) return "No managed Chrome site rules."
    require(blocked.size <= 1000 && allowed.size <= 1000)
    val manager = requireNotNull(context.getSystemService(DevicePolicyManager::class.java))
    val policy = Bundle(manager.getApplicationRestrictions(admin, CHROME))
    val desired = mapOf("URLBlocklist" to blocked, "URLAllowlist" to allowed)
    val journal = prefs.edit()
    var changed = false
    var conflict = false
    for ((key, hosts) in desired) {
      val previous = prefs.getString(key, null)
      val next = if (hosts.isEmpty()) null else JSONArray(hosts).toString()
      val actual = policy.getString(key)
      if (policy.containsKey(key) && (actual == null || actual != previous)) {
        conflict = true
        continue
      }
      if (actual != next) {
        if (next == null) policy.remove(key) else policy.putString(key, next)
        changed = true
      }
      if (next == null) journal.remove(key) else journal.putString(key, next)
    }
    val searchKey = "ForceGoogleSafeSearch"
    if (safeSearch != null) {
      val owned = prefs.getBoolean(searchKey, false)
      if (policy.containsKey(searchKey) && (!owned || !policy.getBoolean(searchKey))) {
        conflict = true
      } else if (safeSearch) {
        if (!policy.getBoolean(searchKey)) {
          policy.putBoolean(searchKey, true)
          changed = true
        }
        journal.putBoolean(searchKey, true)
      } else if (owned) {
        policy.remove(searchKey)
        journal.remove(searchKey)
        changed = true
      }
    }
    if (changed) manager.setApplicationRestrictions(admin, CHROME, policy)
    check(journal.commit())
    return if (conflict) "Chrome already has a separately configured site policy."
      else "Chrome site policy configured: ${blocked.size} blocked, ${allowed.size} exceptions."
  }
}
