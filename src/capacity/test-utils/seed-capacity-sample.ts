import { writeCapacitySample } from '../write-capacity-sample.ts';
import type { Reading } from '../types.ts';
import { buildMockReading } from './build-mock-reading.ts';
import type { CapacityDeps } from './types.ts';

export async function seedCapacitySample(deps: CapacityDeps, input: Partial<Reading> = {}): Promise<Reading> {
  const reading = buildMockReading(input);
  await writeCapacitySample(deps.db, reading);

  return reading;
}
