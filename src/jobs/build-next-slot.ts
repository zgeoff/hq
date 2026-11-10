import type { Schedule } from './types.ts';

const DAY_MS = 86_400_000;

// The first slot strictly after `after`, or null when the schedule has none left. A repeating
// `every` schedule keeps to the grid that starts at `anchor`.
export function buildNextSlot(schedule: Schedule, anchor: Date, after: Date): Date | null {
  if (schedule.kind === 'at') {
    return schedule.atMs > after.getTime() ? new Date(schedule.atMs) : null;
  }
  if (schedule.kind === 'every') {
    const elapsed = Math.max(0, after.getTime() - anchor.getTime());
    return new Date(anchor.getTime() + (Math.floor(elapsed / schedule.everyMs) + 1) * schedule.everyMs);
  }
  const dayStart = Math.floor(after.getTime() / DAY_MS) * DAY_MS;
  const today = dayStart + schedule.minuteOfDay * 60_000;
  const slotMs = today > after.getTime() ? today : today + DAY_MS;
  return new Date(slotMs);
}
