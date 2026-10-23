import type { Database } from 'bun:sqlite';
import { isDeepStrictEqual } from 'node:util';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { refreshSchema } from './refresh-schema.ts';
import type { RefreshMap, RefreshPhase } from './refresh-schema.ts';
import { REFRESH_TRANSITIONS } from './refresh-transitions.ts';

// Saves meta fleet_refresh; an empty map removes the key.
export function writeFleetRefresh(db: Database, refresh: RefreshMap): void {
  const stored = metaJson(db, 'fleet_refresh', refreshSchema, {}),
    text = Object.keys(refresh).length > 0 ? JSON.stringify(refresh) : null;
  for (const name of new Set([...Object.keys(stored), ...Object.keys(refresh)])) {
    checkRefreshMove(name, stored[name], refresh[name]);
  }
  setMeta(db, 'fleet_refresh', text);
}

type RefreshEntry = RefreshMap[string];

// A new answer read time changes no phase, so it is no move.
function checkRefreshMove(name: string, from: RefreshEntry | undefined, to: RefreshEntry | undefined): void {
  if (isDeepStrictEqual(toPhaseFields(from), toPhaseFields(to))) {
    return;
  }
  const fromPhase = toMovePhase(from, to?.sessionId),
    toPhase = to?.phase ?? 'none';
  if (!REFRESH_TRANSITIONS[fromPhase].includes(toPhase)) {
    throw new HqError('bad_refresh_move', `fleet_refresh: ${name} cannot move from ${fromPhase} to ${toPhase}`);
  }
}

function toPhaseFields(entry: RefreshEntry | undefined): Omit<RefreshEntry, 'answerReadAt'> | undefined {
  if (entry === undefined) {
    return undefined;
  }
  const { answerReadAt: _, ...fields } = entry;
  return fields;
}

function toMovePhase(entry: RefreshEntry | undefined, sessionId: string | undefined): RefreshPhase | 'none' {
  if (entry === undefined || (sessionId !== undefined && entry.sessionId !== sessionId)) {
    return 'none';
  }
  return entry.phase;
}
