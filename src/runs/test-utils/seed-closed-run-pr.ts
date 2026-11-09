import invariant from 'tiny-invariant';
import { closePr } from '../close-pr.ts';
import type { RunPr } from '../types.ts';
import { seedRunPR } from './seed-run-pr.ts';
import type { RunsDeps } from './types.ts';

export function seedClosedRunPR(deps: RunsDeps, input: Parameters<typeof seedRunPR>[1] = {}): RunPr {
  const pr = seedRunPR(deps, input);
  const closed = closePr(deps.db, pr.ref, { to: 'closed', actor: 'delivery-bot' });
  invariant(closed.state === 'closed');

  return closed;
}
