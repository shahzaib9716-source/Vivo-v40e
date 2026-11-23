package expo.modules.havendevice

internal object CatalogPolicy {
  data class Plan(val blocked: List<String>, val catalogOmitted: Boolean)

  // A full catalog that won't fit must not suppress explicit site rules or SafeSearch.
  fun plan(custom: Set<String>, allowed: Set<String>, catalog: Sequence<String>, max: Int = 1000): Plan {
    val manual = select(custom, allowed, emptySequence(), max)
    return try {
      Plan(select(custom, allowed, catalog, max), false)
    } catch (_: IllegalArgumentException) {
      Plan(manual, true)
    }
  }

  fun select(custom: Set<String>, allowed: Set<String>, catalog: Sequence<String>, max: Int = 1000): List<String> {
    val result = custom.toSortedSet()
    for (host in catalog) if (host !in allowed) result.add(host)
    require(result.size <= max && allowed.size <= max) { "Chrome site list limit exceeded." }
    return result.toList()
  }

  fun enabled(scope: String, incoming: Boolean?, previousScope: String?, previous: Boolean): Boolean =
    incoming ?: (scope.isNotEmpty() && scope == previousScope && previous)
}
