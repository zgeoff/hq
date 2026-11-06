import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { pickRunSession } from './pick-run-session.ts';
import { registerRunPR as attachPr } from './register-run-pr.ts';
import { requireOpenRun as mustOpenRun } from './require-open-run.ts';
import type { RunPr } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

interface OwnedPrInput {
  actor: string;
  session: string;
}

// Attaches the PR as hq run pr does, then names the run session that owns it. A PR already on the
// run keeps its attachment and takes the new owner.
export function addOwnedPr(db: Database, issue: string, raw: string, input: OwnedPrInput): RunPr {
  return db
    .transaction(() => {
      mustOpenRun(db, issue);
      const owner = requireRunSession(db, issue, input.session);
      const attached = attachPr(db, issue, raw);
      const pr = attached.pr;
      if (attached.added) {
        touch(db, issue);
        logEvent(db, 'run', issue, 'pr', input.actor, null, null, { ref: pr.ref });
      }
      if (pr.session_id === owner && pr.session_by_hand === 1) {
        return pr;
      }
      db.query('UPDATE run_prs SET session_id = ?, session_by_hand = 1 WHERE ref = ?').run(owner, pr.ref);
      logEvent(db, 'run', issue, 'pr-owner', input.actor, pr.session_id, owner, { ref: pr.ref });
      return { ...pr, session_id: owner, session_by_hand: 1 };
    })
    .immediate();
}

const SessionRows = z.array(z.object({ session_id: z.string() }));

function requireRunSession(db: Database, issue: string, given: string): string {
  const rows = SessionRows.parse(db.query('SELECT session_id FROM run_sessions WHERE issue = ?').all(issue));
  const picked = pickRunSession(
    rows.map((row) => row.session_id),
    given,
  );
  if (picked === null) {
    throw new HqError('bad_args', `--session ${given} names no single session of ${issue}`);
  }
  return picked;
}
