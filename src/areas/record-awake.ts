import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { AWAKE } from './awake.ts';
import { buildAwakeSchema } from './build-awake-schema.ts';
import { isPresentSession } from './is-present-session.ts';
import type { AwakeSession } from './types.ts';

// An asleep session (its vm or harness suspended, or meant to sleep and not alive) is not awake,
// but it is present: only a session atc no longer lists, or one that ended, is gone.
export function recordAwake(db: Database, sessions: AwakeSession[], activity: ReadonlyMap<string, number | null> = new Map()): void {
  const awake = sessions.filter((s) => s.alive && s.lifecycle?.vm !== 'asleep' && s.lifecycle?.harness !== 'suspended').map((s) => s.id);
  setMeta(db, AWAKE, formatAwakeReading(db, sessions, awake, activity));
}

// When each awake session was first seen idle (any atc state but running), kept across sweeps.
// A turn between two sweeps (atc's lastActivityAt) moves the clock to that turn.
function buildIdleSince(previous: Readonly<Record<string, string>>, sessions: readonly AwakeSession[], awake: readonly string[], activity: ReadonlyMap<string, number | null>): Record<string, string> {
  const idle: Record<string, string> = {};
  for (const session of sessions) {
    if (awake.includes(session.id) && session.state !== undefined && session.state !== 'running') {
      idle[session.id] = pickIdleSince(previous[session.id], activity.get(session.id));
    }
  }
  return idle;
}

function pickIdleSince(previous: string | undefined, lastActivity: number | null | undefined): string {
  const since = previous ?? iso(now());
  if (typeof lastActivity === 'number' && lastActivity > Date.parse(since)) {
    return iso(new Date(lastActivity));
  }
  return since;
}

function formatAwakeReading(db: Database, sessions: readonly AwakeSession[], awake: readonly string[], activity: ReadonlyMap<string, number | null>): string {
  const idle = buildIdleSince(readIdleSince(db), sessions, awake, activity);
  return JSON.stringify({ at: iso(now()), ids: awake, idle, present: sessions.filter((session) => isPresentSession(session)).map((session) => session.id) });
}

function readIdleSince(db: Database): Record<string, string> {
  const reading = metaJson(db, AWAKE, buildAwakeSchema(), null);
  return reading?.idle ?? {};
}
