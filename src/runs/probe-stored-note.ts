import type { Database } from 'bun:sqlite';
import { toNoteTime } from './to-note-time.ts';
import type { FeedEvent } from './types.ts';

// A feed reset replays a note under a new cursor, so only its session, time and text find it again.
export function probeStoredNote(db: Database, event: FeedEvent): boolean {
  return db.query(`SELECT 1 FROM run_notes WHERE session_id = ? AND at = ? AND text = ?`).get(event.session, toNoteTime(event), event.detail ?? null) !== null;
}
