import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { HqError } from '../../errors.ts';
import { countWorking } from '../../lanes/cap/count-working.ts';
import { readActiveCap } from '../../lanes/cap/read-active-cap.ts';
import { buildFleetView } from './build-fleet-view.ts';
import { readFleetUsageSamples } from './read-fleet-usage-samples.ts';
import { readSlotOpToken } from './read-slot-op-token.ts';
import { readSlotRows } from './read-slot-rows.ts';
import type { FleetView } from './types.ts';

const HISTORY_HOURS = 8 * 24;
const SAMPLE_HOURS = 7 * 24;
export async function readFleetView(db: Database, at: Date): Promise<FleetView> {
  const notSetUp = await readNotSetUp();
  const rows = readSlotRows(db, new Date(at.getTime() - HISTORY_HOURS * 3_600_000), at);
  const samples = readFleetUsageSamples(db, at, SAMPLE_HOURS);
  return buildFleetView({ at, notSetUp, rows, samples, working: countWorking(db, at).count, cap: readActiveCap(db, at)?.cap ?? null });
}

async function readNotSetUp(): Promise<string | null> {
  try {
    const token = await readSlotOpToken();

    return match(token)
      .with({ kind: 'not-set-up' }, (notSetUp) => notSetUp.reason)
      .with({ kind: 'ready' }, () => null)
      .exhaustive();
  } catch (error) {
    if (error instanceof HqError) {
      return error.message;
    }
    throw error;
  }
}
