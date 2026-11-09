import { buildMetaSeeder } from '../db/test-utils/build-meta-seeder.ts';
import { buildOutboxSeeder } from '../outbox/test-utils/build-outbox-seeder.ts';
import { buildRunSeeder } from '../runs/test-utils/build-run-seeder.ts';
import { buildEventSeeder } from './build-event-seeder.ts';
import type { TestDeps } from './test-deps.ts';

export function buildSeeder(deps: TestDeps) {
  return {
    ...buildMetaSeeder(deps),
    ...buildEventSeeder(deps),
    ...buildOutboxSeeder(deps),
    ...buildRunSeeder(deps),
  };
}
