package expo.modules.havendevice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogPolicyTest {
  @Test fun combinesDistinctHostsPreservingCustomRulesAndExceptions() {
    val selected = CatalogPolicy.select(setOf("z.test", "custom.test"), setOf("allow.test"),
      sequenceOf("z.test", "allow.test", "catalog.test", "catalog.test"), 3)
    assertEquals(listOf("catalog.test", "custom.test", "z.test"), selected)
  }

  @Test fun optOutLeavesOnlyExplicitBlocks() {
    assertEquals(listOf("custom.test"), CatalogPolicy.select(setOf("custom.test"), emptySet(), emptySequence()))
  }

  @Test fun refusesAnOversizedPolicyRatherThanDroppingRules() {
    assertThrows(IllegalArgumentException::class.java) {
      CatalogPolicy.select(setOf("a.test", "b.test"), emptySet(), sequenceOf("c.test"), 2)
    }
  }

  @Test fun retainOnlyConfirmedPreferenceForTheSameEnrollment() {
    assertTrue(CatalogPolicy.enabled("a/b", true, null, false))
    assertTrue(CatalogPolicy.enabled("a/b", null, "a/b", true))
    assertFalse(CatalogPolicy.enabled("a/b", false, "a/b", true))
    assertFalse(CatalogPolicy.enabled("a/c", null, "a/b", true))
    assertFalse(CatalogPolicy.enabled("", null, "", true))
  }

  @Test fun catalogOverflowDoesNotHoldManualPolicyHostage() {
    val plan = CatalogPolicy.plan(setOf("manual.test"), emptySet(), sequenceOf("a.test", "b.test"), 2)
    assertEquals(listOf("manual.test"), plan.blocked)
    assertTrue(plan.catalogOmitted)
    assertFalse(CatalogPolicy.plan(emptySet(), emptySet(), sequenceOf("a.test"), 1).catalogOmitted)
  }
}
