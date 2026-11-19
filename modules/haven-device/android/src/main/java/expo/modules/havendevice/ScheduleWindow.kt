package expo.modules.havendevice

internal object ScheduleWindow {
  fun active(start: Int, end: Int, mask: Int, day: Int, minute: Int): Boolean {
    if (start == end) return false
    fun selected(index: Int) = (mask and (1 shl index)) != 0
    if (start < end) return selected(day) && minute in start until end
    return (selected(day) && minute >= start) || (selected((day + 6) % 7) && minute < end)
  }
}
