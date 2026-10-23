import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { fleetIds } from '../atc/fleet-ids.ts';
import { setMeta } from '../db/set-meta.ts';
import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';
import { AWAKE } from './awake.ts';
import { buildAwakeSchema } from './build-awake-schema.ts';
import { isPresentSession } from './is-present-session.ts';
import type { AwakeSession } from './types.ts';

// The fleet's own sessions: the names fleet.json declares, and each id hq fleet last saw live under
// a declared name.
interface FleetSessions {
  names: ReadonlySet<string>;
  ids: ReadonlySet<string>;
}

// An asleep session (its vm or harness suspended, or meant to sleep and not alive) is not awake,
// but it is present: only a session atc no longer lists, or one that ended, is gone.
export function recordAwake(db: Database, sessions: AwakeSession[], activity: ReadonlyMap<string, number | null> = new Map()): void {
  const awake = sessions.filter((s) => s.alive && s.lifecycle?.vm !== 'asleep' && s.lifecycle?.harness !== 'suspended').map((s) => s.id);
  const fleet: FleetSessions = { names: new Set(getDeclaredSessions().map((declared) => declared.name)), ids: new Set(Object.values(fleetIds(db))) };
  setMeta(db, AWAKE, formatAwakeReading({ sessions, awake, activity, fleet, previousIdle: readIdleSince(db) }));
}

interface AwakeLook {
  sessions: readonly AwakeSession[];
  awake: readonly string[];
  activity: ReadonlyMap<string, number | null>;
  fleet: FleetSessions;
  previousIdle: Readonly<Record<string, string>>;
}

function formatAwakeReading(look: AwakeLook): string {
  const idle = buildIdleSince(look.previousIdle, look.sessions, look.awake, look.activity);
  return JSON.stringify({ at: iso(now()), ids: look.awake, idle, present: look.sessions.filter((session) => isPresentSession(session)).map((session) => session.id), local: collectLocalAwake(look.sessions, look.awake, look.fleet) });
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

// The awake sessions atc places on this PC, the fleet's own sessions left out.
function collectLocalAwake(sessions: readonly AwakeSession[], awake: readonly string[], fleet: FleetSessions): string[] {
  return sessions.filter((session) => awake.includes(session.id) && session.locator?.targetID === 'local' && !fleet.ids.has(session.id) && !fleet.names.has(session.name ?? '')).map((session) => session.id);
}

function readIdleSince(db: Database): Record<string, string> {
  const reading = metaJson(db, AWAKE, buildAwakeSchema(), null);
  return reading?.idle ?? {};
}
