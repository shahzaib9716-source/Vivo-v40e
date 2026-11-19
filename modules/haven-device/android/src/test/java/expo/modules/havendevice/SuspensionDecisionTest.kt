package expo.modules.havendevice

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SuspensionDecisionTest {
  @Test fun unavailableUsageStillHonorsDirectRulesAndSchedules() {
    assertTrue(shouldSuspendApp(true, false, false, 60, 15, null, null))
    assertTrue(shouldSuspendApp(false, true, false, 60, 15, null, null))
    assertTrue(shouldSuspendApp(false, false, true, 60, 15, null, null))
    assertFalse(shouldSuspendApp(false, false, false, 60, 15, null, null))
  }

  @Test fun timedRulesApplyAtVerifiedThresholds() {
    assertTrue(shouldSuspendApp(false, false, false, 60, 15, 3600000L, null))
    assertTrue(shouldSuspendApp(false, false, false, 60, 15, 3599999L, 900000L))
    assertFalse(shouldSuspendApp(false, false, false, 60, 15, 3599999L, 899999L))
    assertFalse(shouldSuspendApp(false, false, false, 60, 0, 899999L, 899999L))
  }
}
