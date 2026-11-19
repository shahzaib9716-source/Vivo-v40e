package expo.modules.havendevice

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

internal class UsageWeek(end: Long, zone: TimeZone = TimeZone.getDefault()) {
  private val midnight = Calendar.getInstance(zone).apply {
    timeInMillis = end
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
    add(Calendar.DATE, -6)
  }
  private val boundaries = LongArray(8) { midnight.timeInMillis.also { midnight.add(Calendar.DATE, 1) } }
  private val totals = LongArray(7)
  private val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = zone }
  val start get() = boundaries.first()

  fun add(from: Long, to: Long) {
    for (i in totals.indices) {
      totals[i] += (minOf(to, boundaries[i + 1]) - maxOf(from, boundaries[i])).coerceAtLeast(0)
    }
  }

  fun days(): List<Map<String, Any>> = totals.indices.filter { totals[it] > 0 }.map { i ->
    mapOf("day" to formatter.format(java.util.Date(boundaries[i])), "ms" to totals[i])
  }
}
