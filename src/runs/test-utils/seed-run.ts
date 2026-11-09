import invariant from 'tiny-invariant';
import { addRun } from '../add-run.ts';
import type { AddRunInput, RunView } from '../types.ts';
import { buildMockAddRunInput } from './build-mock-add-run-input.ts';
import type { RunsDeps } from './types.ts';

export function seedRun(deps: RunsDeps, input: Partial<AddRunInput> = {}): RunView {
  const added = addRun(deps.db, buildMockAddRunInput(input));
  invariant(added.result === 'added' && added.run.state === 'working');

  return added.run;
}
