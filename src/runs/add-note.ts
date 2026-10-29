import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { applyNoteSignals } from './apply-note-signals.ts';
import { findNoteSession } from './find-note-session.ts';
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
      const noted = resolveRun(db, key, 'allow');
      const by = findNoteSession(db, noted.issue, key);
      const session = by?.session_id ?? null;
      const inserted = db.query(`INSERT INTO run_notes (issue, session_id, label, text, source, at) VALUES (?, ?, ?, ?, 'cli', ?)`).run(noted.issue, session, label, text, iso(now()));
      const id = Number(inserted.lastInsertRowid);

      // A late note from the design pass the run turned from stays on the run, but changes nothing on the build.
      if (by?.design_pass !== 1) {
        applyNoteSignals(db, noted.issue, text, { source: `note:${actor}`, note: id, actor, ...(input.resolutions && { resolutions: input.resolutions }) });

        // Until the skill uses --lane: a "lane" note sets the run's lane.
        const lane = text.trim().toLowerCase();
        if (label === 'lane' && /^[a-z][a-z0-9-]{0,39}$/u.test(lane)) {
          db.query('UPDATE runs SET lane = ? WHERE issue = ?').run(lane, noted.issue);
        }
        touch(db, noted.issue);
      }
      return db.query('SELECT * FROM run_notes WHERE id = ?').get(id) as RunNote;
    })
    .immediate();
}
