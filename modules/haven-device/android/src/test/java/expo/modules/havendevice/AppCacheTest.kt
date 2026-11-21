package expo.modules.havendevice

import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AppCacheTest {
  @Test fun clearPreservesActivePreviewAndDoesNotFollowLinks() {
    val temp = Files.createTempDirectory("haven-cache").toFile()
    try {
      val cache = temp.resolve("cache").apply { mkdir() }
      val outside = temp.resolve("private").apply { writeText("account") }
      val preview = cache.resolve("draft").apply { writeText("audio") }
      cache.resolve("old").apply { mkdir() }.resolve("image").writeBytes(ByteArray(200))
      Files.createSymbolicLink(cache.resolve("link").toPath(), outside.toPath())
      assertEquals(200L, AppCache.inspect(listOf(cache), false, preview).bytes)
      assertEquals(0, AppCache.inspect(listOf(cache), true, preview).failures)
      assertTrue(cache.isDirectory)
      assertEquals(listOf(preview), cache.listFiles()!!.toList())
      assertEquals("account", outside.readText())
    } finally { temp.deleteRecursively() }
  }
}
