import invariant from 'tiny-invariant';
import { setState } from '../set-state.ts';
import type { AddRunInput, RunView } from '../types.ts';
import { seedRun } from './seed-run.ts';
import type { TestDeps } from '../../test-utils/test-deps.ts';

export function seedDeployHeldRun(deps: TestDeps, input: Partial<AddRunInput> = {}): RunView {
  const run = seedRun(deps, input);
  const moved = setState(deps.db, run.issue, 'deploy-held', {}, 'delivery-bot');
  invariant(moved.state === 'deploy-held');

  return moved;
}
