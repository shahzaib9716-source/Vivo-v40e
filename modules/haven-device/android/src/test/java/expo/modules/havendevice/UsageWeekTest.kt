package expo.modules.havendevice

import java.time.Instant
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Test

class UsageWeekTest {
  private fun ms(time: String) = Instant.parse(time).toEpochMilli()

  @Test fun splitsOvernightAtLocalMidnightAndHandlesFallBack() {
    val week = UsageWeek(ms("2026-11-03T12:00:00Z"), TimeZone.getTimeZone("America/New_York"))
    week.add(ms("2026-11-01T03:30:00Z"), ms("2026-11-02T05:30:00Z"))
    assertEquals(listOf(1800000L, 90000000L, 1800000L), week.days().map { it["ms"] })
    assertEquals(listOf("2026-10-31", "2026-11-01", "2026-11-02"), week.days().map { it["day"] })
  }

  @Test fun ignoresIntervalsBeforeHistoryAndLeavesMissingDaysUnreported() {
    val week = UsageWeek(ms("2026-11-10T12:00:00Z"), TimeZone.getTimeZone("UTC"))
    week.add(0, week.start)
    assertEquals(0, week.days().size)
    week.add(week.start - 999, week.start + 1250)
    assertEquals(1250L, week.days().single()["ms"])
  }
}
