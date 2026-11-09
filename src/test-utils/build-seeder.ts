import { buildMetaSeeder } from '../db/test-utils/build-meta-seeder.ts';
import type { MetaDeps } from '../db/test-utils/types.ts';
import { buildOutboxSeeder } from '../outbox/test-utils/build-outbox-seeder.ts';
import type { OutboxDeps } from '../outbox/test-utils/types.ts';
import { buildRunSeeder } from '../runs/test-utils/build-run-seeder.ts';
import type { RunsDeps } from '../runs/test-utils/types.ts';
import { buildEventSeeder } from './build-event-seeder.ts';
import type { EventsDeps } from './types.ts';

export type TestDeps = MetaDeps & EventsDeps & OutboxDeps & RunsDeps;

export function buildSeeder(deps: TestDeps) {
  return {
    ...buildMetaSeeder(deps),
    ...buildEventSeeder(deps),
    ...buildOutboxSeeder(deps),
    ...buildRunSeeder(deps),
  };
}
