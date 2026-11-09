import invariant from 'tiny-invariant';
import type { RunsDeps } from './types.ts';
import { addPr } from '../add-pr.ts';
import type { RunPr } from '../types.ts';
import { buildMockNewRunPR } from './build-mock-new-run-pr.ts';
import type { NewRunPR } from './build-mock-new-run-pr.ts';

export function seedRunPR(deps: RunsDeps, input: Partial<NewRunPR> = {}): RunPr {
  const newPR = buildMockNewRunPR(input);
  const pr = addPr(deps.db, newPR.issue, newPR.ref, 'delivery-bot');
  invariant(pr.state === 'open');

  return pr;
}
