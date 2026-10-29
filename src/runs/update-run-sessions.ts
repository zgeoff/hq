import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';

export function updateRunSessions(db: Database, issue: string, session: string, helper = false): void {
  if (!/^[0-9a-f-]{8,}$/i.test(session)) throw new HqError('bad_args', `session "${session}" must be an atc session id`);
  const other = db.query('SELECT issue FROM run_sessions WHERE session_id = ?').get(session) as { issue: string } | null;
  if (other && other.issue !== issue) throw new HqError('session_taken', `session ${session} is on ${other.issue}`);
  const t = iso(now());
  // --add on the active main session keeps it main: never demote by accident.
  const cur = db.query('SELECT active, helper FROM run_sessions WHERE session_id = ?').get(session) as { active: number; helper: number } | null;
  if (helper && cur?.active === 1 && cur.helper === 0) return;
  // A new main session replaces the old main one; helpers stay.
  if (!helper) {
    db.query('UPDATE run_sessions SET active = 0, ended_at = COALESCE(ended_at, ?) WHERE issue = ? AND active = 1 AND helper = 0 AND session_id != ?').run(t, issue, session);
  }
  db.query(
    `INSERT INTO run_sessions (session_id, issue, active, helper, added_at) VALUES (?, ?, 1, ?, ?)
     ON CONFLICT (session_id) DO UPDATE SET active = 1, helper = excluded.helper, ended_at = NULL, ended_by = NULL, design_pass = 0`,
  ).run(session, issue, helper ? 1 : 0, t);
}
