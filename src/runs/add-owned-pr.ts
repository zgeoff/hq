import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { normalizePRRef } from './normalize-pr-ref.ts';
import { pickOwnedPRWrites } from './pick-owned-pr-writes.ts';
import { registerRunPR as attachPR } from './register-run-pr.ts';
import { requireOpenRun as mustOpenRun } from './require-open-run.ts';
import type { RunPR } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

interface OwnedPROptions {
  actor: string;
  session: string;
}

const SessionRows = z.array(z.object({ session_id: z.string() }));
const ExistingRow = z.object({ session_id: z.string().nullable(), session_by_hand: z.number() }).nullable();

// Attaches the PR as hq run pr does, then names the run session that owns it.
export function addOwnedPR(db: Database, issue: string, raw: string, options: OwnedPROptions): RunPR {
  return db
    .transaction(() => {
      mustOpenRun(db, issue);
      const sessionIDs = SessionRows.parse(db.query('SELECT session_id FROM run_sessions WHERE issue = ?').all(issue)).map((row) => row.session_id);
      const existing = ExistingRow.parse(db.query('SELECT session_id, session_by_hand FROM run_prs WHERE ref = ?').get(normalizePRRef(raw).ref));
      const writes = pickOwnedPRWrites({ existing, sessionIDs, given: options.session });
      return match(writes)
        .with({ kind: 'no-session' }, () => {
          throw new HqError('bad_args', `--session ${options.session} names no single session of ${issue}`);
        })
        .with({ kind: 'write' }, (write) => {
          const pr = attachPR(db, issue, raw).pr;
          if (write.attached) {
            touch(db, issue);
            logEvent(db, 'run', issue, 'pr', options.actor, null, null, { ref: pr.ref });
          }
          if (!write.ownerChanged) {
            return pr;
          }
          db.query('UPDATE run_prs SET session_id = ?, session_by_hand = 1 WHERE ref = ?').run(write.owner, pr.ref);
          logEvent(db, 'run', issue, 'pr-owner', options.actor, write.previousOwner, write.owner, { ref: pr.ref });
          return { ...pr, session_id: write.owner, session_by_hand: 1 };
        })
        .exhaustive();
    })
    .immediate();
}
