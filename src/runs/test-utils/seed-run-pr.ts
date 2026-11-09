import invariant from 'tiny-invariant';
import type { RunsDeps } from './types.ts';
import { addPR } from '../add-pr.ts';
import type { RunPR } from '../types.ts';
import { buildMockNewRunPR } from './build-mock-new-run-pr.ts';
import type { NewRunPR } from './build-mock-new-run-pr.ts';

export function seedRunPR(deps: RunsDeps, input: Partial<NewRunPR> = {}): RunPR {
  const newPR = buildMockNewRunPR(input);
  const pr = addPR(deps.db, newPR.issue, newPR.ref, 'delivery-bot');
  invariant(pr.state === 'open');

  return pr;
}
