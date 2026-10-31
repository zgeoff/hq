import { toUTCDay } from './to-utc-day.ts';

const DAY = 86_400_000;

export interface LogDay {
  day: string | null;

  // the time of the last dated line, in ms; null after a heading or before any dated line
  last: number | null;
}

// A heading with a date sets the day, and hq state trim's no-day context line clears it. A full time
// on a line sets the day and the time. "- HH:MMZ" takes the day of the last dated line or heading,
// and a time well before the last one rolls to the next day.
export function stepLogDay(state: LogDay, line: string): LogDay {
  if (line.startsWith('<!-- day context: none -->')) {
    return { day: null, last: null };
  }
  let day = state.day;
  let last = state.last;
  const heading = /^#{1,3} .*?(?<date>20\d\d-\d\d-\d\d)/u.exec(line);
  if (heading?.groups?.['date'] !== undefined) {
    day = heading.groups['date'];
    last = null;
  }
  const full = /(?<date>20\d\d-\d\d-\d\d)T(?<hour>\d\d):(?<minute>\d\d)(?::\d\d)?Z/u.exec(line.slice(0, 40));
  if (full?.groups) {
    const date = full.groups['date'] ?? '';
    return { day: date, last: Date.parse(`${date}T${full.groups['hour']}:${full.groups['minute']}:00Z`) };
  }
  const time = /^- (?<hour>\d\d):(?<minute>\d\d)Z\b/u.exec(line);
  if (time?.groups && day) {
    let at = Date.parse(`${day}T${time.groups['hour']}:${time.groups['minute']}:00Z`);
    if (last !== null && at < last - 6 * 3_600_000) {
      at += DAY;
    }
    return { day: toUTCDay(at), last: at };
  }
  return { day, last };
}
