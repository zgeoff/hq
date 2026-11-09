import invariant from 'tiny-invariant';
import { closePr } from '../close-pr.ts';
import type { RunPr } from '../types.ts';
import type { TestDeps } from '../../test-utils/build-seeder.ts';
import type { NewRunPr } from './build-mock-new-run-pr.ts';
import { seedRunPr } from './seed-run-pr.ts';

interface MergedRunPrInput extends NewRunPr {
  mergedAt: string;
}

export function seedMergedRunPr(deps: TestDeps, input: Partial<MergedRunPrInput> = {}): RunPr {
  const pr = seedRunPr(deps, input);
  const facts = input.mergedAt === undefined ? undefined : { mergedAt: input.mergedAt, mergeSha: null };
  const merged = closePr(deps.db, pr.ref, { to: 'merged', actor: 'delivery-bot', facts });
  invariant(merged.state === 'merged');

  return merged;
}
