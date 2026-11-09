import { seedStoreDisposition } from './seed-store-disposition.ts';
import type { RepoDeps } from './types.ts';

export function buildRepoSeeder(deps: RepoDeps) {
  return {
    noslopDisposition: (input?: Parameters<typeof seedStoreDisposition>[1]) => seedStoreDisposition(deps, input),
  };
}
