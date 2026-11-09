import invariant from 'tiny-invariant';
import { setState } from '../set-state.ts';
import type { AddRunInput, RunView } from '../types.ts';
import { seedRun } from './seed-run.ts';
import type { TestDeps } from '../../test-utils/build-seeder.ts';

export function seedBlockedRun(deps: TestDeps, input: Partial<AddRunInput> = {}): RunView {
  const run = seedRun(deps, input);
  const moved = setState(deps.db, run.issue, 'blocked', {}, 'delivery-bot');
  invariant(moved.state === 'blocked');

  return moved;
}
