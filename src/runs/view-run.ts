import type { Database } from 'bun:sqlite';
import type { Run, RunNote, RunPr, RunSession, RunView } from './types.ts';

export function viewRun(db: Database, r: Run): RunView {
  return {
    ...r,
    sessions: db.query('SELECT * FROM run_sessions WHERE issue = ? ORDER BY active DESC, helper, added_at DESC').all(r.issue) as RunSession[],
    prs: db.query('SELECT * FROM run_prs WHERE issue = ? ORDER BY added_at').all(r.issue) as RunPr[],
    lastNote: db.query('SELECT * FROM run_notes WHERE issue = ? ORDER BY id DESC LIMIT 1').get(r.issue) as RunNote | null,
  };
}
