import invariant from 'tiny-invariant';
import { setState } from '../set-state.ts';
import type { AddRunInput, RunView } from '../types.ts';
import { seedRun } from './seed-run.ts';
import type { TestDeps } from '../../test-utils/build-seeder.ts';

export function seedDoneRun(deps: TestDeps, input: Partial<AddRunInput> = {}): RunView {
  const run = seedRun(deps, input);
  const moved = setState(deps.db, run.issue, 'done', {}, 'delivery-bot');
  invariant(moved.state === 'done');

  return moved;
}
