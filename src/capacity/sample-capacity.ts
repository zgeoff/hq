// hq capacity: what the fleet's machines have left. Every watcher tick reads impd (the imp daemon),
// cloud's memory, Claude usage, today's CI minutes and this PC, stores one sample, and tells
// z-stu and z-delivery when a threshold holds. Read-only: it never stops or starts anything.
// The PC is shown, never alerted on: `hq health` already alerts z-stu on its disk and memory.
import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { checkCapacity as evaluateCapacity } from './check-capacity.ts';
import { readCapacity } from './read-capacity.ts';
import type { CapacityProbe, CapacityTick, Reading } from './types.ts';
import { writeCapacitySample as storeSample } from './write-capacity-sample.ts';

// The watcher's step, and `hq capacity sample`: read, store, evaluate.
export async function sampleCapacity(db: Database, probe: CapacityProbe, actor: string, at: Date = now()): Promise<{ reading: Reading; tick: CapacityTick }> {
  const reading = await readCapacity(db, probe, at);
  await storeSample(db, reading);
  return { reading, tick: evaluateCapacity(db, { reading, plan: probe.plan ?? null }, actor, at) };
}
