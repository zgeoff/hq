import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const Row = z.object({
  subject: z.string(),
  subject_id: z.string(),
  action: z.string(),
  from_state: z.string().nullable(),
  to_state: z.string().nullable(),
  actor: z.string(),
  data: z.string(),
});

export type EventRow = z.infer<typeof Row>;

export function listEvents(db: Database, action: string): EventRow[] {
  const rows = db.query('SELECT subject, subject_id, action, from_state, to_state, actor, data FROM events WHERE action = ? ORDER BY seq').all(action);
  return z.array(Row).parse(rows);
}
