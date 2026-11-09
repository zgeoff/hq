import invariant from 'tiny-invariant';
import { requirePR } from '../require-pr.ts';
import { scheduleFinalReview } from '../schedule-final-review.ts';
import type { RunPr } from '../types.ts';
import type { NewRunPr } from './build-mock-new-run-pr.ts';
import { seedRunPr } from './seed-run-pr.ts';
import type { RunsDeps } from './types.ts';

interface FinalRunPrInput extends NewRunPr {
  sha: string;
  source: string;
}

export function seedFinalRunPr(deps: RunsDeps, input: Partial<FinalRunPrInput> = {}): RunPr {
  const { sha = 'abc1234', source = 'marker:kettle', ...prInput } = input;
  const pr = seedRunPr(deps, prInput);
  invariant(scheduleFinalReview(deps.db, { ref: pr.ref, sha, source, actor: 'delivery-bot', note: null }));

  return requirePR(deps.db, pr.ref);
}
