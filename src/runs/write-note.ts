import type { Database } from 'bun:sqlite';
import { applyNoteSignals } from './apply-note-signals.ts';
import type { NoteIngest } from './pick-note-ingest.ts';
import { toNoteTime } from './to-note-time.ts';
import type { FeedEvent, FinalResolutions } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

interface NoteTarget {
  issue: string;
  epoch: number;
  resolutions: FinalResolutions;
}

// Stores one feed note on a run and, for an 'apply' plan, applies its signals. Returns the PR it marked final, or null.
export function writeNote(db: Database, event: FeedEvent, plan: NoteIngest, target: NoteTarget): { stored: boolean; final: string | null } {
  const inserted = db
    .query(`INSERT INTO run_notes (issue, session_id, label, text, source, event_key, at) VALUES (?, ?, ?, ?, 'atc', ?, ?) ON CONFLICT (event_key) DO NOTHING`)
    .run(target.issue, event.session, event.label ?? null, event.detail, `${target.epoch}:${event.cursor}`, toNoteTime(event));
  if (inserted.changes === 0) {
    return { stored: false, final: null };
  }
  if (plan !== 'apply') {
    return { stored: true, final: null };
  }
  const signals = applyNoteSignals(db, target.issue, event.detail ?? '', {
    source: `atc:${event.session.slice(0, 8)}`,
    note: Number(inserted.lastInsertRowid),
    actor: event.name ?? event.session.slice(0, 8),
    resolutions: target.resolutions,
  });
  touch(db, target.issue);
  return { stored: true, final: signals.final };
}
