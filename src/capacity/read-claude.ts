import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const ROW = z.object({ at: z.string(), account: z.string(), five_hour: z.number().nullable(), seven_day: z.number().nullable(), five_hour_resets_at: z.string().nullable(), seven_day_resets_at: z.string().nullable() }).nullable();

export interface ClaudeUse {
  account: string;
  five: number | null;
  seven: number | null;
  fiveResetsAt: string | null;
  sevenResetsAt: string | null;
  at: string;
}

// The newest usage_samples row (src/goals/sample-usage.ts stores them); older than 30 min is no reading.
export function readClaude(db: Database, at: Date): ClaudeUse {
  const CLAUDE_MAX_AGE_MIN = 30;
  const row = ROW.parse(db.query('SELECT at, account, five_hour, seven_day, five_hour_resets_at, seven_day_resets_at FROM usage_samples ORDER BY at DESC LIMIT 1').get());
  if (row === null) {
    throw new Error('no Claude usage sample yet');
  }
  const age = (at.getTime() - Date.parse(row.at)) / 60_000;
  if (!Number.isFinite(age) || age > CLAUDE_MAX_AGE_MIN) {
    throw new Error(`the newest Claude usage sample is ${Number.isFinite(age) ? Math.round(age) : '?'} min old`);
  }
  return { account: row.account, five: row.five_hour, seven: row.seven_day, fiveResetsAt: row.five_hour_resets_at, sevenResetsAt: row.seven_day_resets_at, at: row.at };
}
