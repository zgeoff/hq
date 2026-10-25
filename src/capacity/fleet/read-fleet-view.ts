import type { Database } from 'bun:sqlite';
import { HqError } from '../../errors.ts';
import { countWorking } from '../../lanes/cap/count-working.ts';
import { readActiveCap } from '../../lanes/cap/read-active-cap.ts';
import { readUsageSamples } from '../read-usage-samples.ts';
import { buildFleetView } from './build-fleet-view.ts';
import { readSlotOpToken } from './read-slot-op-token.ts';
import { readSlotRows } from './read-slot-rows.ts';
import type { FleetView } from './types.ts';

const HISTORY_HOURS = 8 * 24;
const SAMPLE_MAX_AGE_MS = 30 * 60_000;

// The fleet forecast from what is stored: the slot rows and the usage samples. It makes no op
// call and no request.
export async function readFleetView(db: Database, at: Date): Promise<FleetView> {
  const notSetUp = await readNotSetUp();
  const rows = readSlotRows(db, new Date(at.getTime() - HISTORY_HOURS * 3_600_000), at);
  const samples = readUsageSamples(db, at, HISTORY_HOURS);
  const newest = samples.at(-1);
  const fresh = newest !== undefined && at.getTime() - Date.parse(newest.at) <= SAMPLE_MAX_AGE_MS;
  return buildFleetView({ at, notSetUp, rows, samples: fresh ? samples : [], working: countWorking(db, at).count, cap: readActiveCap(db, at)?.cap ?? null });
}

async function readNotSetUp(): Promise<string | null> {
  try {
    const token = await readSlotOpToken();
    return token.kind === 'not-set-up' ? token.reason : null;
  } catch (error) {
    if (error instanceof HqError) {
      return error.message;
    }
    throw error;
  }
}
