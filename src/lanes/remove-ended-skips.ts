import type { Database } from 'bun:sqlite';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { isSkipActive } from './is-skip-active.ts';
import { LANE_SKIPS_KEY, readLaneSkips } from './read-lane-skips.ts';

// Drops the skips whose time has passed, and those whose until issue Linear reads Done or Canceled
// (settled), logging each; returns the issues whose skips ended.
export function removeEndedSkips(db: Database, settled: ReadonlySet<string>, actor: string, at: Date): string[] {
  const skips = readLaneSkips(db);
  const ended = skips.filter((skip) => !isSkipActive(skip, at) || settled.has(skip.until));
  if (ended.length === 0) {
    return [];
  }
  const kept = skips.filter((skip) => !ended.includes(skip));
  setMeta(db, LANE_SKIPS_KEY, JSON.stringify(kept));
  for (const skip of ended) {
    logEvent(db, 'hq', 'lanes', 'skip-ended', actor, null, null, { issue: skip.issue, until: skip.until, reason: skip.reason });
  }
  return ended.map((skip) => skip.issue);
}
