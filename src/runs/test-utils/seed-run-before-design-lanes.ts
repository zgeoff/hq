import type { AddRunInput, RunView } from '../types.ts';
import { seedRun } from './seed-run.ts';
import type { TestDeps } from '../../test-utils/build-seeder.ts';

export function seedRunBeforeDesignLanes(deps: TestDeps, input: Partial<AddRunInput> = {}): RunView {
  const run = seedRun(deps, input);

  // A run from before design lanes existed: addRun now gives a design-type issue's run a lane.
  deps.db.query('UPDATE runs SET design_lane = NULL WHERE issue = ?').run(run.issue);

  return { ...run, design_lane: null };
}
