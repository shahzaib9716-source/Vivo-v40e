package expo.modules.havendevice

import android.app.admin.DevicePolicyManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeFalse
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CatalogAssetTest {
  private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

  @Test fun packagedCatalogFitsChromeAndHonorsFamilyExceptions() {
    val hosts = context.assets.open("haven/adult-sites.txt").bufferedReader().use { it.readLines() }
    assertTrue(hosts.isNotEmpty() && hosts.all { ChromeSitePolicy.validHost(it) })
    val exception = hosts.first()
    val plan = CatalogPolicy.plan(setOf("manual.example"), setOf(exception), hosts.asSequence())
    assertFalse(plan.catalogOmitted)
    assertFalse(exception in plan.blocked)
    assertTrue("manual.example" in plan.blocked)
    assertEquals((hosts.toSet() - exception + "manual.example").size, plan.blocked.size)
  }

  @Test fun ordinaryInstallCannotApplyManagedWebPolicy() {
    val manager = requireNotNull(context.getSystemService(DevicePolicyManager::class.java))
    assumeFalse(manager.isDeviceOwnerApp(context.packageName))
    assertTrue(ManagedPolicy.update(context, "{}").contains("device-owner enrollment is required"))
  }
}
