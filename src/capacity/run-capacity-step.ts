import type { Database } from 'bun:sqlite';
import { buildLanePlan } from '../lanes/build-lane-plan.ts';
import { loadPacing } from '../lanes/load-pacing.ts';
import { capacitySettings } from './capacity-settings.ts';
import { sampleCapacity } from './sample-capacity.ts';
import type { CapacityProbe, CapacityTick, Reading } from './types.ts';

export async function runCapacityStep(db: Database, probe: CapacityProbe, pacingFile: string, actor: string): Promise<{ reading: Reading; tick: CapacityTick }> {
  const pacing = await loadPacing(pacingFile);
  const plan = pacing.slots === null ? null : buildLanePlan(pacing.slots.imp, pacing.impMib, capacitySettings(db));
  return sampleCapacity(db, { ...probe, plan, claudeLaunchPct: pacing.claudeLaunchPct }, actor);
}
