import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { z } from 'zod';
import type { SessionInfo } from '../atc/session-schema.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { readEvents } from '../read-events.ts';
import { collectPartSessionWraps } from './collect-part-session-wraps.ts';
import type { PartSessionActivity, PartSessionWrap } from './collect-part-session-wraps.ts';
import { pickPartWrapOutcome } from './pick-part-wrap-outcome.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import { SWEEP_MINUTES as SWEEP } from './sweep-minutes.ts';
import { wrapUpRunSafely } from './wrap-up-merged-runs.ts';

const SessionRows = z.array(z.object({ issue: z.string(), session_id: z.string(), helper: z.number(), active: z.number(), design_pass: z.number(), runState: z.string() }));
const PrRows = z.array(z.object({ issue: z.string(), state: z.string(), session_id: z.string().nullable() }));
const WrappedRows = z.array(z.object({ data: z.string() }));
const WrappedData = z.object({ session: z.string() });

export interface PartSessionWrapOptions {
  actor: string;
}

export interface AtcSnapshot {
  sessions: readonly SessionInfo[];
  activity: ReadonlyMap<string, number | null>;
}

// A part's helper session holds an imp slot once its PRs merge, while its run is still going. The
// wrap-up keeps whatever it keeps for any session, such as unpushed work, and the next sweep retries.
export async function wrapUpPartSessions(
  db: Database,
  deps: WrapUpDeps,
  atc: AtcSnapshot,
  options: PartSessionWrapOptions,
): Promise<string[]> {
  const sessions = SessionRows.parse(
    db
      .query(
        `SELECT s.issue, s.session_id, s.helper, s.active, s.design_pass, r.state AS runState
         FROM run_sessions s JOIN runs r ON r.issue = s.issue ORDER BY s.added_at, s.session_id`,
      )
      .all(),
  );
  const prs = PrRows.parse(db.query('SELECT issue, state, session_id FROM run_prs').all());
  const wrapped = new Set(WrappedRows.parse(db.query("SELECT data FROM events WHERE subject = 'run' AND action = 'part-wrap-up'").all()).map((row) => WrappedData.parse(JSON.parse(row.data)).session));
  const activity = new Map<string, PartSessionActivity>();
  for (const session of sessions) {
    const listed = atc.sessions.find((info) => info.id.toLowerCase().startsWith(session.session_id.toLowerCase()));
    activity.set(session.session_id, { atcState: listed?.state ?? null, lastActivityAt: atc.activity.get(session.session_id) ?? null });
  }
  const due = collectPartSessionWraps({ sessions, prs, activity, wrapped, nowMs: now().getTime(), quietMs: SWEEP.quietMinutes() * 60_000 });
  const done: string[] = [];
  for (const wrap of due) {
    const claim = writePartClaim(db, wrap, options.actor);
    if (claim === null) {
      continue;
    }
    const full = atc.sessions.find((info) => info.id.toLowerCase().startsWith(wrap.session_id.toLowerCase()))?.id ?? wrap.session_id;
    const wrapUp = await wrapUpRunSafely(db, deps, wrap.issue, { actor: options.actor, onlySessions: [full], onlyNoteAction: true });
    match(pickPartWrapOutcome(wrap.session_id, wrapUp))
      .with({ kind: 'done' }, () => done.push(wrap.session_id))
      .with({ kind: 'retry' }, () => removePartClaim(db, claim))
      .exhaustive();
  }
  return done;
}

// A sweep that overlaps this one may have claimed the session since this pass listed it, and its
// wrap-up is still running. The check and the claim are one step.
function writePartClaim(db: Database, wrap: PartSessionWrap, actor: string): number | null {
  return db
    .transaction(() => {
      const claimed = readEvents(db, 'run', wrap.issue, ['part-wrap-up']).some((event) => WrappedData.parse(JSON.parse(event.data)).session === wrap.session_id);
      return claimed ? null : logEvent(db, 'run', wrap.issue, 'part-wrap-up', actor, null, null, { session: wrap.session_id });
    })
    .immediate();
}

// A session that wrap-up kept is retried on the next sweep.
function removePartClaim(db: Database, seq: number): void {
  db.query('DELETE FROM events WHERE seq = ?').run(seq);
}
