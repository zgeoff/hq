import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const TOTAL = z.object({ total: z.number() });

export function countGrantActions(db: Database, name: string): number {
  return TOTAL.parse(db.query('SELECT COUNT(*) AS total FROM grant_actions WHERE grant_name = ?').get(name)).total;
}
