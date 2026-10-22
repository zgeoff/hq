import type { Database } from 'bun:sqlite';
import { buildLanePlan } from '../lanes/build-lane-plan.ts';
import { loadPacing } from '../lanes/load-pacing.ts';
import { capacitySettings } from './capacity-settings.ts';
import { sampleCapacity } from './sample-capacity.ts';
import type { CapacityProbe, CapacityTick, Reading } from './types.ts';

// The watcher's capacity step, and `hq capacity sample`: one sample, checked with the imp lanes'
// plan from pacing.json. A pacing.json with neither lanes nor slots, or one hq refuses, gives no plan.
export async function runCapacityStep(db: Database, probe: CapacityProbe, pacingFile: string, actor: string): Promise<{ reading: Reading; tick: CapacityTick }> {
  const pacing = await loadPacing(pacingFile),
    plan = pacing.slots === null ? null : buildLanePlan(pacing.slots.imp, pacing.impMib, capacitySettings(db));
  return sampleCapacity(db, { ...probe, plan }, actor);
}
