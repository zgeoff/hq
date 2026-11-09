import invariant from 'tiny-invariant';
import { requirePR } from '../require-pr.ts';
import { scheduleFinalReview } from '../schedule-final-review.ts';
import type { RunPr } from '../types.ts';
import type { NewRunPR } from './build-mock-new-run-pr.ts';
import { seedRunPR } from './seed-run-pr.ts';
import type { RunsDeps } from './types.ts';

interface FinalRunPRInput extends NewRunPR {
  sha: string;
  source: string;
}

export function seedFinalRunPR(deps: RunsDeps, input: Partial<FinalRunPRInput> = {}): RunPr {
  const { sha = 'abc1234', source = 'marker:kettle', ...prInput } = input;
  const pr = seedRunPR(deps, prInput);
  invariant(scheduleFinalReview(deps.db, { ref: pr.ref, sha, source, actor: 'delivery-bot', note: null }));

  return requirePR(deps.db, pr.ref);
}
