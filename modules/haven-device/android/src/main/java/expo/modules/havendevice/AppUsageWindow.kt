package expo.modules.havendevice

internal class AppUsageWindow(private val today: Long, private val firstDay: Long?) {
  var dailyMs: Long = 0
    private set
  var weeklyMs: Long = 0
    private set
  var lastUsedAt: Long? = null
    private set

  fun add(start: Long, end: Long) {
    if (end <= start) return
    dailyMs += (end - maxOf(today, start)).coerceAtLeast(0L)
    if (firstDay != null) weeklyMs += (end - maxOf(firstDay, start)).coerceAtLeast(0L)
    if (end > (firstDay ?: today)) lastUsedAt = maxOf(lastUsedAt ?: 0L, end)
  }

  fun toReport(pkg: String, label: String): Map<String, Any> = buildMap {
    put("pkg", pkg)
    put("label", label)
    put("ms", dailyMs)
    if (weeklyMs > 0) put("weeklyMs", weeklyMs)
    lastUsedAt?.let { put("lastUsedAt", it) }
  }
}
