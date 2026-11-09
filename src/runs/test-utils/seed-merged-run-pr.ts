import invariant from 'tiny-invariant';
import { closePR } from '../close-pr.ts';
import type { RunPR } from '../types.ts';
import type { RunsDeps } from './types.ts';
import type { NewRunPR } from './build-mock-new-run-pr.ts';
import { seedRunPR } from './seed-run-pr.ts';

interface MergedRunPRInput extends NewRunPR {
  mergedAt: string;
}

export function seedMergedRunPR(deps: RunsDeps, input: Partial<MergedRunPRInput> = {}): RunPR {
  const pr = seedRunPR(deps, input);
  const facts = input.mergedAt === undefined ? undefined : { mergedAt: input.mergedAt, mergeSha: null };
  const merged = closePR(deps.db, pr.ref, { to: 'merged', actor: 'delivery-bot', facts });
  invariant(merged.state === 'merged');

  return merged;
}
