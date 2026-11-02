import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { mondayOf } from '../kinds/monday-of.ts';
import { sydneyUtc } from '../morning/sydney-utc.ts';
import { sydney } from '../morning/sydney.ts';
import type { AnswerWeek } from './types.ts';

export function countAnswerWeeks(db: Database, weeks: number, at: Date = now()): AnswerWeek[] {
  const count = db.query(`SELECT COUNT(*) AS n FROM events WHERE ((subject = 'ask' AND action IN ('answered', 'answered-unopened')) OR (subject = 'unblock' AND action = 'console-review')) AND at >= ? AND at < ?`);
  const out: AnswerWeek[] = [];
  let mon = mondayOf(at);
  for (let i = 0; i < weeks; i++) {
    const day = sydney(mon);
    const from = iso(mon);
    const next = sydneyUtc(day.y, day.mo, day.d + 7);
    const nextOrNow = Math.min(next.getTime(), at.getTime());
    const to = iso(new Date(nextOrNow));
    out.push({ from, to, partial: next.getTime() > at.getTime(), answered: (count.get(from, to) as { n: number }).n });
    mon = sydneyUtc(day.y, day.mo, day.d - 7);
  }
  return out;
}
