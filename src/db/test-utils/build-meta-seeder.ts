import { seedMeta } from './seed-meta.ts';
import type { MetaDeps } from './types.ts';

export function buildMetaSeeder(deps: MetaDeps) {
  return {
    meta: (input: Parameters<typeof seedMeta>[1]) => seedMeta(deps, input),
  };
}
