import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import type { RunState } from '../transitions/run-states.ts';
import { checkRun } from '../transitions/check-run.ts';
import { CLOSED_RUN_STATES as CLOSED } from '../transitions/closed-run-states.ts';
import { RUN_STATES } from '../transitions/run-states.ts';
import { getRun } from './get-run.ts';
import { requireLiveCheck as checkLiveCheck } from './require-live-check.ts';
import { requireRun as mustRun } from './require-run.ts';
import type { LiveCheck, RunView } from './types.ts';
import { viewRun } from './view-run.ts';

// waitsOnGeoff marks the wait as the owner's, exactly; left out, it stays as it was, and a new
// waits-on text clears it unless given again.
export function setState(db: Database, issue: string, state: string, opts: { next?: string; waitsOn?: string | null; waitsOnGeoff?: boolean; note?: string | null; reopen?: boolean; liveCheck?: LiveCheck }, actor: string): RunView {
  if (opts.liveCheck !== undefined) checkLiveCheck(opts.liveCheck);
  if (!RUN_STATES.includes(state as RunState)) throw new HqError('bad_args', `state must be one of ${RUN_STATES.join(', ')}`);
  return db
    .transaction(() => {
      const prev = mustRun(db, issue);
      checkRun(issue, opts.reopen && CLOSED.includes(prev.state) ? 'reopen' : 'state', prev.state, state as RunState);
      const t = iso(now());
      const closing = CLOSED.includes(state as RunState);
      db.query(
        `UPDATE runs SET state = ?, next = COALESCE(?, next), waits_on = ?, waits_on_geoff = ?, close_note = ?, closed_at = ?, live_check = ?, updated_at = ? WHERE issue = ?`,
      ).run(
        state,
        opts.next ?? null,
        opts.waitsOn === undefined ? prev.waits_on : opts.waitsOn,
        closing ? 0 : opts.waitsOnGeoff !== undefined ? (opts.waitsOnGeoff ? 1 : 0) : opts.waitsOn !== undefined ? 0 : prev.waits_on_geoff,
        closing ? (opts.note ?? null) : prev.close_note,
        closing ? t : null,
        opts.liveCheck ?? prev.live_check,
        t,
        issue,
      );
      if (closing) {
        db.query('UPDATE run_sessions SET active = 0, ended_at = COALESCE(ended_at, ?) WHERE issue = ? AND active = 1').run(t, issue);
      }
      // The flag goes in the event only when given, so stats can tell exact from guessed.
      logEvent(db, 'run', issue, 'state', actor, prev.state, state, { next: opts.next, waitsOn: opts.waitsOn, waitsOnGeoff: opts.waitsOnGeoff, note: opts.note, liveCheck: opts.liveCheck });
      return viewRun(db, getRun(db, issue)!);
    })
    .immediate();
}
