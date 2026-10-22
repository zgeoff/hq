import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { AWAKE } from './awake.ts';
import { buildAwakeSchema } from './build-awake-schema.ts';
import type { z } from 'zod';

// A blocked run whose sessions are all asleep, gone, or idle 15 min holds no agent, whatever it
// waits on (z-stu, 0.44.0): its slot is free until a session wakes or the state moves, and the lane
// may run over its size meanwhile. A working run whose sessions are all gone holds none either
// (z-stu, 0.54.16); asleep counts as present. With no fresh reading of atc, every run counts.
export function parkedRuns(db: Database, at: Date = now()): { issue: string; lane: string }[] {
  const reading = findFreshAwake(db, at);
  return reading === null ? [] : [...findIdleBlockedRuns(db, reading, at), ...findGoneRuns(db, reading, at)].toSorted((a, b) => a.issue.localeCompare(b.issue));
}

type AwakeReading = NonNullable<z.output<ReturnType<typeof buildAwakeSchema>>>;

function findIdleBlockedRuns(db: Database, reading: AwakeReading, at: Date): { issue: string; lane: string }[] {
  const sessionsOf = db.query('SELECT session_id FROM run_sessions WHERE issue = ? AND active = 1');
  return loadBlockedRuns(db).filter((x) => !hasBusySession(sessionsOf.all(x.issue) as { session_id: string }[], new Set(reading.ids), reading.idle ?? {}, at));
}

// The sweep's record of the sessions atc shows awake, or null when none is under 15 min old, as a
// wrong "free" could overfill the imp.
function findFreshAwake(db: Database, at: Date): z.output<ReturnType<typeof buildAwakeSchema>> {
  const AWAKE_FRESH_MIN = 15,
    r = metaJson(db, AWAKE, buildAwakeSchema(), null),
    sinceMs = r === null ? Number.NaN : at.getTime() - Date.parse(r.at);
  return sinceMs >= 0 && sinceMs <= AWAKE_FRESH_MIN * 60_000 ? r : null;
}

function loadBlockedRuns(db: Database): { issue: string; lane: string }[] {
  return db.query(`SELECT issue, COALESCE(lane, '') AS lane FROM runs WHERE place != 'none' AND state = 'blocked' ORDER BY issue`).all() as { issue: string; lane: string }[];
}

function hasBusySession(rows: readonly { session_id: string }[], awake: ReadonlySet<string>, idle: Readonly<Record<string, string>>, at: Date): boolean {
  return rows.some((row) => isBusy(row.session_id, awake, idle, at));
}

// An awake session idle this long holds no agent (z-stu, 0.37.0).
function getIdleParkMs(): number {
  return 15 * 60_000;
}

// A session holds its run's slot while awake, unless it has sat idle for getIdleParkMs().
function isBusy(id: string, awake: ReadonlySet<string>, idle: Readonly<Record<string, string>>, at: Date): boolean {
  const since = idle[id];
  if (!awake.has(id)) {
    return false;
  }
  return since === undefined || at.getTime() - Date.parse(since) < getIdleParkMs();
}

interface SessionRow {
  session_id: string;
  added_at: string;
}

// Working runs that have sessions, none of them present, the newest added over one sweep (5 min)
// ago: atc can take a moment to list a session after its spawn.
function findGoneRuns(db: Database, reading: AwakeReading, at: Date): { issue: string; lane: string }[] {
  const GONE_GRACE_MS = 5 * 60_000,
    present = new Set(reading.present),
    sessionsOf = db.query('SELECT session_id, added_at FROM run_sessions WHERE issue = ?'),
    working = db.query(`SELECT issue, COALESCE(lane, '') AS lane FROM runs WHERE place != 'none' AND state = 'working' ORDER BY issue`).all() as { issue: string; lane: string }[];
  if (reading.present === undefined) {
    return [];
  }
  return working.filter((x) => {
    const rows = sessionsOf.all(x.issue) as SessionRow[];
    return rows.length > 0 && rows.every((row) => !present.has(row.session_id) && at.getTime() - Date.parse(row.added_at) > GONE_GRACE_MS);
  });
}
