package expo.modules.havendevice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class AppUsageWindowTest {
  @Test fun clipsIntervalsToDailyAndWeeklyBoundaries() {
    val usage = AppUsageWindow(today = 1000, firstDay = 100)
    usage.add(50, 150)
    usage.add(900, 1100)
    usage.add(1200, 1300)
    assertEquals(200L, usage.dailyMs)
    assertEquals(350L, usage.weeklyMs)
    assertEquals(1300L, usage.lastUsedAt)
  }

  @Test fun missingHistoryAndDailyOnlyChecksOmitWeeklyTotals() {
    val report = AppUsageWindow(today = 1000, firstDay = null)
    report.add(200, 300)
    report.add(1300, 1200)
    val actual = report.toReport("app.example", "Example")
    assertEquals(0L, actual["ms"])
    assertFalse(actual.containsKey("weeklyMs"))
    assertFalse(actual.containsKey("lastUsedAt"))
  }
}
