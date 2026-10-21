import type { Database } from 'bun:sqlite';
import { iso } from './clock/iso.ts';
import { now } from './clock/now.ts';

export function logEvent(
  db: Database,
  subject: 'ask' | 'unblock' | 'hq' | 'run',
  subjectId: string,
  action: string,
  actor: string,
  from: string | null,
  to: string | null,
  data: Record<string, unknown> = {},
): number {
  const r = db
    .query(
      `INSERT INTO events (subject, subject_id, action, from_state, to_state, actor, at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(subject, subjectId, action, from, to, actor, iso(now()), JSON.stringify(data));
  return Number(r.lastInsertRowid);
}
