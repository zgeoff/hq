import { buildFleetSeeder } from '../capacity/fleet/test-utils/build-fleet-seeder.ts';
import type { FleetDeps } from '../capacity/fleet/test-utils/types.ts';
import { buildCapacitySeeder } from '../capacity/test-utils/build-capacity-seeder.ts';
import type { CapacityDeps } from '../capacity/test-utils/types.ts';
import { buildMetaSeeder } from '../db/test-utils/build-meta-seeder.ts';
import type { MetaDeps } from '../db/test-utils/types.ts';
import { buildGoalsSeeder } from '../goals/test-utils/build-goals-seeder.ts';
import type { GoalsDeps } from '../goals/test-utils/types.ts';
import { buildLanesSeeder } from '../lanes/test-utils/build-lanes-seeder.ts';
import type { LanesDeps } from '../lanes/test-utils/types.ts';
import { buildOutboxSeeder } from '../outbox/test-utils/build-outbox-seeder.ts';
import type { OutboxDeps } from '../outbox/test-utils/types.ts';
import { buildProbeSeeder } from '../probe/test-utils/build-probe-seeder.ts';
import type { ProbeDeps } from '../probe/test-utils/types.ts';
import { buildRunSeeder } from '../runs/test-utils/build-run-seeder.ts';
import type { RunsDeps } from '../runs/test-utils/types.ts';
import { buildEventSeeder } from './build-event-seeder.ts';
import type { EventsDeps } from './types.ts';

export type TestDeps = MetaDeps & EventsDeps & OutboxDeps & RunsDeps & ProbeDeps & GoalsDeps & CapacityDeps & FleetDeps & LanesDeps;

export function buildSeeder(deps: TestDeps) {
  return {
    ...buildMetaSeeder(deps),
    ...buildEventSeeder(deps),
    ...buildOutboxSeeder(deps),
    ...buildRunSeeder(deps),
    ...buildProbeSeeder(deps),
    ...buildGoalsSeeder(deps),
    ...buildCapacitySeeder(deps),
    ...buildFleetSeeder(deps),
    ...buildLanesSeeder(deps),
  };
}
