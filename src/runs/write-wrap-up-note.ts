import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { formatWrapUp } from './format-wrap-up.ts';
import type { WrapUp } from './types.ts';

// The note goes in directly, not through the note command, so its text never reads as a PR or a
// FINAL mark.
export function writeWrapUpNote(db: Database, issue: string, wrapUp: WrapUp, actor: string): void {
  db.transaction(() => {
    db.query(`INSERT INTO run_notes (issue, session_id, label, text, source, at) VALUES (?, NULL, 'wrap-up', ?, 'cli', ?)`).run(issue, formatWrapUp(wrapUp), iso(now()));
    logEvent(db, 'run', issue, 'wrap-up', actor, null, null, { ...wrapUp });
  }).immediate();
}
