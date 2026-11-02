// The PC is shown, never alerted on: `hq health` already alerts z-stu on its disk and memory.
import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { checkCapacity as evaluateCapacity } from './check-capacity.ts';
import { readCapacity } from './read-capacity.ts';
import type { CapacityProbe, CapacityTick, Reading } from './types.ts';
import { writeCapacitySample as storeSample } from './write-capacity-sample.ts';

export async function sampleCapacity(db: Database, probe: CapacityProbe, actor: string, at: Date = now()): Promise<{ reading: Reading; tick: CapacityTick }> {
  const reading = await readCapacity(db, probe, at);
  await storeSample(db, reading);
  return { reading, tick: evaluateCapacity(db, { reading, plan: probe.plan ?? null, claudeLaunchPct: probe.claudeLaunchPct ?? null }, actor, at) };
}
