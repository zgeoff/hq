import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { applyNoteSignals } from './apply-note-signals.ts';
import { resolveRun } from './resolve-run.ts';
import type { FinalResolutions, RunNote } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

interface NoteInput {
  label: string | null;
  actor: string;
  resolutions?: FinalResolutions;
}

export function addNote(db: Database, key: string, text: string, input: NoteInput): RunNote {
  const actor = input.actor;
  const label = input.label;
  if (!text.trim()) throw new HqError('bad_args', 'note text must not be empty');
  return db
    .transaction(() => {
      const r = resolveRun(db, key);
      const session = r.issue === key ? null : (db.query('SELECT session_id FROM run_sessions WHERE session_id = ? OR substr(session_id,1,8) = ?').get(key, key) as { session_id: string } | null)?.session_id ?? null;
      const id = Number(
        db.query(`INSERT INTO run_notes (issue, session_id, label, text, source, at) VALUES (?, ?, ?, ?, 'cli', ?)`).run(r.issue, session, label, text, iso(now())).lastInsertRowid,
      );
      applyNoteSignals(db, r.issue, text, { source: `note:${actor}`, note: id, actor, ...(input.resolutions && { resolutions: input.resolutions }) });
      // Until the skill uses --lane: a "lane" note sets the run's lane.
      const lane = text.trim().toLowerCase();
      if (label === 'lane' && /^[a-z][a-z0-9-]{0,39}$/.test(lane)) db.query('UPDATE runs SET lane = ? WHERE issue = ?').run(lane, r.issue);
      touch(db, r.issue);
      return db.query('SELECT * FROM run_notes WHERE id = ?').get(id) as RunNote;
    })
    .immediate();
}
