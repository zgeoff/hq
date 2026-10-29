import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { removeLaneNudges } from '../lanes/remove-lane-nudges.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { CLOSED_RUN_STATES as CLOSED } from '../transitions/closed-run-states.ts';
import { getRun } from './get-run.ts';
import type { AddRunInput, RunView } from './types.ts';
import { updateRunSessions as attachSession } from './update-run-sessions.ts';
import { viewRun } from './view-run.ts';

export function addRun(db: Database, input: AddRunInput): { run: RunView; result: 'added' | 'noop' } {
  const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  if (!SLUG.test(input.issue)) throw new HqError('bad_args', `issue "${input.issue}" must be a slug like GEO-123`);
  if (!input.title.trim()) throw new HqError('bad_args', 'title must not be empty');
  if (input.readySince && Number.isNaN(Date.parse(input.readySince))) throw new HqError('bad_args', '--ready-since must be a time, such as 2026-10-15T07:00:00Z');
  return db
    .transaction(() => {
      const prev = getRun(db, input.issue);
      if (prev && !CLOSED.includes(prev.state)) return { run: viewRun(db, prev), result: 'noop' as const };
      if (prev) throw new HqError('bad_state', `${input.issue} is ${prev.state}: hq run reopen ${input.issue}`);
      const t = iso(now());
      db.query(
        `INSERT INTO runs (issue, title, place, state, next, gate, geoff_chat, ready_since, size, size_lines, lane, created_at, updated_at)
         VALUES (?, ?, ?, 'working', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(input.issue, input.title, input.place, input.next, input.gate, input.geoffChat ? 1 : 0, input.readySince ? iso(new Date(input.readySince)) : null, input.size?.size ?? null, input.size?.lines ?? null, input.lane ?? (input.place === 'local' ? 'flexible' : null), t, t);
      if (input.session) attachSession(db, input.issue, input.session);
      logEvent(db, 'run', input.issue, 'added', input.actor, null, 'working', { title: input.title, session: input.session, readySince: input.readySince ?? null, size: input.size ?? null });

      // A queued lanes nudge was planned before this run held its slot, so it may name this issue; the next look plans again.
      removeLaneNudges(db);
      return { run: viewRun(db, getRun(db, input.issue)!), result: 'added' as const };
    })
    .immediate();
}
