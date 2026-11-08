import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { StoredEventSchema } from './stored-event-schema.ts';
import type { StoredEvent } from './stored-event-schema.ts';

export type { StoredEvent } from './stored-event-schema.ts';

const Rows = z.array(StoredEventSchema);

export function readEvents(db: Database, subject: 'ask' | 'unblock' | 'hq' | 'run', subjectID: string, actions: readonly string[]): StoredEvent[] {
  const rows = db
    .query(`SELECT seq, action, actor, at, data FROM events WHERE subject = ? AND subject_id = ? AND action IN (${actions.map(() => '?').join(', ')}) ORDER BY seq`)
    .all(subject, subjectID, ...actions);
  return Rows.parse(rows);
}
