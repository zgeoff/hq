import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { z } from 'zod';
import type { SessionInfo } from '../atc/session-schema.ts';
import { logEvent } from '../log-event.ts';
import { readEvents } from '../read-events.ts';
import { collectGuardedSessions } from './collect-guarded-sessions.ts';
import { collectPartSessionWraps } from './collect-part-session-wraps.ts';
import { collectWrappedPartSessions } from './collect-wrapped-part-sessions.ts';
import type { PartWrapEvent } from './collect-wrapped-part-sessions.ts';
import type { PartSessionActivity, PartSessionWrap } from './collect-part-session-wraps.ts';
import { pickPartWrapLog } from './pick-part-wrap-log.ts';
import { pickPartWrapOutcome } from './pick-part-wrap-outcome.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import { wrapUpRunSafely } from './wrap-up-merged-runs.ts';

const SessionRows = z.array(z.object({ issue: z.string(), session_id: z.string(), helper: z.number(), active: z.number(), design_pass: z.number(), runState: z.string() }));
const PrRows = z.array(z.object({ issue: z.string(), state: z.string(), session_id: z.string().nullable() }));
const WrapEventRows = z.array(z.object({ action: z.string(), at: z.string(), data: z.string() }));

// Sweeps run every 5 minutes by default, and a wrap-up ends within one; a claim that outlives six
// sweeps with no done event belongs to a sweep that died.
const PART_CLAIM_ABANDONED_MS = 30 * 60_000;

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
  const events = WrapEventRows.parse(db.query("SELECT action, at, data FROM events WHERE subject = 'run' AND action IN ('part-wrap-up', 'part-wrap-up-done')").all());
  const wrapped = collectWrappedPartSessions(events.map((row) => toPartWrapEvent(row)), options.nowMs, PART_CLAIM_ABANDONED_MS);
  const activity = new Map<string, PartSessionActivity>();
  for (const session of sessions) {
    const listed = atc.sessions.find((info) => info.id.toLowerCase().startsWith(session.session_id.toLowerCase()));
    activity.set(session.session_id, { atcState: listed?.state ?? null, lastActivityAt: atc.activity.get(session.session_id) ?? null });
  }
  const due = collectPartSessionWraps({ sessions, prs, activity, wrapped, nowMs: options.nowMs, quietMs: options.quietMs });
  const done: string[] = [];
  for (const wrap of due) {
    const claim = writePartClaim(db, wrap, options);
    if (claim === null) {
      continue;
    }

    // The wrap-up skips a sub-session left off this list before its pin check, so the list carries
    // the helper's whole tree.
    const tree = collectGuardedSessions([{ issue: wrap.issue, session_id: wrap.session_id, active: 1 }], atc.sessions) ?? [];
    const wrapUp = await wrapUpRunSafely(db, deps, wrap.issue, { actor: options.actor, onlySessions: tree.map((session) => session.id), onlyNoteAction: true });
    const lines = [
      ...wrapUp.kept.map((kept) => `part-session wrap-up of ${wrap.session_id} on ${wrap.issue} kept ${kept.id}: ${kept.reason}`),
      ...wrapUp.failed.map((failure) => `part-session wrap-up of ${wrap.session_id} on ${wrap.issue} failed: ${failure.id}: ${failure.reason}`),
    ];
    const outcome = pickPartWrapOutcome(wrap.session_id, wrapUp);
    const picked = pickPartWrapLog(lines, outcome.kind, readLastRetryReasons(db, wrap));
    for (const line of picked.lines) {
      options.log(line);
    }
    if (picked.fingerprint !== null) {
      logEvent(db, 'run', wrap.issue, 'part-wrap-up-retry', options.actor, null, null, { session: wrap.session_id, reasons: picked.fingerprint });
    }
    match(outcome)
      .with({ kind: 'done' }, () => {
        writePartDone(db, wrap, options.actor);
        done.push(wrap.session_id);
      })
      .with({ kind: 'retry' }, () => removePartClaim(db, claim))
      .exhaustive();
  }
  return done;
}

const WrappedData = z.object({ session: z.string() });

type WrapEventRow = z.infer<typeof WrapEventRows>[number];

function toPartWrapEvent(row: WrapEventRow): PartWrapEvent {
  return { action: row.action, atMs: Date.parse(row.at), session: WrappedData.parse(JSON.parse(row.data)).session };
}

// A sweep that overlaps this one may have claimed the session since this pass listed it, and its
// wrap-up is still running. The check and the claim are one step.
function writePartClaim(db: Database, wrap: PartSessionWrap, options: PartSessionWrapOptions): number | null {
  return db
    .transaction(() => {
      const events = readEvents(db, 'run', wrap.issue, ['part-wrap-up', 'part-wrap-up-done']).map((event) => toPartWrapEvent(event));
      const claimed = collectWrappedPartSessions(events, options.nowMs, PART_CLAIM_ABANDONED_MS).has(wrap.session_id);
      return claimed ? null : logEvent(db, 'run', wrap.issue, 'part-wrap-up', options.actor, null, null, { session: wrap.session_id });
    })
    .immediate();
}

const RetryData = z.object({ session: z.string(), reasons: z.string() });

function readLastRetryReasons(db: Database, wrap: PartSessionWrap): string | null {
  const retries = readEvents(db, 'run', wrap.issue, ['part-wrap-up-retry'])
    .map((event) => RetryData.parse(JSON.parse(event.data)))
    .filter((data) => data.session === wrap.session_id);
  return retries.at(-1)?.reasons ?? null;
}

function writePartDone(db: Database, wrap: PartSessionWrap, actor: string): void {
  logEvent(db, 'run', wrap.issue, 'part-wrap-up-done', actor, null, null, { session: wrap.session_id });
}

// A session that wrap-up kept is retried on the next sweep.
function removePartClaim(db: Database, seq: number): void {
  db.query('DELETE FROM events WHERE seq = ?').run(seq);
}
