import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { IN_SQL } from '../scope/in-sql.ts';
import type { UmbrellaBox } from './types.ts';

const OUTCOMES = z.enum(['news', 'ticked', 'no_box', 'ambiguous', 'gone']);

const Row = z.object({
  repo: z.string(),
  number: z.number(),
  issue: z.string(),
  merged_at: z.string(),
  outcome: OUTCOMES.nullable(),
  decided_at: z.string().nullable(),
});

export function listUmbrellaBoxes(db: Database, only: 'undecided' | 'all' = 'all'): UmbrellaBox[] {
  const where = only === 'undecided' ? 'AND outcome IS NULL' : '';
  const rows = db.query(`SELECT repo, number, issue, merged_at, outcome, decided_at FROM umbrella_boxes WHERE repo IN ${IN_SQL} ${where} ORDER BY merged_at, repo, number, issue`).all();
  return z.array(Row).parse(rows);
}
