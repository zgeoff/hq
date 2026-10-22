import { sydneyUtc } from './sydney-utc.ts';
import { sydney } from './sydney.ts';
import type { Windows } from './types.ts';
import { TZ } from './tz.ts';

export function windows(at: Date): Windows {
  const s = sydney(at);
  const midnight = sydneyUtc(s.y, s.mo, s.d);
  const yStart = sydney(new Date(midnight.getTime() - 12 * 3_600_000)); // a time on the previous Sydney day
  const day = (x: Date) => new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(x);
  const from = sydneyUtc(yStart.y, yStart.mo, yStart.d);
  return {
    date: s.date,
    yesterday: { from, to: midnight, label: `${day(from)} 00:00–24:00` },
    today: { from: midnight, to: sydneyUtc(s.y, s.mo, s.d, 8, 30), label: `${day(midnight)} 00:00–08:30` },
  };
}
