import { iso } from './iso.ts';

// A time as hq stores it, to the second, keeping any milliseconds the caller gave: a watch that fires
// at a second boundary would otherwise fire up to a second early.
export function toExactISO(date: Date): string {
  return date.getUTCMilliseconds() === 0 ? iso(date) : date.toISOString();
}
