const SLOT_READ_INTERVAL_MS = 2 * 3_600_000;

export function isSlotReadDue(newestAt: string | null, at: Date): boolean {
  if (newestAt === null) {
    return true;
  }
  return at.getTime() - Date.parse(newestAt) >= SLOT_READ_INTERVAL_MS;
}
