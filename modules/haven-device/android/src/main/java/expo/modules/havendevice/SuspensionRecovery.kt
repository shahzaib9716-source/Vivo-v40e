package expo.modules.havendevice

internal data class SuspensionResult(val held: Set<String>, val failed: Set<String>)

internal fun reconcileSuspensions(
  held: Set<String>,
  desired: Set<String>,
  persist: (Set<String>) -> Unit,
  change: (Set<String>, Boolean) -> Set<String>
): SuspensionResult {
  // Android can commit a suspension just before the process dies.
  // Record every package that might need releasing before calling Android.
  persist(held + desired)
  val release = held - desired
  val failedRelease = if (release.isEmpty()) emptySet() else change(release, false)
  val failedSuspend = if (desired.isEmpty()) emptySet() else change(desired, true)
  val confirmed = failedRelease + (desired - failedSuspend)
  persist(confirmed)
  return SuspensionResult(confirmed, failedRelease + failedSuspend)
}
