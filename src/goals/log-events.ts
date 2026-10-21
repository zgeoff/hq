import { iso } from '../clock/iso.ts';
import { toUTCDay } from './to-utc-day.ts';

const DAY = 86_400_000;

// DEPLOY and HOLD words, each dated by its line: a full time on the line, else "- HH:MMZ" on the
// day of the last dated line or heading (a time well before the last one rolls to the next day).
// "DEPLOY-START", "MORNING DEPLOY" and "HOLD lifted" are left out.
export function logEvents(texts: string[]): { kind: 'DEPLOY' | 'HOLD'; at: string }[] {
  const out: { kind: 'DEPLOY' | 'HOLD'; at: string }[] = [];
  for (const text of texts) {
    let day: string | null = null;
    let last: number | null = null;
    for (const line of text.split('\n')) {
      const h = /^#{1,3} .*?(20\d\d-\d\d-\d\d)/.exec(line);
      if (h) {
        day = h[1]!;
        last = null;
      }
      const full = /(20\d\d-\d\d-\d\d)T(\d\d):(\d\d)(?::\d\d)?Z/.exec(line.slice(0, 40));
      if (full) {
        last = Date.parse(`${full[1]}T${full[2]}:${full[3]}:00Z`);
        day = full[1]!;
      } else {
        const hm = /^- (\d\d):(\d\d)Z\b/.exec(line);
        if (hm && day) {
          let t = Date.parse(`${day}T${hm[1]}:${hm[2]}:00Z`);
          if (last !== null && t < last - 6 * 3_600_000) t += DAY;
          last = t;
          day = toUTCDay(t);
        }
      }
      if (last === null) continue;
      for (const m of line.matchAll(/(MORNING )?\b(DEPLOY|HOLD)\b(-START| lifted)?/g)) {
        if (m[1] || m[3]) continue;
        out.push({ kind: m[2] as 'DEPLOY' | 'HOLD', at: iso(new Date(last)) });
      }
    }
  }
  return out;
}
