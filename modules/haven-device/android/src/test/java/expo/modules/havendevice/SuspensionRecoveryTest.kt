package expo.modules.havendevice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SuspensionRecoveryTest {
  @Test fun interruptedSuspensionCanBeReleasedAfterRestart() {
    var disk = emptySet<String>()
    assertThrows(IllegalStateException::class.java) {
      reconcileSuspensions(emptySet(), setOf("game"), { disk = it }) { _, _ -> error("interrupted") }
    }
    assertEquals(setOf("game"), disk)
    reconcileSuspensions(disk, emptySet(), { disk = it }) { packages, shouldSuspend ->
      assertEquals(false, shouldSuspend)
      assertEquals(setOf("game"), packages)
      emptySet()
    }
    assertEquals(emptySet<String>(), disk)
  }

  @Test fun retainsFailedReleasesForRetry() {
    val result = reconcileSuspensions(setOf("old"), setOf("new"), {}) { packages, _ -> packages }
    assertEquals(setOf("old"), result.held)
    assertEquals(setOf("old", "new"), result.failed)
  }
}
