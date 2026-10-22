import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { parseStaleCommit } from './parse-stale-commit.ts';
import { staleSinceSchema } from './stale-since-schema.ts';
import type { StaleSinceMap } from './stale-since-schema.ts';
import type { PromptDrift } from './types.ts';

// Keeps meta fleet_stale_since: the first time a session reads stale is written, and the record
// goes when the session reads current or its session id changes. `unknown` changes nothing and
// never counts as stale. `live` maps a name to the session id the reading was taken from.
export function recordStaleSince(db: Database, drift: Record<string, PromptDrift>, live: Record<string, string>): StaleSinceMap {
  const current = metaJson(db, 'fleet_stale_since', staleSinceSchema, {}),
    next = buildNextStaleSince(current, drift, live);
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    setMeta(db, 'fleet_stale_since', JSON.stringify(next));
  }
  return next;
}

function buildNextStaleSince(current: StaleSinceMap, drift: Record<string, PromptDrift>, live: Record<string, string>): StaleSinceMap {
  const next: StaleSinceMap = { ...current };
  for (const [name, reading] of Object.entries(drift)) {
    const sessionId = live[name];
    if (sessionId === undefined) {
      continue;
    }
    if (next[name]?.sessionId !== sessionId || reading.state === 'current') {
      delete next[name];
    }
    if (reading.state === 'stale' && next[name] === undefined) {
      next[name] = { sessionId, at: iso(now()), commit: parseStaleCommit(reading.since).commit };
    }
  }
  return next;
}
