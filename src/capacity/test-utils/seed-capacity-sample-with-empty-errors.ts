import { kdb } from '../../kdb.ts';
import type { Reading } from '../types.ts';
import { buildMockReading } from './build-mock-reading.ts';
import type { CapacityDeps } from './types.ts';

export async function seedCapacitySampleWithEmptyErrors(deps: CapacityDeps, input: Partial<Omit<Reading, 'errors'>> = {}): Promise<void> {
  const { errors: _errors, ...row } = buildMockReading(input);

  // A sample whose errors column holds empty text: writeCapacitySample stores errors as a JSON object.
  await kdb(deps.db).insertInto('capacity_samples').values({ ...row, errors: '' }).execute();
}
