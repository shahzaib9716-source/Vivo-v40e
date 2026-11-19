package expo.modules.havendevice

internal fun shouldSuspendApp(
  blocked: Boolean,
  paused: Boolean,
  scheduled: Boolean,
  dailyMinutes: Int,
  appMinutes: Int,
  screenMs: Long?,
  appMs: Long?
): Boolean {
  if (blocked || paused || scheduled) return true
  if (screenMs != null && screenMs >= dailyMinutes * 60000L) return true
  return appMinutes > 0 && appMs != null && appMs >= appMinutes * 60000L
}
