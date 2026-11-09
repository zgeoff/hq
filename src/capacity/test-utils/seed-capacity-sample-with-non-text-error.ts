import { kdb } from '../../kdb.ts';
import type { Reading } from '../types.ts';
import { buildMockReading } from './build-mock-reading.ts';
import type { CapacityDeps } from './types.ts';

export async function seedCapacitySampleWithNonTextError(deps: CapacityDeps, input: Partial<Omit<Reading, 'errors'>> = {}): Promise<void> {
  const { errors: _errors, ...row } = buildMockReading(input);

  // A sample whose errors object holds a number: hq stores each error as text.
  await kdb(deps.db).insertInto('capacity_samples').values({ ...row, errors: '{"cloud":4}' }).execute();
}
