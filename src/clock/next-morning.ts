import { getSydneyParts } from './get-sydney-parts.ts';
import { quietWindow } from './quiet-window.ts';

export function nextMorning(d: Date): Date {
  const p = getSydneyParts(d);
  const end = quietWindow().end;
  const today = sydneyToUtc(p.year, p.month, p.day, end);
  if (today.getTime() > d.getTime()) {
    return today;
  }

  const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return sydneyToUtc(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), end);
}

// The UTC instant of a Sydney wall-clock time. DST-safe: correct the guess by
// the offset Sydney actually has at that instant, twice.
function sydneyToUtc(year: number, month: number, day: number, hour: number): Date {
  let guess = Date.UTC(year, month - 1, day, hour);
  for (let i = 0; i < 2; i++) {
    const p = getSydneyParts(new Date(guess));
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += Date.UTC(year, month - 1, day, hour) - asUtc;
  }
  return new Date(guess);
}
