import type { Database } from 'bun:sqlite';
import { isCapEnded } from './is-cap-ended.ts';
import type { LanesCap } from './lanes-cap.ts';
import { readLanesCap } from './read-lanes-cap.ts';

export function readActiveCap(db: Database, at: Date): LanesCap | null {
  const stored = readLanesCap(db);
  return stored.kind === 'set' && !isCapEnded(stored.cap, at) ? stored.cap : null;
}
