import { seedMeta } from './seed-meta.ts';
import type { TestDeps } from '../../test-utils/build-seeder.ts';

export function buildMetaSeeder(deps: TestDeps) {
  return {
    meta: (input: Parameters<typeof seedMeta>[1]) => seedMeta(deps, input),
  };
}
