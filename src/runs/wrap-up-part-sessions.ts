import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { z } from 'zod';
import type { SessionInfo } from '../atc/session-schema.ts';
import { logEvent } from '../log-event.ts';
import { readEvents } from '../read-events.ts';
import { collectGuardedSessions } from './collect-guarded-sessions.ts';
import { collectPartSessionWraps } from './collect-part-session-wraps.ts';
import type { PartSessionActivity, PartSessionWrap } from './collect-part-session-wraps.ts';
import { pickPartWrapOutcome } from './pick-part-wrap-outcome.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import { wrapUpRunSafely } from './wrap-up-merged-runs.ts';

const SessionRows = z.array(z.object({ issue: z.string(), session_id: z.string(), helper: z.number(), active: z.number(), design_pass: z.number(), runState: z.string() }));
const PrRows = z.array(z.object({ issue: z.string(), state: z.string(), session_id: z.string().nullable() }));
const WrappedRows = z.array(z.object({ data: z.string() }));
const WrappedData = z.object({ session: z.string() });

export interface PartSessionWrapOptions {
  actor: string;
  log: (line: string) => void;
  nowMs: number;
  quietMs: number;
}

export interface AtcSnapshot {
  sessions: readonly SessionInfo[];
  activity: ReadonlyMap<string, number | null>;
}

// A part's helper session holds an imp slot once its PRs merge, while its run is still going. A
// retry that changes nothing writes no note, so what the wrap-up keeps or fails to forget goes to
// the sweep log, and the next sweep retries.
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
  const due = collectPartSessionWraps({ sessions, prs, activity, wrapped, nowMs: options.nowMs, quietMs: options.quietMs });
  const done: string[] = [];
  for (const wrap of due) {
    const claim = writePartClaim(db, wrap, options.actor);
    if (claim === null) {
      continue;
    }

    // The wrap-up skips a sub-session left off this list before its pin check, so the list carries
    // the helper's whole tree.
    const tree = collectGuardedSessions([{ issue: wrap.issue, session_id: wrap.session_id, active: 1 }], atc.sessions) ?? [];
    const wrapUp = await wrapUpRunSafely(db, deps, wrap.issue, { actor: options.actor, onlySessions: tree.map((session) => session.id), onlyNoteAction: true });
    for (const kept of wrapUp.kept) {
      options.log(`part-session wrap-up of ${wrap.session_id} on ${wrap.issue} kept ${kept.id}: ${kept.reason}`);
    }
    for (const failure of wrapUp.failed) {
      options.log(`part-session wrap-up of ${wrap.session_id} on ${wrap.issue} failed: ${failure.id}: ${failure.reason}`);
    }
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
