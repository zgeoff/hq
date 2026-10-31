import { iso } from '../clock/iso.ts';
import { stepLogDay } from './step-log-day.ts';
import type { LogDay } from './step-log-day.ts';

// DEPLOY and HOLD words, each dated by its line: a full time on the line, else "- HH:MMZ" on the
// day of the last dated line or heading (a time well before the last one rolls to the next day).
// "DEPLOY-START", "MORNING DEPLOY" and "HOLD lifted" are left out.
export function logEvents(texts: string[]): { kind: 'DEPLOY' | 'HOLD'; at: string }[] {
  const out: { kind: 'DEPLOY' | 'HOLD'; at: string }[] = [];
  for (const text of texts) {
    let state: LogDay = { day: null, last: null };
    for (const line of text.split('\n')) {
      state = stepLogDay(state, line);
      const last = state.last;
      if (last === null) continue;
      for (const m of line.matchAll(/(MORNING )?\b(DEPLOY|HOLD)\b(-START| lifted)?/g)) {
        if (m[1] || m[3]) continue;
        out.push({ kind: m[2] as 'DEPLOY' | 'HOLD', at: iso(new Date(last)) });
      }
    }
  }
  return out;
}
