import { iso } from './iso.ts';

// Keep any milliseconds the caller gave: a watch that fires at a second boundary would otherwise
// fire up to a second early.
export function toExactISO(date: Date): string {
  return date.getUTCMilliseconds() === 0 ? iso(date) : date.toISOString();
}
