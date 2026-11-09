import type { ShippedCacheRow } from '../../kdb.ts';
import { upsertCacheEntries } from '../upsert-cache-entries.ts';
import { buildMockCacheEntry } from './build-mock-cache-entry.ts';
import type { ShippedDeps } from './types.ts';

export async function seedCacheEntry(deps: ShippedDeps, input: Partial<ShippedCacheRow> = {}): Promise<ShippedCacheRow> {
  const entry = buildMockCacheEntry(input);
  await upsertCacheEntries(deps.db, [entry]);

  return entry;
}
