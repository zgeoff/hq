import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { ISSUE } from './issue.ts';
import type { Followup } from './types.ts';

interface FollowupInput {
  issue: string;
  fromRef: string;
  actor: string;
}

// A follow-up z-review files from a PR's review, recorded when it is filed.
export function addFollowup(db: Database, input: FollowupInput): Followup {
  const issue = input.issue.toUpperCase();
  if (!ISSUE.test(issue)) {
    throw new HqError('bad_args', `"${input.issue}" is not an issue id such as GEO-12`);
  }
  if (!/^[\w.-]+#\d+$/u.test(input.fromRef)) {
    throw new HqError('bad_args', '--from must be repo#n');
  }
  return db
    .transaction(() => {
      if (db.query('SELECT 1 FROM followups WHERE issue = ?').get(issue)) {
        throw new HqError('exists', `${issue} is already counted`);
      }
      const at = iso(now());
      db.query(`INSERT INTO followups (issue, from_ref, filed_at, source, added_by, added_at) VALUES (?, ?, ?, 'review', ?, ?)`).run(issue, input.fromRef, at, input.actor, at);
      logEvent(db, 'hq', `followup:${issue}`, 'recorded', input.actor, null, null, { from: input.fromRef });
      return { issue, from_ref: input.fromRef, filed_at: at, source: 'review', added_by: input.actor, added_at: at } satisfies Followup;
    })
    .immediate();
}
