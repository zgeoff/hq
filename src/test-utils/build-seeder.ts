import { buildAsksSeeder } from '../asks/test-utils/build-asks-seeder.ts';
import type { AsksDeps } from '../asks/test-utils/types.ts';
import { buildFleetSeeder } from '../capacity/fleet/test-utils/build-fleet-seeder.ts';
import type { FleetDeps } from '../capacity/fleet/test-utils/types.ts';
import { buildCapacitySeeder } from '../capacity/test-utils/build-capacity-seeder.ts';
import type { CapacityDeps } from '../capacity/test-utils/types.ts';
import { buildMetaSeeder } from '../db/test-utils/build-meta-seeder.ts';
import type { MetaDeps } from '../db/test-utils/types.ts';
import { buildFocusSeeder } from '../focus/test-utils/build-focus-seeder.ts';
import type { FocusDeps } from '../focus/test-utils/types.ts';
import { buildGoalsSeeder } from '../goals/test-utils/build-goals-seeder.ts';
import type { GoalsDeps } from '../goals/test-utils/types.ts';
import { buildGrantsSeeder } from '../grants/test-utils/build-grants-seeder.ts';
import type { GrantsDeps } from '../grants/test-utils/types.ts';
import { buildKindsSeeder } from '../kinds/test-utils/build-kinds-seeder.ts';
import type { KindsDeps } from '../kinds/test-utils/types.ts';
import { buildLanesSeeder } from '../lanes/test-utils/build-lanes-seeder.ts';
import type { LanesDeps } from '../lanes/test-utils/types.ts';
import { buildLinearSeeder } from '../linear/test-utils/build-linear-seeder.ts';
import type { LinearDeps } from '../linear/test-utils/types.ts';
import { buildMorningSeeder } from '../morning/test-utils/build-morning-seeder.ts';
import type { MorningDeps } from '../morning/test-utils/types.ts';
import { buildNoslopSeeder } from '../noslop/test-utils/build-noslop-seeder.ts';
import type { NoslopDeps } from '../noslop/test-utils/types.ts';
import { buildOutboxSeeder } from '../outbox/test-utils/build-outbox-seeder.ts';
import type { OutboxDeps } from '../outbox/test-utils/types.ts';
import { buildProbeSeeder } from '../probe/test-utils/build-probe-seeder.ts';
import type { ProbeDeps } from '../probe/test-utils/types.ts';
import { buildRefusalsSeeder } from '../refusals/test-utils/build-refusals-seeder.ts';
import type { RefusalsDeps } from '../refusals/test-utils/types.ts';
import { buildRunSeeder } from '../runs/test-utils/build-run-seeder.ts';
import type { RunsDeps } from '../runs/test-utils/types.ts';
import { buildTypedSeeder } from '../typed/test-utils/build-typed-seeder.ts';
import type { TypedDeps } from '../typed/test-utils/types.ts';
import { buildEventSeeder } from './build-event-seeder.ts';
import type { EventsDeps } from './types.ts';

export type TestDeps = MetaDeps &
  EventsDeps &
  OutboxDeps &
  RunsDeps &
  ProbeDeps &
  GoalsDeps &
  CapacityDeps &
  FleetDeps &
  LanesDeps &
  KindsDeps &
  LinearDeps &
  RefusalsDeps &
  GrantsDeps &
  TypedDeps &
  AsksDeps &
  MorningDeps &
  FocusDeps &
  NoslopDeps;

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
    ...buildKindsSeeder(deps),
    ...buildLinearSeeder(deps),
    ...buildRefusalsSeeder(deps),
    ...buildGrantsSeeder(deps),
    ...buildTypedSeeder(deps),
    ...buildAsksSeeder(deps),
    ...buildMorningSeeder(deps),
    ...buildFocusSeeder(deps),
    ...buildNoslopSeeder(deps),
  };
}
