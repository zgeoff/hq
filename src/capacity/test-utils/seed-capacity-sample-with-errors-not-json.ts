import { kdb } from '../../kdb.ts';
import type { Reading } from '../types.ts';
import { buildMockReading } from './build-mock-reading.ts';
import type { CapacityDeps } from './types.ts';

export async function seedCapacitySampleWithErrorsNotJSON(deps: CapacityDeps, input: Partial<Omit<Reading, 'errors'>> = {}): Promise<void> {
  const { errors: _errors, ...row } = buildMockReading(input);

  // A sample whose errors column holds text that is not JSON: hq stores errors as a JSON object.
  await kdb(deps.db).insertInto('capacity_samples').values({ ...row, errors: '{oops' }).execute();
}
