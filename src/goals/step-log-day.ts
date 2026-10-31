import { toUTCDay } from './to-utc-day.ts';

const DAY = 86_400_000;

export interface LogDay {
  day: string | null;

  // the time of the last dated line, in ms; null after a heading or before any dated line
  last: number | null;
}

// A heading with a date sets the day; a full time on a line sets the day and the time; "- HH:MMZ"
// takes the day of the last dated line or heading, and a time well before the last one rolls to the next day.
export function stepLogDay(state: LogDay, line: string): LogDay {
  let day = state.day;
  let last = state.last;
  const heading = /^#{1,3} .*?(20\d\d-\d\d-\d\d)/u.exec(line);
  if (heading) {
    day = heading[1] ?? null;
    last = null;
  }
  const full = /(20\d\d-\d\d-\d\d)T(\d\d):(\d\d)(?::\d\d)?Z/u.exec(line.slice(0, 40));
  if (full) {
    return { day: full[1] ?? null, last: Date.parse(`${full[1]}T${full[2]}:${full[3]}:00Z`) };
  }
  const time = /^- (\d\d):(\d\d)Z\b/u.exec(line);
  if (time && day) {
    let at = Date.parse(`${day}T${time[1]}:${time[2]}:00Z`);
    if (last !== null && at < last - 6 * 3_600_000) at += DAY;
    return { day: toUTCDay(at), last: at };
  }
  return { day, last };
}
