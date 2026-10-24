import type { Database } from 'bun:sqlite';
import { countWorking } from '../lanes/cap/count-working.ts';
import { readActiveCap } from '../lanes/cap/read-active-cap.ts';
import { buildCapacityHint } from './build-capacity-hint.ts';
import type { CapacityHint } from './build-capacity-hint.ts';
import { readUsageSamples } from './read-usage-samples.ts';

const HINT_HOURS = 2;

// The Claude burn from the usage samples of the last 2 hours, against the launch limit.
export function readCapacityHint(db: Database, limit: number, at: Date): CapacityHint {
  const samples = readUsageSamples(db, at, HINT_HOURS);
  return buildCapacityHint({ samples, hours: HINT_HOURS, limit, working: countWorking(db, at).count, cap: readActiveCap(db, at)?.cap ?? null, at });
}
