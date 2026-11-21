package expo.modules.havendevice

import java.io.File

object AppCache {
  data class Result(val bytes: Long = 0, val failures: Int = 0)

  fun inspect(roots: Collection<File>, clear: Boolean, protectedFile: File? = null): Result {
    var bytes = 0L
    var failures = 0
    fun visit(entry: File) {
      if (entry == protectedFile) return
      try {
        val link = entry.canonicalFile != entry.absoluteFile
        if (!link && entry.isDirectory) {
          val children = entry.listFiles()
          if (children == null) { failures++; return }
          children.forEach(::visit)
        } else if (!link && entry.isFile) bytes += entry.length()
        if (clear && entry.exists() && !entry.delete()) failures++
      } catch (_: Exception) { failures++ }
    }
    roots.map { it.canonicalFile }.distinct().forEach { root ->
      if (root.exists()) root.listFiles()?.forEach(::visit) ?: run { failures++ }
    }
    return Result(bytes, failures)
  }
}
