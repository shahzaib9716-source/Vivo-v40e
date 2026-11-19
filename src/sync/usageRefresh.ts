export async function refreshUsage<T>(active: () => boolean, read: () => Promise<T>, publish: (report: T) => Promise<void>) {
  if (!active()) return false;
  const report = await read();
  if (!active()) return false;
  await publish(report);
  return true;
}
