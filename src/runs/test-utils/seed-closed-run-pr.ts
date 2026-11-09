import invariant from 'tiny-invariant';
import { closePr } from '../close-pr.ts';
import type { RunPr } from '../types.ts';
import { seedRunPr } from './seed-run-pr.ts';
import type { TestDeps } from '../../test-utils/build-seeder.ts';

export function seedClosedRunPr(deps: TestDeps, input: Parameters<typeof seedRunPr>[1] = {}): RunPr {
  const pr = seedRunPr(deps, input);
  const closed = closePr(deps.db, pr.ref, { to: 'closed', actor: 'delivery-bot' });
  invariant(closed.state === 'closed');

  return closed;
}
