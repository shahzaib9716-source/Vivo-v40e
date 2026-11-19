package expo.modules.havendevice

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScheduleWindowTest {
  @Test fun sundayOvernightEndsOnMonday() {
    assertTrue(ScheduleWindow.active(1320, 420, 64, 6, 1320))
    assertTrue(ScheduleWindow.active(1320, 420, 64, 0, 419))
    assertFalse(ScheduleWindow.active(1320, 420, 64, 0, 420))
    assertFalse(ScheduleWindow.active(1320, 420, 64, 0, 1320))
  }

  @Test fun daytimeWindowExcludesEndAndDisabledDays() {
    assertTrue(ScheduleWindow.active(60, 120, 1, 0, 60))
    assertFalse(ScheduleWindow.active(60, 120, 1, 0, 120))
    assertFalse(ScheduleWindow.active(60, 120, 1, 1, 90))
    assertFalse(ScheduleWindow.active(60, 60, 1, 0, 60))
  }
}
