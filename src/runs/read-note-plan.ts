import type { Database } from 'bun:sqlite';
import { findOpenSession } from './find-open-session.ts';
import { pickNoteIngest } from './pick-note-ingest.ts';
import type { NoteIngest } from './pick-note-ingest.ts';
import { probeStoredNote } from './probe-stored-note.ts';
import type { FeedEvent } from './types.ts';

export function readNotePlan(db: Database, event: FeedEvent): { session: { issue: string; design_pass: number } | null; plan: NoteIngest } {
  const session = findOpenSession(db, event.session);
  return { session, plan: pickNoteIngest({ session, stored: session !== null && probeStoredNote(db, event) }) };
}
