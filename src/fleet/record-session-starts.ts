import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { sessionStartsSchema } from './session-starts-schema.ts';
import type { SessionStartsMap } from './session-starts-schema.ts';
import type { FleetSession } from './types.ts';

// A session id is written once, so an atc restore that resets createdAt does not move it.
export function recordSessionStarts(db: Database, live: Record<string, FleetSession>): SessionStartsMap {
  const current = metaJson(db, 'fleet_session_starts', sessionStartsSchema, {});
  const next: SessionStartsMap = {};
  for (const [name, session] of Object.entries(live)) {
    const known = current[name];
    next[name] = known?.sessionId === session.id ? known : { sessionId: session.id, at: iso(buildStart(session)) };
  }
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    setMeta(db, 'fleet_session_starts', JSON.stringify(next));
  }
  return next;
}

function buildStart(session: FleetSession): Date {
  if (typeof session.createdAt === 'number') {
    return new Date(session.createdAt);
  }
  return now();
}
