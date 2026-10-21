import type { Database } from 'bun:sqlite';

// The newest usage_samples row (src/goals/sample-usage.ts stores them); older than 30 min is no reading.
export function readClaude(db: Database, at: Date): { account: string; five: number | null; seven: number | null; at: string } {
  const CLAUDE_MAX_AGE_MIN = 30,
    r = db.query('SELECT at, account, five_hour, seven_day FROM usage_samples ORDER BY at DESC LIMIT 1').get() as { at: string; account: string; five_hour: number | null; seven_day: number | null } | null;
  if (!r) throw new Error('no Claude usage sample yet');
  const age = (at.getTime() - Date.parse(r.at)) / 60_000;
  if (!Number.isFinite(age) || age > CLAUDE_MAX_AGE_MIN) throw new Error(`the newest Claude usage sample is ${Number.isFinite(age) ? Math.round(age) : '?'} min old`);
  return { account: r.account, five: r.five_hour, seven: r.seven_day, at: r.at };
}
