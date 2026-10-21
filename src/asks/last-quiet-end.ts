import { nextMorning } from '../clock/next-morning.ts';

// The latest end of quiet hours (07:00 Sydney) at or before d.
// Walks forward morning by morning, so a 23- or 25-hour DST day never skips one.
export function lastQuietEnd(d: Date): Date {
  let best = nextMorning(new Date(d.getTime() - 3 * 86_400_000));
  for (let m = nextMorning(best); m.getTime() <= d.getTime(); m = nextMorning(m)) best = m;
  return best;
}
