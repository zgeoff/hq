import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { LANES } from './lanes.ts';
import { READY_SNAPSHOT } from './ready-snapshot.ts';
import type { ReadySnapshot } from './ready-snapshot.ts';

export const READY_ISSUES_KEY = 'lanes_ready_issues';

// The last Ready read while fresh (the per-lane counts' 30 min); null when none or stale, so the
// plan never picks from a list Linear may have moved on from.
export function readReadySnapshot(db: Database, at: Date = now()): ReadySnapshot | null {
  const snapshot = metaJson(db, READY_ISSUES_KEY, READY_SNAPSHOT, null);
  if (snapshot === null || at.getTime() - Date.parse(snapshot.at) > LANES.readyFreshMinutes() * 60_000) {
    return null;
  }
  return snapshot;
}
