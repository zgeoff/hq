import type { Database } from 'bun:sqlite';
import type { Runner } from '../../runner/types.ts';
import { readFleetView } from './read-fleet-view.ts';
import { runFleetStep } from './run-fleet-step.ts';
import type { FleetView } from './types.ts';

// The fleet block of `hq capacity`: the stored rows, or a read of the slots first when `refresh` is set.
export async function readCapacityFleet(db: Database, run: Runner, at: Date, refresh: boolean): Promise<{ view: FleetView; problems: string[] }> {
  if (!refresh) {
    return { view: await readFleetView(db, at), problems: [] };
  }
  const step = await runFleetStep(db, run, at, true);
  return { view: step.view, problems: step.read?.kind === 'read' ? step.read.problems : [] };
}
