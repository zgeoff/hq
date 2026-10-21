import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { ISSUE } from './issue.ts';
import type { Followup } from './types.ts';

// The baseline, counted by hand from Linear: an issue whose description names the PR review it
// came from, at the time Linear says it was created.
export function addBackfill(db: Database, input: { issue: string; fromRef: string | null; at: string; actor: string }): Followup {
  const issue = input.issue.toUpperCase();
  if (!ISSUE.test(issue)) throw new HqError('bad_args', `"${input.issue}" is not an issue id such as GEO-12`);
  if (input.fromRef !== null && !/^[\w.-]+#\d+$/.test(input.fromRef)) throw new HqError('bad_args', '--from must be repo#n');
  const at = new Date(input.at);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(input.at) || Number.isNaN(at.getTime())) throw new HqError('bad_args', '--at must be a time, such as 2026-10-08T03:00:00Z');
  if (at.getTime() > now().getTime() + 60_000) throw new HqError('bad_args', '--at is in the future');
  return db
    .transaction(() => {
      if (db.query('SELECT 1 FROM followups WHERE issue = ?').get(issue)) throw new HqError('exists', `${issue} is already counted`);
      const t = iso(now());
      db.query(`INSERT INTO followups (issue, from_ref, filed_at, source, added_by, added_at) VALUES (?, ?, ?, 'linear backfill', ?, ?)`).run(issue, input.fromRef, iso(at), input.actor, t);
      logEvent(db, 'hq', `followup:${issue}`, 'backfilled', input.actor, null, null, { from: input.fromRef, at: iso(at) });
      return db.query('SELECT * FROM followups WHERE issue = ?').get(issue) as Followup;
    })
    .immediate();
}
