import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const Rows = z.array(z.object({ seq: z.number(), action: z.string(), actor: z.string(), at: z.string(), data: z.string() }));

export type StoredEvent = z.infer<typeof Rows>[number];

export function readEvents(db: Database, subject: 'ask' | 'unblock' | 'hq' | 'run', subjectID: string, actions: readonly string[]): StoredEvent[] {
  const rows = db
    .query(`SELECT seq, action, actor, at, data FROM events WHERE subject = ? AND subject_id = ? AND action IN (${actions.map(() => '?').join(', ')}) ORDER BY seq`)
    .all(subject, subjectID, ...actions);
  return Rows.parse(rows);
}
