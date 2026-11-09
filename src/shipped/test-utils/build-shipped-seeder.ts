import { seedCacheEntry } from './seed-cache-entry.ts';
import type { ShippedDeps } from './types.ts';

export function buildShippedSeeder(deps: ShippedDeps) {
  return {
    cacheEntry: (input?: Parameters<typeof seedCacheEntry>[1]) => seedCacheEntry(deps, input),
  };
}
